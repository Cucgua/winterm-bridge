import { api } from './api';
import { SocketService, socket } from './socket';

/**
 * Multi-instance socket registry for split-pane mode.
 *
 * The legacy single-session flow uses the global `socket` singleton. Split view
 * needs several sessions alive at once, each with its own WebSocket so their PTY
 * data streams stay isolated (the singleton's `onData` fans out to ALL callbacks,
 * which would make every pane show the same session). SocketManager keeps a
 * `sessionId → SocketService` map; each pane's TerminalView receives its own
 * instance and subscribes independently.
 *
 * The singleton is untouched — single-session tabs keep using it directly, so
 * existing behavior is preserved.
 */
class SocketManager {
  private sockets = new Map<string, SocketService>();

  /**
   * Connect (or reuse) a socket for a session. Mirrors App.connectSocket:
   * attachSession → connectWithToken. Idempotent — if already connected to the
   * same session, returns the existing instance without re-attaching.
   */
  async connect(sessionId: string): Promise<SocketService> {
    const existing = this.sockets.get(sessionId);
    if (existing && existing.isConnected) return existing;

    // Reuse a disconnected instance, or create a fresh one.
    const instance = existing ?? new SocketService();
    instance.remoteBaseUrl = socket.remoteBaseUrl; // inherit the configured server URL

    const { ws_url } = await api.attachSession(sessionId);
    await instance.connectWithToken(ws_url, sessionId);

    this.sockets.set(sessionId, instance);
    return instance;
  }

  /** Get the socket instance for a session, connected or not. */
  get(sessionId: string): SocketService | undefined {
    return this.sockets.get(sessionId);
  }

  /** Disconnect and drop the socket for one session. */
  async disconnect(sessionId: string): Promise<void> {
    const instance = this.sockets.get(sessionId);
    if (!instance) return;
    await instance.disconnect();
    this.sockets.delete(sessionId);
  }

  /** Disconnect every managed socket. Used when leaving split view. */
  async disconnectAll(): Promise<void> {
    const instances = [...this.sockets.values()];
    this.sockets.clear();
    await Promise.all(instances.map(instance => instance.disconnect()));
  }

  /** Which sessions currently have a live socket. */
  get connectedSessionIds(): string[] {
    return [...this.sockets.entries()]
      .filter(([, instance]) => instance.isConnected)
      .map(([sessionId]) => sessionId);
  }
}

export const socketManager = new SocketManager();
