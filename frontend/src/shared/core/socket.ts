export interface ControlMessage {
  type: 'resize' | 'ping' | 'pong' | 'error';
  payload: unknown;
}

export class SocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | undefined;
  private currentSessionId: string = '';

  private onDataCallbacks: Set<(data: ArrayBuffer | string) => void> = new Set();
  private onControlCallbacks: Set<(msg: ControlMessage) => void> = new Set();
  private onOpenCallbacks: Set<() => void> = new Set();
  private onCloseCallbacks: Set<() => void> = new Set();
  private onErrorCallbacks: Set<(error: string) => void> = new Set();

  /**
   * Connect to WebSocket with an attachment token
   */
  connectWithToken(attachmentToken: string, sessionId: string): void {
    // Close existing connection if any
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.currentSessionId = sessionId;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${wsProtocol}//${window.location.host}/ws?attachment_token=${encodeURIComponent(attachmentToken)}`;

    console.log('[Socket] Connecting with attachment token to session', sessionId.slice(0, 8));

    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      console.log('[Socket] Connected to session', sessionId.slice(0, 8));
      this.onOpenCallbacks.forEach(cb => cb());
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data) as ControlMessage;
          if (msg.type) {
            console.log('[Socket] Control message:', msg.type);
            this.onControlCallbacks.forEach(cb => cb(msg));
            return;
          }
        } catch {
          // Not JSON, treat as text data
        }
        console.log('[Socket] Text data:', event.data.length, 'chars');
        this.onDataCallbacks.forEach(cb => cb(event.data));
      } else {
        console.log('[Socket] Binary data:', event.data.byteLength, 'bytes');
        this.onDataCallbacks.forEach(cb => cb(event.data));
      }
    };

    this.ws.onclose = (event) => {
      console.log('[Socket] Disconnected', event.code, event.reason);
      this.onCloseCallbacks.forEach(cb => cb());
    };

    this.ws.onerror = () => {
      console.error('[Socket] Connection error');
      this.onErrorCallbacks.forEach(cb => cb('WebSocket connection failed'));
    };
  }

  /**
   * Send binary data or text to the terminal
   */
  send(data: ArrayBuffer | string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      console.warn('[Socket] Cannot send, not connected');
    }
  }

  /**
   * Send resize command
   */
  sendResize(cols: number, rows: number): void {
    this.sendControl({
      type: 'resize',
      payload: { cols, rows },
    });
  }

  /**
   * Send a control message
   */
  sendControl(msg: ControlMessage): void {
    console.log('[Socket] Sending control:', msg.type);
    this.send(JSON.stringify(msg));
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
