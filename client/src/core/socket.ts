import { WorkflowEvent } from './api';
// Tauri WebSocket plugin — routes through Rust, bypassing WebView mixed-content.
// Message shape: { type: "Text"|"Binary"|"Ping"|"Pong"|"Close", data: string|number[]|CloseFrame|null }
import WebSocket, { Message } from '@tauri-apps/plugin-websocket';

export interface ControlMessage {
  type: 'resize' | 'ping' | 'pong' | 'error' | 'title' | 'pause' | 'resume' | 'ai_summary' | 'ai_auto_action' | 'ai_workflow_event' | 'ai_goal_misaligned';
  cols?: number;
  rows?: number;
  message?: string;
  text?: string;
  // AI summary fields
  session_id?: string;
  tag?: string;
  description?: string;
  timestamp?: number;
  // Auto-action fields
  session_name?: string;
  actions?: { type: string; value: string }[];
  confidence?: number;
  success?: boolean;
  // Goal misalignment fields
  mismatch?: string;
  // Workflow event fields
  event?: WorkflowEvent;
}

/**
 * WebSocket Terminal Protocol v1.0
 *
 * Binary Frame: PTY data (stdin/stdout)
 * Text Frame: JSON control messages
 *
 * Control Messages:
 *   Client -> Server:
 *     {"type":"resize","cols":80,"rows":24}
 *     {"type":"ping"}
 *     {"type":"pause"}
 *     {"type":"resume"}
 *
 *   Server -> Client:
 *     {"type":"pong"}
 *     {"type":"title","text":"..."}
 *     {"type":"error","message":"..."}
 */
export class SocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | undefined;
  private keepAliveTimer: number | undefined;
  private currentSessionId: string = '';
  private textEncoder = new TextEncoder();

  // Flow control state
  private written = 0;
  private pending = 0;
  private readonly flowControl = {
    limit: 100000,
    highWater: 10,
    lowWater: 4,
  };

  // Terminal dimensions
  private terminalCols = 80;
  private terminalRows = 24;

  private onDataCallbacks: Set<(data: Uint8Array | string) => void> = new Set();
  private onControlCallbacks: Set<(msg: ControlMessage) => void> = new Set();
  private onOpenCallbacks: Set<() => void> = new Set();
  private onCloseCallbacks: Set<() => void> = new Set();
  private onErrorCallbacks: Set<(error: string) => void> = new Set();

  setTerminalSize(cols: number, rows: number): void {
    this.terminalCols = cols;
    this.terminalRows = rows;
  }

  /** Remote server URL (e.g. "http://host:port"). Required in Tauri — no same-origin fallback. */
  remoteBaseUrl = '';

  async connectWithToken(wsUrl: string, sessionId: string): Promise<void> {
    if (this.ws) {
      await this.disconnect();
    }

    this.currentSessionId = sessionId;

    // Build full WebSocket URL from remoteBaseUrl + relative wsUrl path
    let url: string;
    if (this.remoteBaseUrl) {
      try {
        const parsed = new URL(this.remoteBaseUrl);
        const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
        url = `${wsProtocol}//${parsed.host}${wsUrl}`;
      } catch {
        throw new Error(`Invalid remoteBaseUrl: ${this.remoteBaseUrl}`);
      }
    } else {
      throw new Error('remoteBaseUrl is required in Tauri client');
    }

    // Connect via Tauri WebSocket plugin (goes through Rust, no mixed-content issue)
    const ws = await WebSocket.connect(url);
    this.ws = ws;

    // Register message listener — handles text (control), binary (PTY), ping, close
    ws.addListener((msg: Message) => this.handleMessage(msg));

    // On successful connect: send initial resize + start keepalive
    this.sendResize(this.terminalCols, this.terminalRows);
    this.startKeepAlive();
    this.onOpenCallbacks.forEach(cb => cb());
  }

  private handleMessage(msg: Message): void {
    // Guard: only process if this ws is still the active instance
    if (this.ws !== this.getWsRef()) return;

    switch (msg.type) {
      case 'Text': {
        // JSON control message
        try {
          const controlMsg: ControlMessage = JSON.parse(msg.data as string);
          this.handleControlMessage(controlMsg);
        } catch {
          // Invalid control message, ignore
        }
        break;
      }
      case 'Binary': {
        // PTY output — Tauri gives us number[], xterm needs Uint8Array
        const data = new Uint8Array(msg.data as number[]);
        this.onDataCallbacks.forEach(cb => cb(data));
        break;
      }
      case 'Ping': {
        // Server sent a WS-level Ping frame.
        // The server (gorilla/websocket) sends pings every 30s and expects a Pong
        // within 120s or it closes the connection (pongWait).
        // We manually reply with Pong to be safe — Tauri may not auto-respond.
        const pingData = msg.data as number[];
        this.ws?.send({ type: 'Pong', data: pingData } as unknown as string)
          .catch(() => {});
        break;
      }
      case 'Pong': {
        // Heartbeat response — no action needed
        break;
      }
      case 'Close': {
        // Connection closed — read close code to distinguish reasons
        this.stopKeepAlive();
        const closeFrame = msg.data as { code: number; reason: string } | null;
        if (closeFrame) {
          // 4003 = access revoked, 4004 = session not found, 4100 = pty exited
          if (closeFrame.code === 4003 || closeFrame.code === 4004) {
            this.onErrorCallbacks.forEach(cb => cb(closeFrame.reason || 'connection closed'));
          }
        }
        this.onCloseCallbacks.forEach(cb => cb());
        break;
      }
    }
  }

  // Used by the stale-connection guard: returns whether ws is still current
  private getWsRef(): WebSocket | null {
    return this.ws;
  }

  private handleControlMessage(msg: ControlMessage): void {
    switch (msg.type) {
      case 'pong':
        // Heartbeat response, no action needed
        break;
      case 'title':
        // Window title update (optional)
        this.onControlCallbacks.forEach(cb => cb(msg));
        break;
      case 'error':
        // Error notification
        this.onErrorCallbacks.forEach(cb => cb(msg.message || 'Unknown error'));
        break;
      case 'ai_summary':
        // AI session summary update
        this.onControlCallbacks.forEach(cb => cb(msg));
        break;
      case 'ai_auto_action':
        // Auto-reply action notification
        this.onControlCallbacks.forEach(cb => cb(msg));
        break;
      case 'ai_workflow_event':
        // AI workflow state change notification
        this.onControlCallbacks.forEach(cb => cb(msg));
        break;
      case 'ai_goal_misaligned':
        // Goal misalignment notification
        this.onControlCallbacks.forEach(cb => cb(msg));
        break;
    }
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveTimer = window.setInterval(() => {
      // Application-level ping (text frame). Server replies with {"type":"pong"}.
      // This is separate from WS-level ping/pong handled in handleMessage.
      this.sendRaw(JSON.stringify({ type: 'ping' })).catch(() => {});
    }, 30000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = undefined;
    }
  }

  private async sendRaw(data: string): Promise<void> {
    if (this.ws) {
      try {
        await this.ws.send(data);
      } catch {
        // Send failed — connection likely closed
      }
    }
  }

  sendInput(data: string): void {
    if (this.ws) {
      // Convert string → Uint8Array → number[] for Tauri's WebSocket.send
      const encoded = this.textEncoder.encode(data);
      this.ws.send(Array.from(encoded)).catch(() => {});
    }
  }

  sendBinaryInput(data: Uint8Array): void {
    if (this.ws) {
      this.ws.send(Array.from(data)).catch(() => {});
    }
  }

  sendResize(cols: number, rows: number): void {
    if (this.ws) {
      this.terminalCols = cols;
      this.terminalRows = rows;
      const msg = JSON.stringify({ type: 'resize', cols, rows });
      this.sendRaw(msg);
    }
  }

  private sendPause(): void {
    if (this.ws) {
      this.sendRaw(JSON.stringify({ type: 'pause' }));
    }
  }

  private sendResume(): void {
    if (this.ws) {
      this.sendRaw(JSON.stringify({ type: 'resume' }));
    }
  }

  handleFlowControl(dataLength: number, onWriteComplete: () => void): boolean {
    const { limit, highWater, lowWater } = this.flowControl;
    this.written += dataLength;

    if (this.written > limit) {
      this.pending++;
      this.written = 0;

      if (this.pending > highWater) {
        this.sendPause();
      }

      const checkResume = () => {
        this.pending = Math.max(this.pending - 1, 0);
        if (this.pending < lowWater) {
          this.sendResume();
        }
        onWriteComplete();
      };

      setTimeout(checkResume, 0);
      return true;
    }

    return false;
  }

  onData(callback: (data: Uint8Array | string) => void) {
    this.onDataCallbacks.add(callback);
    return () => { this.onDataCallbacks.delete(callback); };
  }

  onControl(callback: (msg: ControlMessage) => void) {
    this.onControlCallbacks.add(callback);
    return () => { this.onControlCallbacks.delete(callback); };
  }

  onOpen(callback: () => void) {
    this.onOpenCallbacks.add(callback);
    return () => { this.onOpenCallbacks.delete(callback); };
  }

  onClose(callback: () => void) {
    this.onCloseCallbacks.add(callback);
    return () => { this.onCloseCallbacks.delete(callback); };
  }

  onError(callback: (error: string) => void) {
    this.onErrorCallbacks.add(callback);
    return () => { this.onErrorCallbacks.delete(callback); };
  }

  async disconnect(): Promise<void> {
    clearTimeout(this.reconnectTimer);
    this.stopKeepAlive();
    if (this.ws) {
      try {
        await this.ws.disconnect();
      } catch {
        // Already closed
      }
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws !== null;
  }

  get sessionId(): string {
    return this.currentSessionId;
  }
}

export const socket = new SocketService();
