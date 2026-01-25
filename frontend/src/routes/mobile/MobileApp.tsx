import { useState, useEffect, useCallback, useRef } from 'react';
import { Terminal } from 'xterm';
import { TerminalView } from '../../shared/components/TerminalView';
import { AuthScreen } from '../../shared/components/AuthScreen';
import { SessionPicker } from '../../shared/components/SessionPicker';
import { socket } from '../../shared/core/socket';
import { api, SessionInfo } from '../../shared/core/api';
import { useViewport } from '../../shared/hooks/useViewport';
import { useKeyboardStore } from '../../shared/stores/keyboardStore';
import { MobileLayout } from './MobileLayout';
import { VirtualKeyboardAccessory } from './components/VirtualKeyboardAccessory';
import { attachMobileHandlers } from './components/MobileTerminalHandler';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';
type AuthState = 'loading' | 'awaiting_pin' | 'selecting_session' | 'authenticated';

export default function MobileApp() {
  const [fontSize] = useState(16);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>();
  const [error, setError] = useState('');
  const viewport = useViewport();
  const { consumeModifiers } = useKeyboardStore();

  const isConnectingRef = useRef(false);
  const initRef = useRef(false);
  const termRef = useRef<Terminal | null>(null);

  // Initialize: validate token and load sessions
  useEffect(() => {
    // Prevent double initialization in React strict mode
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      const savedToken = localStorage.getItem('winterm_token');

      if (!savedToken) {
        setAuthState('awaiting_pin');
        return;
      }

      try {
        // Validate token via HTTP
        const { valid } = await api.validateToken();
        if (!valid) {
          localStorage.removeItem('winterm_token');
          localStorage.removeItem('winterm_session');
          setAuthState('awaiting_pin');
          return;
        }

        // Load sessions
        const { sessions } = await api.listSessions();
        setSessions(sessions);
        setAuthState('selecting_session');
      } catch (err) {
        console.error('[MobileApp] Init error:', err);
        localStorage.removeItem('winterm_token');
        localStorage.removeItem('winterm_session');
        setAuthState('awaiting_pin');
      }
    };

    init();
  }, []);

  // Connect to session via WebSocket with attachment token
  const connectToSession = useCallback(async (sessionId: string) => {
    if (isConnectingRef.current) {
      console.log('[MobileApp] Already connecting, skipping');
      return;
    }

    isConnectingRef.current = true;
    setConnectionStatus('connecting');
    setError('');

    try {
      // Get attachment token via HTTP
      const { attachment_token } = await api.attachSession(sessionId);

      // Connect WebSocket with attachment token
      socket.connectWithToken(attachment_token, sessionId);
      setCurrentSessionId(sessionId);
      localStorage.setItem('winterm_session', sessionId);
    } catch (err) {
      console.error('[MobileApp] Failed to connect to session:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect to session');
      setConnectionStatus('disconnected');
      // Go back to session selection on connection failure
      setAuthState('selecting_session');
      setCurrentSessionId(undefined);
    } finally {
      isConnectingRef.current = false;
    }
  }, []);

  // Socket event handlers
  useEffect(() => {
    const unsubOpen = socket.onOpen(() => {
      console.log('[MobileApp] Socket opened');
      setConnectionStatus('connected');
      setError('');
    });

    const unsubClose = socket.onClose(() => {
      console.log('[MobileApp] Socket closed');
      setConnectionStatus('disconnected');
    });

    const unsubError = socket.onError((errorMsg) => {
      console.error('[MobileApp] Socket error:', errorMsg);
      setError(errorMsg);
      setConnectionStatus('disconnected');
    });

    return () => {
      unsubOpen();
      unsubClose();
      unsubError();
    };
  }, []);

  // PIN authentication
  const handlePinSubmit = useCallback(async (pin: string) => {
    setError('');

    try {
      const { token } = await api.authenticate(pin);
      localStorage.setItem('winterm_token', token);

      // Load sessions
      const { sessions } = await api.listSessions();
      setSessions(sessions);
      setAuthState('selecting_session');
    } catch (err) {
      console.error('[MobileApp] Auth error:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
    }
  }, []);

  // Select existing session
  const handleSelectSession = useCallback(async (sessionId: string) => {
    setAuthState('authenticated');
    await connectToSession(sessionId);
  }, [connectToSession]);

  // Create new session
  const handleCreateSession = useCallback(async (title?: string) => {
    setError('');
    try {
      const { session } = await api.createSession(title);
      setSessions(prev => [...prev, session]);
      setAuthState('authenticated');
      await connectToSession(session.id);
    } catch (err) {
      console.error('[MobileApp] Create session error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create session');
    }
  }, [connectToSession]);

  // Delete session
  const handleDeleteSession = useCallback(async (sessionId: string) => {
    // Don't allow deleting current session
    if (sessionId === currentSessionId) {
      setError('Cannot delete current session');
      return;
    }

    try {
      await api.deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err) {
      console.error('[MobileApp] Delete session error:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete session');
    }
  }, [currentSessionId]);

  // Logout - reset all state
  const handleLogout = useCallback(() => {
    console.log('[MobileApp] Logging out');
    localStorage.removeItem('winterm_token');
    localStorage.removeItem('winterm_session');
    socket.disconnect();
    // Reset all state
    setSessions([]);
    setCurrentSessionId(undefined);
    setConnectionStatus('disconnected');
    setError('');
    setAuthState('awaiting_pin');
  }, []);

  const handleTerminalReady = useCallback((term: Terminal, container: HTMLElement) => {
    termRef.current = term;
    attachMobileHandlers(term, container, socket);
  }, []);

  const handleSendKey = useCallback((key: string) => {
    socket.send(key);
    consumeModifiers();
  }, [consumeModifiers]);

  const handleScrollPage = useCallback((direction: 'up' | 'down') => {
    if (termRef.current) {
      termRef.current.scrollPages(direction === 'up' ? -1 : 1);
    }
  }, []);

  // Loading state
  if (authState === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold mb-6">WinTerm Bridge</h1>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // PIN authentication
  if (authState === 'awaiting_pin') {
    return <AuthScreen onSubmit={handlePinSubmit} error={error} />;
  }

  // Session selection
  if (authState === 'selecting_session') {
    return (
      <SessionPicker
        sessions={sessions}
        onSelect={handleSelectSession}
        onCreate={handleCreateSession}
        onDelete={handleDeleteSession}
        onLogout={handleLogout}
      />
    );
  }

  // Connecting state
  if (connectionStatus === 'connecting') {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold mb-6">WinTerm Bridge</h1>
          <p className="text-gray-400">Connecting to session...</p>
        </div>
      </div>
    );
  }

  // Disconnected state (with current session - offer reconnect)
  if (connectionStatus === 'disconnected' && currentSessionId) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold mb-6">WinTerm Bridge</h1>
          <p className="text-gray-400 mb-4">Connection lost</p>
          {error && <p className="text-red-500 mb-4">{error}</p>}
          <button
            onClick={() => connectToSession(currentSessionId)}
            className="text-green-500 hover:text-green-400 underline mr-4"
          >
            Reconnect
          </button>
          <button
            onClick={() => {
              setAuthState('selecting_session');
              setCurrentSessionId(undefined);
              setConnectionStatus('disconnected');
            }}
            className="text-gray-400 hover:text-gray-300 underline"
          >
            Back to Sessions
          </button>
        </div>
      </div>
    );
  }

  // Disconnected state (no session - shouldn't happen, go back to session selection)
  if (connectionStatus === 'disconnected' && !currentSessionId) {
    // This shouldn't happen, but handle it gracefully
    if (authState === 'authenticated') {
      setAuthState('selecting_session');
    }
    return null;
  }

  // Terminal view (connected)
  return (
    <MobileLayout
      viewportHeight={viewport.height}
      keyboardVisible={viewport.keyboardVisible}
      onLogout={handleLogout}
    >
      <div className="flex-1 overflow-hidden">
        <TerminalView
          socket={socket}
          fontSize={fontSize}
          onTerminalReady={handleTerminalReady}
        />
      </div>
      <VirtualKeyboardAccessory onSendKey={handleSendKey} onScrollPage={handleScrollPage} />
    </MobileLayout>
  );
}
