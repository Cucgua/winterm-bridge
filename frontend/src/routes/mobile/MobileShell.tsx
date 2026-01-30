import { useState, useEffect, useCallback, useRef } from 'react';
import { Terminal } from 'xterm';
import VConsole from 'vconsole';
import { AuthScreen } from '../../shared/components/AuthScreen';
import { SessionPicker } from '../../shared/components/SessionPicker';
import { socket } from '../../shared/core/socket';
import { api, SessionInfo } from '../../shared/core/api';
import { useSettingsStore } from '../../shared/stores/settingsStore';
import { useKeyboardStore } from '../../shared/stores/keyboardStore';
import { StatusBar } from './components/StatusBar';
import { ConnectionStatus } from './components/ConnectionIndicator';
import { MobileTerminalLayer } from './components/MobileTerminalLayer';
import { KeyboardBar } from './components/KeyboardBar';

type AuthState = 'loading' | 'unauthenticated' | 'selecting_session' | 'ready';

// Hook to track visualViewport height for keyboard handling
function useViewportHeight(onKeyboardClose?: () => void) {
  const [height, setHeight] = useState<number | null>(null);
  const initialHeightRef = useRef<number | null>(null);
  const wasKeyboardOpenRef = useRef(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }

    // Store initial height on first load
    if (initialHeightRef.current === null) {
      initialHeightRef.current = viewport.height;
    }

    const updateHeight = () => {
      const currentHeight = viewport.height;
      setHeight(currentHeight);

      // Scroll page back to top to eliminate gap
      if (viewport.offsetTop > 0) {
        window.scrollTo(0, 0);
      }

      // Detect keyboard close: height restored to near initial
      const initialHeight = initialHeightRef.current;
      if (initialHeight) {
        const heightDiff = initialHeight - currentHeight;
        const isKeyboardOpen = heightDiff > 100;

        if (wasKeyboardOpenRef.current && !isKeyboardOpen) {
          // Keyboard just closed
          onKeyboardClose?.();
        }
        wasKeyboardOpenRef.current = isKeyboardOpen;
      }
    };

    updateHeight();
    viewport.addEventListener('resize', updateHeight);
    viewport.addEventListener('scroll', updateHeight);

    return () => {
      viewport.removeEventListener('resize', updateHeight);
      viewport.removeEventListener('scroll', updateHeight);
    };
  }, [onKeyboardClose]);

  return height;
}

export default function MobileShell() {
  // Initialize vConsole for mobile debugging
  useEffect(() => {
    const vConsole = new VConsole();
    return () => vConsole.destroy();
  }, []);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [authError, setAuthError] = useState('');
  const [isInputActive, setIsInputActive] = useState(false);
  const termRef = useRef<Terminal | null>(null);
  const isConnectingRef = useRef(false);
  const initRef = useRef(false);

  const {
    autoReconnect,
    lastSessionId,
    defaultWorkingDirectory,
    fontSize,
    displayMode,
    fixedTerminalSize,
    setLastSessionId,
  } = useSettingsStore();

  const { consumeModifiers } = useKeyboardStore();

  // Handle keyboard close detection
  const handleKeyboardClose = useCallback(() => {
    setIsInputActive(false);
  }, []);

  // Track viewport height for keyboard handling
  const viewportHeight = useViewportHeight(handleKeyboardClose);

  const connectToSession = useCallback(async (sessionId: string) => {
    if (isConnectingRef.current) return;
    isConnectingRef.current = true;
    setConnectionStatus('connecting');
    setError('');

    try {
      const { ws_url } = await api.attachSession(sessionId);
      socket.connectWithToken(ws_url, sessionId);
      setCurrentSessionId(sessionId);
      setLastSessionId(sessionId);
      localStorage.setItem('winterm_session', sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setConnectionStatus('disconnected');
      setAuthState('selecting_session');
      setCurrentSessionId(undefined);
    } finally {
      isConnectingRef.current = false;
    }
  }, [setLastSessionId]);

  // Initialize: validate token and load sessions
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      try {
        const validateResult = await api.validateToken();
        if (!validateResult.valid) {
          setAuthState('unauthenticated');
          return;
        }

        const { sessions: sessionList } = await api.listSessions();
        setSessions(sessionList);

        // Auto-reconnect logic
        if (autoReconnect && lastSessionId) {
          const exists = sessionList.some(s => s.id === lastSessionId);
          if (exists) {
            setAuthState('ready');
            connectToSession(lastSessionId);
            return;
          }
        }

        // Create default session if none exist
        if (sessionList.length === 0) {
          const { session: newSession } = await api.createSession({ workingDirectory: defaultWorkingDirectory });
          setSessions([newSession]);
          setAuthState('ready');
          connectToSession(newSession.id);
        } else {
          setAuthState('selecting_session');
        }
      } catch {
        setAuthState('unauthenticated');
      }
    };

    init();
  }, [autoReconnect, lastSessionId, defaultWorkingDirectory, connectToSession]);

  // Socket event handlers
  useEffect(() => {
    const unsubOpen = socket.onOpen(() => {
      setConnectionStatus('connected');
      setError('');
    });

    const unsubClose = socket.onClose(() => {
      setConnectionStatus('disconnected');
    });

    const unsubError = socket.onError((errorMsg) => {
      setError(errorMsg);
      setConnectionStatus('disconnected');
    });

    return () => {
      unsubOpen();
      unsubClose();
      unsubError();
    };
  }, []);

  const handleAuth = async (pin: string) => {
    try {
      setAuthError('');
      const { token } = await api.authenticate(pin);
      localStorage.setItem('winterm_token', token);
      const { sessions: sessionList } = await api.listSessions();
      setSessions(sessionList);
      if (sessionList.length === 0) {
        const { session: newSession } = await api.createSession({ workingDirectory: defaultWorkingDirectory });
        setSessions([newSession]);
        setAuthState('ready');
        connectToSession(newSession.id);
      } else {
        setAuthState('selecting_session');
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed');
    }
  };

  const handleSelectSession = (sessionId: string) => {
    setAuthState('ready');
    connectToSession(sessionId);
  };

  const handleCreateSession = async (title?: string) => {
    const { session: newSession } = await api.createSession({
      title,
      workingDirectory: defaultWorkingDirectory
    });
    setSessions(prev => [...prev, newSession]);
    setAuthState('ready');
    connectToSession(newSession.id);
  };

  const handleDeleteSession = async (sessionId: string) => {
    await api.deleteSession(sessionId);
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  };

  const handleTogglePersist = async (sessionId: string, isPersistent: boolean) => {
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
    } catch {
      // Rollback on failure
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, is_persistent: isPersistent } : s
      ));
    }
  };

  const handleLogout = () => {
    socket.disconnect();
    localStorage.removeItem('winterm_token');
    localStorage.removeItem('winterm_session');
    setAuthState('unauthenticated');
    setConnectionStatus('disconnected');
    setCurrentSessionId(undefined);
    setSessions([]);
  };

  const handleTerminalReady = useCallback((term: Terminal) => {
    termRef.current = term;
  }, []);

  const handleReconnect = () => {
    if (currentSessionId) {
      connectToSession(currentSessionId);
    }
  };

  const handleBackToSessions = useCallback(async () => {
    socket.disconnect();
    setCurrentSessionId(undefined);
    // Refresh session list
    try {
      const { sessions: sessionList } = await api.listSessions();
      setSessions(sessionList);
    } catch {
      // ignore refresh errors
    }
    setAuthState('selecting_session');
  }, []);

  const handleSendKey = useCallback((key: string) => {
    const { modifiers } = useKeyboardStore.getState();
    let finalKey = key;

    // Apply Ctrl modifier for single characters
    if (modifiers.ctrl !== 'idle' && key.length === 1) {
      const code = key.charCodeAt(0);
      if (code >= 97 && code <= 122) {
        finalKey = String.fromCharCode(code - 96);
      } else if (code >= 65 && code <= 90) {
        finalKey = String.fromCharCode(code - 64);
      }
    }

    // Apply Alt modifier
    if (modifiers.alt !== 'idle') {
      finalKey = `\x1b${finalKey}`;
    }

    socket.sendInput(finalKey);
    consumeModifiers();
  }, [consumeModifiers]);

  const handleInputToggle = useCallback(() => {
    setIsInputActive(prev => !prev);
  }, []);

  // Auth screen
  if (authState === 'unauthenticated') {
    return (
      <div className="h-[100dvh] bg-black">
        <AuthScreen onSubmit={handleAuth} error={authError} />
      </div>
    );
  }

  // Loading
  if (authState === 'loading') {
    return (
      <div className="h-[100dvh] bg-black flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  // Session picker
  if (authState === 'selecting_session') {
    return (
      <div className="h-[100dvh] bg-black">
        <SessionPicker
          sessions={sessions}
          onSelect={handleSelectSession}
          onCreate={handleCreateSession}
          onDelete={handleDeleteSession}
          onLogout={handleLogout}
          onTogglePersist={handleTogglePersist}
        />
      </div>
    );
  }

  // Main terminal view
  return (
    <div
      className="flex flex-col bg-black overflow-hidden fixed inset-0"
      style={{ height: viewportHeight ? `${viewportHeight}px` : '100dvh' }}
    >
      {/* StatusBar */}
      <StatusBar
        status={connectionStatus}
        onReconnect={handleReconnect}
        onLogout={handleLogout}
        onBackToSessions={handleBackToSessions}
      />

      {/* Error banner */}
      {error && (
        <div className="bg-red-900/50 text-red-300 text-sm px-3 py-2 shrink-0">
          {error}
        </div>
      )}

      {/* Terminal layer */}
      <MobileTerminalLayer
        socket={socket}
        fontSize={fontSize}
        fixedSize={displayMode === 'fixed' ? fixedTerminalSize : undefined}
        isInputActive={isInputActive}
        onTerminalReady={handleTerminalReady}
      />

      {/* KeyboardBar */}
      <KeyboardBar
        onSendKey={handleSendKey}
        isInputActive={isInputActive}
        onInputToggle={handleInputToggle}
      />
    </div>
  );
}
