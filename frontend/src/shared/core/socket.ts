export interface ControlMessage {
  type: 'resize' | 'ping' | 'pong' | 'error' | 'title' | 'pause' | 'resume' | 'ai_summary';
  cols?: number;
  rows?: number;
  message?: string;
  text?: string;
  // AI summary fields
  session_id?: string;
  tag?: string;
  description?: string;
  timestamp?: number;
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

  private onDataCallbacks: Set<(data: ArrayBuffer | string) => void> = new Set();
  private onControlCallbacks: Set<(msg: ControlMessage) => void> = new Set();
  private onOpenCallbacks: Set<() => void> = new Set();
  private onCloseCallbacks: Set<() => void> = new Set();
  private onErrorCallbacks: Set<(error: string) => void> = new Set();

  setTerminalSize(cols: number, rows: number): void {
    this.terminalCols = cols;
    this.terminalRows = rows;
  }

  connectWithToken(wsUrl: string, sessionId: string): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.currentSessionId = sessionId;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${wsProtocol}//${window.location.host}${wsUrl}`;

    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      // Send initial resize to sync terminal size
      this.sendResize(this.terminalCols, this.terminalRows);

      this.startKeepAlive();
      this.onOpenCallbacks.forEach(cb => cb());
    };

    this.ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary Frame = PTY output
        this.onDataCallbacks.forEach(cb => cb(event.data));
      } else if (typeof event.data === 'string') {
        // Text Frame = JSON control message
        try {
          const msg: ControlMessage = JSON.parse(event.data);
          this.handleControlMessage(msg);
        } catch {
          // Invalid control message, ignore
        }
      }
    };

    this.ws.onclose = () => {
      this.stopKeepAlive();
      this.onCloseCallbacks.forEach(cb => cb());
    };

    this.ws.onerror = () => {
      this.onErrorCallbacks.forEach(cb => cb('WebSocket connection failed'));
    };
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
    }
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveTimer = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = undefined;
    }
  }

  sendInput(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const payload = this.textEncoder.encode(data);
      this.ws.send(payload);
    }
  }

  sendBinaryInput(data: Uint8Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  sendResize(cols: number, rows: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.terminalCols = cols;
      this.terminalRows = rows;

      const msg = JSON.stringify({ type: 'resize', cols, rows });
      this.ws.send(msg);
    }
  }

  private sendPause(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'pause' }));
    }
  }

  private sendResume(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'resume' }));
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

  onData(callback: (data: ArrayBuffer | string) => void) {
    this.onDataCallbacks.add(callback);
    return () => this.onDataCallbacks.delete(callback);
  }

  onControl(callback: (msg: ControlMessage) => void) {
    this.onControlCallbacks.add(callback);
    return () => this.onControlCallbacks.delete(callback);
  }

  onOpen(callback: () => void) {
    this.onOpenCallbacks.add(callback);
    return () => this.onOpenCallbacks.delete(callback);
  }

  onClose(callback: () => void) {
    this.onCloseCallbacks.add(callback);
    return () => this.onCloseCallbacks.delete(callback);
  }

  onError(callback: (error: string) => void) {
    this.onErrorCallbacks.add(callback);
    return () => this.onErrorCallbacks.delete(callback);
  }

  disconnect(): void {
    clearTimeout(this.reconnectTimer);
    this.stopKeepAlive();
    this.ws?.close();
    this.ws = null;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get sessionId(): string {
    return this.currentSessionId;
  }
}

export const socket = new SocketService();
