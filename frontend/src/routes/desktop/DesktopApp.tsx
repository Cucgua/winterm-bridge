import { useState, useEffect, useCallback, useRef } from 'react';
import { AuthScreen } from '../../shared/components/AuthScreen';
import { SessionPicker } from '../../shared/components/SessionPicker';
import { TerminalView } from '../../shared/components/TerminalView';
import { api, SessionInfo } from '../../shared/core/api';
import { socket } from '../../shared/core/socket';
import { DesktopLayout } from './DesktopLayout';

type AuthState = 'loading' | 'awaiting_pin' | 'selecting_session' | 'authenticated';

export default function DesktopApp() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const initRef = useRef(false);

  // Initialize: validate token and load sessions
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      const savedToken = localStorage.getItem('winterm_token');

      if (!savedToken) {
        setAuthState('awaiting_pin');
        return;
      }

      try {
        const { valid } = await api.validateToken();
        if (!valid) {
          localStorage.removeItem('winterm_token');
          localStorage.removeItem('winterm_session');
          setAuthState('awaiting_pin');
          return;
        }

        const { sessions } = await api.listSessions();
        setSessions(sessions);
        setAuthState('selecting_session');
      } catch {
        localStorage.removeItem('winterm_token');
        localStorage.removeItem('winterm_session');
        setAuthState('awaiting_pin');
      }
    };

    init();
  }, []);

  // Socket event handlers
  useEffect(() => {
    const unsubOpen = socket.onOpen(() => {
      setIsConnected(true);
      setError('');
    });

    const unsubClose = socket.onClose(() => {
      setIsConnected(false);
    });

    const unsubError = socket.onError((errorMsg) => {
      setError(errorMsg);
      setIsConnected(false);
    });

    return () => {
      unsubOpen();
      unsubClose();
      unsubError();
    };
  }, []);

  // Attach to session (connect via WebSocket)
  const attachToSession = useCallback(async (sessionId: string) => {
    setIsConnecting(true);
    setError('');

    try {
      const { ws_url } = await api.attachSession(sessionId);
      socket.connectWithToken(ws_url, sessionId);
      setCurrentSessionId(sessionId);
      localStorage.setItem('winterm_session', sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to session');
      setAuthState('selecting_session');
      setCurrentSessionId(undefined);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // PIN authentication
  const handlePinSubmit = useCallback(async (pin: string) => {
    setError('');

    try {
      const { token } = await api.authenticate(pin);
      localStorage.setItem('winterm_token', token);

      const { sessions } = await api.listSessions();
      setSessions(sessions);
      setAuthState('selecting_session');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    }
  }, []);

  // Select existing session
  const handleSelectSession = useCallback(async (sessionId: string) => {
    setAuthState('authenticated');
    await attachToSession(sessionId);
  }, [attachToSession]);

  // Create new session
  const handleCreateSession = useCallback(async (title?: string) => {
    setError('');
    try {
      const { session } = await api.createSession({ title });
      setSessions(prev => [...prev, session]);
      setAuthState('authenticated');
      await attachToSession(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    }
  }, [attachToSession]);

  // Delete session
  const handleDeleteSession = useCallback(async (sessionId: string) => {
    if (sessionId === currentSessionId) {
      setError('Cannot delete current session');
      return;
    }

    try {
      await api.deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete session');
    }
  }, [currentSessionId]);

  // Switch to another session
  const handleSwitchSession = useCallback(async (sessionId: string) => {
    if (sessionId === currentSessionId) return;
    socket.disconnect();
    await attachToSession(sessionId);
  }, [currentSessionId, attachToSession]);

  // Logout
  const handleLogout = useCallback(() => {
    socket.disconnect();
    localStorage.removeItem('winterm_token');
    localStorage.removeItem('winterm_session');
    setSessions([]);
    setCurrentSessionId(undefined);
    setError('');
    setAuthState('awaiting_pin');
  }, []);

  // Back to session selection
  const handleBackToSessions = useCallback(() => {
    socket.disconnect();
    setCurrentSessionId(undefined);
    setAuthState('selecting_session');
  }, []);

  // Periodically refresh session list
  useEffect(() => {
    if (authState !== 'authenticated' || !currentSessionId) return;

    const refreshSessions = async () => {
      try {
        const { sessions } = await api.listSessions();
        setSessions(sessions);
      } catch {
        // ignore refresh errors
      }
    };

    const interval = setInterval(refreshSessions, 30000);
    return () => clearInterval(interval);
  }, [authState, currentSessionId]);

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
  if (isConnecting) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold mb-6">WinTerm Bridge</h1>
          <p className="text-gray-400">Connecting to session...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !currentSessionId) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold mb-6">WinTerm Bridge</h1>
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={handleBackToSessions}
            className="text-gray-400 hover:text-gray-300 underline"
          >
            Back to Sessions
          </button>
        </div>
      </div>
    );
  }

  // Terminal view
  return (
    <DesktopLayout
      onLogout={handleLogout}
      sessions={sessions}
      currentSessionId={currentSessionId}
      onSwitchSession={handleSwitchSession}
      onCreateSession={handleCreateSession}
      onDeleteSession={handleDeleteSession}
    >
      {currentSessionId && (
        <div className="w-full h-full relative">
          <TerminalView
            socket={socket}
            fontSize={14}
          />
          {!isConnected && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="text-center">
                <p className="text-gray-400 mb-4">Disconnected</p>
                <button
                  onClick={() => attachToSession(currentSessionId)}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Reconnect
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </DesktopLayout>
  );
}
