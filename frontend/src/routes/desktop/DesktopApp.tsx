import { useState, useEffect, useCallback, useRef } from 'react';
import { AuthScreen } from '../../shared/components/AuthScreen';
import { DesktopSessionPicker } from './DesktopSessionPicker';
import { TerminalView } from '../../shared/components/TerminalView';
import { api, SessionInfo } from '../../shared/core/api';
import { socket } from '../../shared/core/socket';
import { DesktopLayout } from './DesktopLayout';
import { useI18n } from '../../shared/i18n';

type AuthState = 'loading' | 'awaiting_pin' | 'selecting_session' | 'authenticated';

export default function DesktopApp() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  // Track if we're switching between sessions (to avoid full-screen connecting state)
  const [isSwitching, setIsSwitching] = useState(false);
  const { t } = useI18n();

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

  // Toggle session persistence
  const handleTogglePersist = useCallback(async (sessionId: string, isPersistent: boolean) => {
    // Optimistic update: toggle UI immediately
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, is_persistent: !isPersistent } : s
    ));

    try {
      if (isPersistent) {
        await api.unpersistSession(sessionId);
      } else {
        await api.persistSession(sessionId);
      }
    } catch (err) {
      // Rollback on failure
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, is_persistent: isPersistent } : s
      ));
      setError(err instanceof Error ? err.message : 'Failed to update persistence');
    }
  }, []);

  // Switch to another session
  const handleSwitchSession = useCallback(async (sessionId: string) => {
    if (sessionId === currentSessionId) return;

    // Use isSwitching to avoid full-screen connecting state (keeps DesktopLayout mounted)
    setIsSwitching(true);
    setError('');
    socket.disconnect();

    try {
      const { ws_url } = await api.attachSession(sessionId);
      socket.connectWithToken(ws_url, sessionId);
      setCurrentSessionId(sessionId);
      localStorage.setItem('winterm_session', sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to session');
    } finally {
      setIsSwitching(false);
    }
  }, [currentSessionId]);

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
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 mb-6 shadow-lg shadow-green-500/20">
            <svg className="w-8 h-8 text-white animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent mb-3">{t('app_name')}</h1>
          <p className="text-gray-400">{t('loading')}</p>
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
      <DesktopSessionPicker
        sessions={sessions}
        onSelect={handleSelectSession}
        onCreate={handleCreateSession}
        onDelete={handleDeleteSession}
        onLogout={handleLogout}
        onTogglePersist={handleTogglePersist}
      />
    );
  }

  // Connecting state (only for initial connection, not session switch)
  if (isConnecting && !currentSessionId) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <div className="text-center p-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 mb-6 shadow-lg shadow-green-500/20">
            <svg className="w-8 h-8 text-white animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent mb-3">{t('app_name')}</h1>
          <p className="text-gray-400">{t('session_connecting')}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !currentSessionId) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <div className="text-center p-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 mb-6 shadow-lg shadow-red-500/20">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent mb-3">{t('app_name')}</h1>
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={handleBackToSessions}
            className="text-gray-400 hover:text-white transition-colors underline"
          >
            {t('session_back')}
          </button>
        </div>
      </div>
    );
  }

  // Terminal view
  return (
    <DesktopLayout
      onLogout={handleLogout}
      onBackToSessions={handleBackToSessions}
      sessions={sessions}
      currentSessionId={currentSessionId}
      onSwitchSession={handleSwitchSession}
      onCreateSession={handleCreateSession}
      onDeleteSession={handleDeleteSession}
    >
      {currentSessionId && (
        <div className="w-full h-full relative">
          <TerminalView
            key={currentSessionId}
            socket={socket}
            fontSize={14}
          />
          {isSwitching && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm">
              <p className="text-gray-400">{t('session_switching')}</p>
            </div>
          )}
          {!isSwitching && !isConnected && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="text-center">
                <p className="text-gray-400 mb-4">{t('session_disconnected')}</p>
                <button
                  onClick={() => attachToSession(currentSessionId)}
                  className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-lg font-medium transition-all shadow-lg"
                >
                  {t('reconnect')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </DesktopLayout>
  );
}
