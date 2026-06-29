import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { TerminalView } from './components/TerminalView';
import { TabBar, TabInfo } from './components/TabBar';
import { AIPanel } from './components/AIPanel';
import { FileManager } from './components/FileManager';
import { IDEContextPanel } from './components/IDEContextPanel';
import { SessionSelectPage } from './components/SessionSelectPage';
import { SaveProjectDialog } from './components/SaveProjectDialog';
import { ConfirmDialog, type ConfirmDialogRequest } from './components/ConfirmDialog';
import { SessionAttentionToasts, type SessionAttentionToast } from './components/SessionAttentionToasts';
import { TerminalOverlayDrawer, TerminalOverlayHost } from './components/TerminalOverlay';
import { TrellisPanel } from './components/TrellisPanel';
import { api, SessionInfo } from './core/api';
import { socket, ControlMessage } from './core/socket';
import { useI18n } from './i18n/i18nStore';
import { useServerStore } from './stores/serverStore';
import { useAIStore } from './stores/aiStore';
import {
  TRELLIS_PANEL_MAX_WIDTH,
  TRELLIS_PANEL_MIN_WIDTH,
  useSettingsStore,
} from './stores/settingsStore';
import { useTheme } from './hooks/useTheme';
import { useZoomLevel } from './hooks/useZoomLevel';

type AppState = 'init' | 'awaiting_auth' | 'ready';
type AppView = 'sessions' | 'terminal';
type TerminalTool = 'files' | 'ai' | 'trellis' | 'ide' | null;

const CLIENT_NOTIFY_TAGS = new Set(['需确认', '需输入', '需选择', '完毕', '错误', '目标偏离']);
const MAX_ATTENTION_TOASTS = 4;

function titleOf(session: SessionInfo) {
  return session.title || session.tmux_name || `Session ${session.id.slice(0, 6)}`;
}

function compareSessionsForTabs(a: SessionInfo, b: SessionInfo) {
  const created = a.created_at.localeCompare(b.created_at);
  if (created !== 0) return created;
  return a.id.localeCompare(b.id);
}

function mergeTabsWithSessions(currentTabs: TabInfo[], sessions: SessionInfo[]) {
  const orderedSessions = [...sessions].sort(compareSessionsForTabs);
  const sessionsById = new Map(orderedSessions.map(session => [session.id, session]));
  const mergedTabs: TabInfo[] = [];

  for (const tab of currentTabs) {
    const session = sessionsById.get(tab.session.id);
    if (session) {
      mergedTabs.push({ ...tab, session });
    }
  }

  const seenIds = new Set(mergedTabs.map(tab => tab.session.id));
  for (const session of orderedSessions) {
    if (!seenIds.has(session.id)) {
      mergedTabs.push({ session });
    }
  }

  return mergedTabs;
}

export default function App() {
  const [state, setState] = useState<AppState>('init');
  const [error, setError] = useState('');
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [view, setView] = useState<AppView>('sessions');
  const [terminalTool, setTerminalTool] = useState<TerminalTool>(null);
  const [saveProjectSession, setSaveProjectSession] = useState<SessionInfo | null>(null);
  const [saveProjectLoading, setSaveProjectLoading] = useState(false);
  const [saveProjectError, setSaveProjectError] = useState('');
  const [confirmRequest, setConfirmRequest] = useState<ConfirmDialogRequest | null>(null);
  const [attentionToasts, setAttentionToasts] = useState<SessionAttentionToast[]>([]);
  const initRef = useRef(false);
  const activeSessionIdRef = useRef<string | null>(null);
  const tabsRef = useRef<TabInfo[]>([]);
  const lastAttentionKeysRef = useRef<Map<string, string>>(new Map());
  const { t } = useI18n();

  const { getActiveServer, clearToken } = useServerStore();
  const { setSummary, addWorkflowEvent, addAutoAction } = useAIStore();
  const summaries = useAIStore(s => s.summaries);
  const aiEnabled = useAIStore(s => s.aiEnabled);
  const setAiEnabled = useAIStore(s => s.setAiEnabled);

  // Terminal overlay drawer width (persisted).
  const sidePanelWidth = useSettingsStore(s => s.sidePanelWidth);
  const setSidePanelWidth = useSettingsStore(s => s.setSidePanelWidth);
  const trellisPanelWidth = useSettingsStore(s => s.trellisPanelWidth);
  const setTrellisPanelWidth = useSettingsStore(s => s.setTrellisPanelWidth);

  useTheme();
  useZoomLevel();

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    const preventNativeMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener('contextmenu', preventNativeMenu);
    return () => document.removeEventListener('contextmenu', preventNativeMenu);
  }, []);

  const syncServerConnection = useCallback(() => {
    const server = getActiveServer();
    if (server) {
      api.baseUrl = server.url;
      socket.remoteBaseUrl = server.url;
    }
  }, [getActiveServer]);

  useEffect(() => {
    api.setTokenProvider(() => useServerStore.getState().getActiveToken());
    syncServerConnection();
  }, [syncServerConnection]);

  const addSessionAttentionToast = useCallback((msg: ControlMessage, forcedTag?: string) => {
    const sessionId = msg.session_id;
    const tag = forcedTag || msg.tag || '';
    if (!sessionId || !tag || !CLIENT_NOTIFY_TAGS.has(tag)) return;
    if (!activeSessionIdRef.current || sessionId === activeSessionIdRef.current) return;

    const tab = tabsRef.current.find(item => item.session.id === sessionId);
    if (!tab) return;

    const description = msg.description || '';
    const attentionKey = `${tag}\n${description}`;
    if (lastAttentionKeysRef.current.get(sessionId) === attentionKey) return;
    lastAttentionKeysRef.current.set(sessionId, attentionKey);

    const toast: SessionAttentionToast = {
      id: `${sessionId}-${Date.now()}`,
      sessionId,
      title: titleOf(tab.session),
      tag,
      description,
      timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
    };

    setAttentionToasts(current => [
      toast,
      ...current.filter(item => item.sessionId !== sessionId),
    ].slice(0, MAX_ATTENTION_TOASTS));
  }, []);

  useEffect(() => {
    const offControl = socket.onControl((msg: ControlMessage) => {
      switch (msg.type) {
        case 'ai_summary':
          if (msg.session_id) {
            setSummary(msg.session_id, { tag: msg.tag || '', description: msg.description || '', timestamp: msg.timestamp || 0 });
            addSessionAttentionToast(msg);
          }
          break;
        case 'ai_workflow_event':
          if (msg.event) addWorkflowEvent(msg.event);
          break;
        case 'ai_auto_action':
          addAutoAction({ session_id: msg.session_id || '', session_name: msg.session_name || '', tag: msg.tag || '', description: msg.description || '', actions: msg.actions || [], confidence: msg.confidence || 0, timestamp: msg.timestamp || 0, success: msg.success ?? false });
          break;
        case 'ai_goal_misaligned':
          if (msg.session_id) {
            setSummary(msg.session_id, { tag: '目标偏离', description: msg.description || '', timestamp: msg.timestamp || 0 });
            addSessionAttentionToast(msg, '目标偏离');
          }
          break;
      }
    });
    return () => { offControl(); };
  }, [setSummary, addWorkflowEvent, addAutoAction, addSessionAttentionToast]);

  useEffect(() => {
    if (state !== 'ready') return;
    const poll = async () => {
      try {
        const config = await api.getAIConfig();
        setAiEnabled(config.enabled && config.running);
        const { summaries } = await api.getAISummaries();
        for (const [sid, s] of Object.entries(summaries)) setSummary(sid, { tag: s.tag, description: s.description, timestamp: s.timestamp });
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, [state, setAiEnabled, setSummary]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const init = async () => {
      const server = getActiveServer();
      if (!server || !server.token) { setState('awaiting_auth'); return; }
      syncServerConnection();
      try {
        const { valid } = await api.validateToken();
        if (!valid) { clearToken(server.id); setState('awaiting_auth'); return; }
        setState('ready');
      } catch { setState('awaiting_auth'); }
    };
    init();
  }, [getActiveServer, clearToken, syncServerConnection]);

  const handleAuthenticated = () => setState('ready');

  const connectSocket = async (session: SessionInfo) => {
    setIsConnecting(true);
    setError('');
    try {
      await socket.disconnect();
      const { ws_url } = await api.attachSession(session.id);
      await socket.connectWithToken(ws_url, session.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error_connection_failed'));
    } finally {
      setIsConnecting(false);
    }
  };

  const syncLiveSessionsIntoTabs = useCallback(async () => {
    try {
      const { sessions } = await api.listSessions();
      setTabs(prev => mergeTabsWithSessions(prev, sessions));

      if (activeSessionId && !sessions.some(session => session.id === activeSessionId)) {
        await socket.disconnect();
        setActiveSessionId(null);
        setTerminalTool(null);
        if (view === 'terminal') {
          setView('sessions');
        }
      }
    } catch (e) {
      if (view === 'terminal') {
        setError(e instanceof Error ? e.message : t('error_load_sessions'));
      }
    }
  }, [activeSessionId, view, t]);

  useEffect(() => {
    if (state !== 'ready') return;

    syncLiveSessionsIntoTabs();
    const interval = setInterval(syncLiveSessionsIntoTabs, 30000);
    return () => clearInterval(interval);
  }, [state, syncLiveSessionsIntoTabs]);

  const openSession = async (session: SessionInfo) => {
    const existing = tabs.find(t => t.session.id === session.id);
    if (existing) {
      setTabs(prev => prev.map(t => t.session.id === session.id ? { ...t, session } : t));
      setActiveSessionId(session.id);
      setView('terminal');
      await connectSocket(session);
      return;
    }
    setTabs(prev => [...prev, { session }]);
    setActiveSessionId(session.id);
    setView('terminal');
    await connectSocket(session);
  };

  const handleSelectTab = async (sessionId: string) => {
    const tab = tabs.find(t => t.session.id === sessionId);
    if (!tab) return;
    setActiveSessionId(sessionId);
    setView('terminal');
    await connectSocket(tab.session);
  };

  const closeTabSession = async (sessionId: string) => {
    const tab = tabs.find(t => t.session.id === sessionId);
    if (!tab) return;

    try {
      await api.deleteSession(sessionId);
    } catch (e) {
      const message = e instanceof Error ? e.message : t('error_delete_session');
      if (!message.toLowerCase().includes('not found')) {
        setError(message);
        return;
      }
    }

    const remaining = tabs.filter(t => t.session.id !== sessionId);
    setTabs(remaining);
    if (sessionId === activeSessionId) {
      await socket.disconnect();
      if (remaining.length === 0) {
        setActiveSessionId(null);
        setView('sessions');
        setTerminalTool(null);
      } else {
        const last = remaining[remaining.length - 1];
        setActiveSessionId(last.session.id);
        setView('terminal');
        await connectSocket(last.session);
      }
    }
  };

  const handleCloseTab = (sessionId: string) => {
    const tab = tabs.find(t => t.session.id === sessionId);
    if (!tab) return;
    setConfirmRequest({
      title: t('confirm_dialog_title'),
      message: t('session_end_confirm', { name: titleOf(tab.session) }),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      tone: 'danger',
      onConfirm: () => { void closeTabSession(sessionId); },
    });
  };

  const handleNewTab = async () => {
    setError('');
    try {
      const { session } = await api.createSession();
      await openSession(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error_create_session'));
    }
  };

  const refreshTabSession = async (session: SessionInfo) => {
    const result = await api.listSessions();
    const fresh = result.sessions.find(item => item.id === session.id) || session;
    setTabs(prev => prev.map(tab => tab.session.id === fresh.id ? { ...tab, session: fresh } : tab));
    return fresh;
  };

  const handleOpenSaveProject = async () => {
    // Toggle: if the dialog is already open, close it. Otherwise open it.
    if (saveProjectSession) {
      if (!saveProjectLoading) setSaveProjectSession(null);
      return;
    }
    const tab = tabs.find(t => t.session.id === activeSessionId);
    if (!tab) return;
    setSaveProjectError('');
    try {
      const fresh = await refreshTabSession(tab.session);
      setSaveProjectSession(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error_refresh_session'));
    }
  };

  const handleSaveProject = async (name: string) => {
    if (!saveProjectSession) return;
    setSaveProjectLoading(true);
    setSaveProjectError('');
    try {
      await api.createProjectFromSession(saveProjectSession.id, { name });
      setSaveProjectSession(null);
    } catch (e) {
      setSaveProjectError(e instanceof Error ? e.message : t('error_create_project'));
    } finally {
      setSaveProjectLoading(false);
    }
  };

  const openTerminalTool = (tool: Exclude<TerminalTool, null>) => {
    // Toggle: clicking the already-active tool button closes its panel.
    setTerminalTool(current => (current === tool ? null : tool));
    setView('terminal');
  };

  const handleLogout = () => {
    const server = getActiveServer();
    if (server) clearToken(server.id);
    window.location.reload();
  };

  const closeTerminalTool = useCallback(() => setTerminalTool(null), []);

  const handleOpenAttentionSession = (sessionId: string) => {
    setAttentionToasts(current => current.filter(item => item.sessionId !== sessionId));
    const tab = tabsRef.current.find(item => item.session.id === sessionId);
    if (!tab) {
      setError(t('notification_session_missing'));
      return;
    }
    void handleSelectTab(sessionId);
  };

  const handleDismissAttentionToast = (id: string) => {
    setAttentionToasts(current => current.filter(item => item.id !== id));
  };

  // Tabs enriched with summaries for the TabBar.
  const tabBarTabs = useMemo<TabInfo[]>(
    () => tabs.map(t => ({ session: t.session, summary: summaries[t.session.id] })),
    [tabs, summaries],
  );

  const showTerminalTool = view === 'terminal' && !!terminalTool && activeSessionId;
  const terminalToolTitle = terminalTool === 'files'
    ? t('files_title')
    : terminalTool === 'trellis'
      ? t('trellis_title')
      : terminalTool === 'ide'
        ? t('ide_panel_title')
        : t('ai_settings_title');
  const terminalOverlayWidth = terminalTool === 'trellis' ? trellisPanelWidth : sidePanelWidth;
  const setTerminalOverlayWidth = terminalTool === 'trellis' ? setTrellisPanelWidth : setSidePanelWidth;

  // === Render ===

  if (state === 'init') {
    return <div className="h-full flex items-center justify-center bg-canvas"><p className="text-text-secondary/60">{t('loading')}</p></div>;
  }

  if (state === 'awaiting_auth') {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  // ready state
  const activeTab = tabs.find(t => t.session.id === activeSessionId);

  if (view === 'sessions') {
    return (
      <div className="relative h-full bg-canvas">
        <SessionSelectPage
          onSelectSession={openSession}
          onLogout={handleLogout}
        />
        <SessionAttentionToasts
          items={attentionToasts}
          onOpenSession={handleOpenAttentionSession}
          onDismiss={handleDismissAttentionToast}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex bg-canvas text-text-primary/95 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        <TabBar
          tabs={tabBarTabs}
          activeSessionId={activeSessionId}
          aiEnabled={aiEnabled}
          filesActive={terminalTool === 'files'}
          aiActive={terminalTool === 'ai'}
          trellisActive={terminalTool === 'trellis'}
          ideActive={terminalTool === 'ide'}
          saveProjectActive={!!saveProjectSession}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
          onNewTab={handleNewTab}
          onBackToSessions={() => setView('sessions')}
          onSaveProject={handleOpenSaveProject}
          onOpenFiles={() => openTerminalTool('files')}
          onOpenAI={() => openTerminalTool('ai')}
          onOpenTrellis={() => openTerminalTool('trellis')}
          onOpenIDE={() => openTerminalTool('ide')}
        />

        {/* Content area: terminal with overlay tools */}
        <div className="flex-1 overflow-hidden min-h-0">
          <div className="relative h-full overflow-hidden bg-canvas">
            {activeTab && <TerminalView key={activeTab.session.id} sessionId={activeTab.session.id} />}
            {!activeTab && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-text-tertiary/30">
                <svg width="44" height="44" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.3" className="mb-3 opacity-60">
                  <rect x="6" y="8" width="36" height="32" rx="3" />
                  <path d="M14 20l6 6-6 6M24 32h10" />
                </svg>
                <p className="text-sm">{t('select_session')}</p>
              </div>
            )}
            {isConnecting && (
              <div className="absolute inset-0 flex items-center justify-center bg-canvas/75 pointer-events-none">
                <div className="flex items-center gap-2 text-text-tertiary/30 text-sm">
                  <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  {t('status_connecting')}
                </div>
              </div>
            )}

            <SessionAttentionToasts
              items={attentionToasts}
              onOpenSession={handleOpenAttentionSession}
              onDismiss={handleDismissAttentionToast}
            />

            <TerminalOverlayHost open={!!showTerminalTool}>
              {showTerminalTool && activeSessionId && (
                <TerminalOverlayDrawer
                  label={terminalToolTitle}
                  width={terminalOverlayWidth}
                  minWidth={terminalTool === 'trellis' ? TRELLIS_PANEL_MIN_WIDTH : undefined}
                  maxWidth={terminalTool === 'trellis' ? TRELLIS_PANEL_MAX_WIDTH : undefined}
                  onWidthChange={setTerminalOverlayWidth}
                  onClose={closeTerminalTool}
                >
                  {terminalTool === 'files' && <FileManager sessionId={activeSessionId} onClose={closeTerminalTool} />}
                  {terminalTool === 'ai' && <AIPanel sessionId={activeSessionId} onClose={closeTerminalTool} />}
                  {terminalTool === 'trellis' && <TrellisPanel sessionId={activeSessionId} onClose={closeTerminalTool} />}
                  {terminalTool === 'ide' && activeTab && <IDEContextPanel session={activeTab.session} onClose={closeTerminalTool} />}
                </TerminalOverlayDrawer>
              )}
            </TerminalOverlayHost>
          </div>
        </div>

        {error && (
          <div className="px-3 py-1 text-xs text-error border-t border-theme-border/10 bg-error/10 flex items-center justify-between shrink-0">
            <span>{error}</span>
            <button className="opacity-70 hover:opacity-100" onClick={() => setError('')}>✕</button>
          </div>
        )}
      </div>

      {saveProjectSession && (
        <SaveProjectDialog
          session={saveProjectSession}
          loading={saveProjectLoading}
          error={saveProjectError}
          onClose={() => { if (!saveProjectLoading) setSaveProjectSession(null); }}
          onSave={handleSaveProject}
        />
      )}

      {confirmRequest && (
        <ConfirmDialog
          {...confirmRequest}
          onCancel={() => setConfirmRequest(null)}
        />
      )}
    </div>
  );
}
