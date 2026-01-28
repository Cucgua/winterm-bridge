export interface ControlMessage {
  type: 'resize' | 'ping' | 'pong' | 'error';
  payload: unknown;
}

/**
 * ttyd WebSocket Protocol:
 *
 * Handshake (连接后立即发送，无前缀):
 *   JSON: { AuthToken, columns, rows }
 *
 * Client -> Server (带前缀):
 *   '0' + data  = PTY input (用户输入)
 *   '1' + json  = Resize { columns, rows }
 *   '2'         = Pause output (流控制 - 高水位)
 *   '3'         = Resume output (流控制 - 低水位)
 *
 * Server -> Client (带前缀):
 *   '0' + data  = PTY output
 *   '1' + title = Set window title
 *   '2' + json  = Set preferences
 */
export class SocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | undefined;
  private keepAliveTimer: number | undefined;
  private currentSessionId: string = '';
  private textEncoder = new TextEncoder();
  private textDecoder = new TextDecoder();

  // Debug logging control
  private debugEnabled = true;

  // Flow control state
  private written = 0;
  private pending = 0;
  private readonly flowControl = {
    limit: 100000,
    highWater: 10,
    lowWater: 4,
  };

  // Terminal dimensions (for handshake)
  private terminalCols = 80;
  private terminalRows = 24;

  private onDataCallbacks: Set<(data: ArrayBuffer | string) => void> = new Set();
  private onControlCallbacks: Set<(msg: ControlMessage) => void> = new Set();
  private onOpenCallbacks: Set<() => void> = new Set();
  private onCloseCallbacks: Set<() => void> = new Set();
  private onErrorCallbacks: Set<(error: string) => void> = new Set();

  /**
   * Set terminal dimensions (call before connect for handshake)
   */
  setTerminalSize(cols: number, rows: number): void {
    this.terminalCols = cols;
    this.terminalRows = rows;
  }

  /**
   * Enable/disable debug logging
   */
  setDebug(enabled: boolean): void {
    this.debugEnabled = enabled;
    console.log(`[Socket] Debug logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Format data for logging (escape control chars, truncate if needed)
   */
  private formatForLog(data: string | Uint8Array, maxLen = 100): string {
    let str: string;
    if (data instanceof Uint8Array) {
      str = this.textDecoder.decode(data);
    } else {
      str = data;
    }

    // Escape control characters for readability
    const escaped = str
      .replace(/\x1b/g, '\\e')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t');

    if (escaped.length > maxLen) {
      return escaped.slice(0, maxLen) + `... (${str.length} bytes)`;
    }
    return escaped;
  }

  /**
   * Log send operation
   */
  private logSend(type: string, data?: string | Uint8Array): void {
    if (!this.debugEnabled) return;
    const timestamp = new Date().toISOString().slice(11, 23);
    if (data) {
      console.log(`[Socket TX ${timestamp}] ${type}: ${this.formatForLog(data)}`);
    } else {
      console.log(`[Socket TX ${timestamp}] ${type}`);
    }
  }

  /**
   * Log receive operation
   */
  private logRecv(type: string, data?: string | Uint8Array): void {
    if (!this.debugEnabled) return;
    const timestamp = new Date().toISOString().slice(11, 23);
    if (data) {
      console.log(`[Socket RX ${timestamp}] ${type}: ${this.formatForLog(data)}`);
    } else {
      console.log(`[Socket RX ${timestamp}] ${type}`);
    }
  }

  connectWithToken(ttydUrl: string, sessionId: string): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.currentSessionId = sessionId;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${wsProtocol}//${window.location.host}${ttydUrl}`;

    console.log('[Socket] Connecting to ttyd:', url, 'session', sessionId.slice(0, 8));

    this.ws = new WebSocket(url, ['tty']);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      console.log('[Socket] Connected to session', sessionId.slice(0, 8));

      // Send handshake: AuthToken + initial terminal size
      const handshake = JSON.stringify({
        AuthToken: sessionId,
        columns: this.terminalCols,
        rows: this.terminalRows,
      });
      this.ws?.send(this.textEncoder.encode(handshake));
      this.logSend('HANDSHAKE', handshake);

      this.startKeepAlive();
      this.onOpenCallbacks.forEach(cb => cb());
    };

    // Server -> Client: messages have command prefix
    this.ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        const data = new Uint8Array(event.data);
        if (data.length > 0) {
          const cmd = data[0];
          const payload = data.slice(1);

          switch (cmd) {
            case 0x30: // '0' - PTY output
              this.logRecv('PTY_OUTPUT', payload);
              this.onDataCallbacks.forEach(cb => cb(payload.buffer));
              break;
            case 0x31: // '1' - Set window title
              this.logRecv('TITLE', payload);
              break;
            case 0x32: // '2' - Set preferences
              this.logRecv('PREFS', payload);
              break;
            default:
              this.logRecv('UNKNOWN', payload);
          }
        }
      } else if (typeof event.data === 'string') {
        // Text frame handling
        if (event.data.length > 0) {
          const cmd = event.data.charCodeAt(0);
          const payload = event.data.slice(1);

          if (cmd === 0x30) { // '0'
            this.logRecv('PTY_OUTPUT (text)', payload);
            this.onDataCallbacks.forEach(cb => cb(payload));
          } else if (cmd === 0x31) { // '1' - title
            this.logRecv('TITLE (text)', payload);
          }
        }
      }
    };

    this.ws.onclose = (event) => {
      console.log('[Socket] Disconnected', event.code, event.reason);
      this.stopKeepAlive();
      this.onCloseCallbacks.forEach(cb => cb());
    };

    this.ws.onerror = () => {
      console.error('[Socket] Connection error');
      this.onErrorCallbacks.forEach(cb => cb('WebSocket connection failed'));
    };
  }

  /**
   * Start keepalive timer to prevent idle timeout
   */
  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveTimer = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Send '0' + empty payload as keepalive (valid per ttyd protocol)
        const buffer = new Uint8Array(1);
        buffer[0] = 0x30; // '0' prefix with no data
        this.ws.send(buffer);
      }
    }, 30000); // Every 30 seconds (less aggressive)
  }

  /**
   * Stop keepalive timer
   */
  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = undefined;
    }
  }

  /**
   * Send input to terminal (with '0' prefix per ttyd protocol)
   */
  sendInput(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Prefix '0' (0x30) + data
      const payload = this.textEncoder.encode(data);
      const buffer = new Uint8Array(payload.length + 1);
      buffer[0] = 0x30; // '0'
      buffer.set(payload, 1);
      this.ws.send(buffer);
      this.logSend('PTY_INPUT', data);
    }
  }

  /**
   * Send binary input to terminal (with '0' prefix)
   */
  sendBinaryInput(data: Uint8Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const buffer = new Uint8Array(data.length + 1);
      buffer[0] = 0x30; // '0'
      buffer.set(data, 1);
      this.ws.send(buffer);
      this.logSend('PTY_INPUT (binary)', data);
    }
  }

  /**
   * Send resize command (with '1' prefix per ttyd protocol)
   */
  sendResize(cols: number, rows: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Update stored dimensions
      this.terminalCols = cols;
      this.terminalRows = rows;

      // Prefix '1' (0x31) + JSON
      const payload = JSON.stringify({ columns: cols, rows: rows });
      const encoded = this.textEncoder.encode(payload);
      const buffer = new Uint8Array(encoded.length + 1);
      buffer[0] = 0x31; // '1'
      buffer.set(encoded, 1);
      this.ws.send(buffer);
      this.logSend('RESIZE', payload);
    }
  }

  /**
   * Send pause command (flow control - high water)
   */
  private sendPause(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(this.textEncoder.encode('2'));
      this.logSend('PAUSE');
    }
  }

  /**
   * Send resume command (flow control - low water)
   */
  private sendResume(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(this.textEncoder.encode('3'));
      this.logSend('RESUME');
    }
  }

  /**
   * Handle flow control when writing data to terminal
   */
  handleFlowControl(dataLength: number, onWriteComplete: () => void): boolean {
    const { limit, highWater, lowWater } = this.flowControl;
    this.written += dataLength;

    if (this.written > limit) {
      this.pending++;
      this.written = 0;

      if (this.pending > highWater) {
        this.sendPause();
      }

      // Return callback for when write completes
      const checkResume = () => {
        this.pending = Math.max(this.pending - 1, 0);
        if (this.pending < lowWater) {
          this.sendResume();
        }
        onWriteComplete();
      };

      // Caller should call checkResume after terminal.write completes
      setTimeout(checkResume, 0);
      return true; // Flow control active
    }

    return false; // No flow control needed
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
