import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { TerminalView } from './components/TerminalView';
import { TabBar, TabInfo } from './components/TabBar';
import { DockPanel } from './components/DockPanel';
import { AIPanel } from './components/AIPanel';
import { FileManager } from './components/FileManager';
import { SessionSelectPage } from './components/SessionSelectPage';
import { SaveProjectDialog } from './components/SaveProjectDialog';
import { api, SessionInfo } from './core/api';
import { socket, ControlMessage } from './core/socket';
import { useServerStore } from './stores/serverStore';
import { useAIStore } from './stores/aiStore';
import { useSettingsStore } from './stores/settingsStore';
import { useTheme } from './hooks/useTheme';

type AppState = 'init' | 'awaiting_auth' | 'ready';
type AppView = 'sessions' | 'terminal';
type DockSection = 'files' | 'ai' | null;

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
  const [dockSection, setDockSection] = useState<DockSection>(null);
  const [saveProjectSession, setSaveProjectSession] = useState<SessionInfo | null>(null);
  const [saveProjectLoading, setSaveProjectLoading] = useState(false);
  const [saveProjectError, setSaveProjectError] = useState('');
  const initRef = useRef(false);

  const { getActiveServer, clearToken } = useServerStore();
  const { setSummary, addWorkflowEvent, addAutoAction } = useAIStore();
  const summaries = useAIStore(s => s.summaries);
  const aiEnabled = useAIStore(s => s.aiEnabled);
  const setAiEnabled = useAIStore(s => s.setAiEnabled);

  // Dock panel state (persisted).
  const sidePanelWidth = useSettingsStore(s => s.sidePanelWidth);
  const sidePanelCollapsed = useSettingsStore(s => s.sidePanelCollapsed);
  const setSidePanelWidth = useSettingsStore(s => s.setSidePanelWidth);
  const setSidePanelCollapsed = useSettingsStore(s => s.setSidePanelCollapsed);

  useTheme();

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

  useEffect(() => {
    const offControl = socket.onControl((msg: ControlMessage) => {
      switch (msg.type) {
        case 'ai_summary':
          if (msg.session_id) setSummary(msg.session_id, { tag: msg.tag || '', description: msg.description || '', timestamp: msg.timestamp || 0 });
          break;
        case 'ai_workflow_event':
          if (msg.event) addWorkflowEvent(msg.event);
          break;
        case 'ai_auto_action':
          addAutoAction({ session_id: msg.session_id || '', session_name: msg.session_name || '', tag: msg.tag || '', description: msg.description || '', actions: msg.actions || [], confidence: msg.confidence || 0, timestamp: msg.timestamp || 0, success: msg.success ?? false });
          break;
        case 'ai_goal_misaligned':
          if (msg.session_id) setSummary(msg.session_id, { tag: '目标偏离', description: msg.description || '', timestamp: msg.timestamp || 0 });
          break;
      }
    });
    return () => { offControl(); };
  }, [setSummary, addWorkflowEvent, addAutoAction]);

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
      setError(e instanceof Error ? e.message : 'Connection failed');
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
        setDockSection(null);
        if (view === 'terminal') {
          setView('sessions');
        }
      }
    } catch (e) {
      if (view === 'terminal') {
        setError(e instanceof Error ? e.message : 'Failed to load sessions');
      }
    }
  }, [activeSessionId, view]);

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

  const handleCloseTab = async (sessionId: string) => {
    const tab = tabs.find(t => t.session.id === sessionId);
    if (!tab) return;
    if (!confirm(`结束会话 "${titleOf(tab.session)}"？\n这会关闭对应的 tmux session，正在运行的进程也会停止。`)) return;

    try {
      await api.deleteSession(sessionId);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete session';
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
        setDockSection(null);
      } else {
        const last = remaining[remaining.length - 1];
        setActiveSessionId(last.session.id);
        setView('terminal');
        await connectSocket(last.session);
      }
    }
  };

  const handleNewTab = async () => {
    setError('');
    try {
      const { session } = await api.createSession();
      await openSession(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create session');
    }
  };

  const refreshTabSession = async (session: SessionInfo) => {
    const result = await api.listSessions();
    const fresh = result.sessions.find(item => item.id === session.id) || session;
    setTabs(prev => prev.map(tab => tab.session.id === fresh.id ? { ...tab, session: fresh } : tab));
    return fresh;
  };

  const handleOpenSaveProject = async () => {
    const tab = tabs.find(t => t.session.id === activeSessionId);
    if (!tab) return;
    setSaveProjectError('');
    try {
      const fresh = await refreshTabSession(tab.session);
      setSaveProjectSession(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh session');
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
      setSaveProjectError(e instanceof Error ? e.message : 'Failed to create project');
    } finally {
      setSaveProjectLoading(false);
    }
  };

  const openDockPanel = (section: Exclude<DockSection, null>) => {
    setDockSection(section);
    setView('terminal');
    if (sidePanelCollapsed) {
      setSidePanelCollapsed(false);
    }
  };

  const handleLogout = () => {
    const server = getActiveServer();
    if (server) clearToken(server.id);
    window.location.reload();
  };

  const closeDockPanel = () => setDockSection(null);

  // Tabs enriched with summaries for the TabBar.
  const tabBarTabs = useMemo<TabInfo[]>(
    () => tabs.map(t => ({ session: t.session, summary: summaries[t.session.id] })),
    [tabs, summaries],
  );

  const showDockPanel = view === 'terminal' && !!dockSection && activeSessionId;
  const dockTitle = dockSection === 'files' ? 'Files' : 'AI Monitor';

  // === Render ===

  if (state === 'init') {
    return <div className="h-full flex items-center justify-center bg-canvas"><p className="text-text-secondary/60">Loading...</p></div>;
  }

  if (state === 'awaiting_auth') {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  // ready state
  const activeTab = tabs.find(t => t.session.id === activeSessionId);

  if (view === 'sessions') {
    return (
      <SessionSelectPage
        onSelectSession={openSession}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="h-full flex bg-canvas text-text-primary/95 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        <TabBar
          tabs={tabBarTabs}
          activeSessionId={activeSessionId}
          aiEnabled={aiEnabled}
          filesActive={dockSection === 'files'}
          aiActive={dockSection === 'ai'}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
          onNewTab={handleNewTab}
          onBackToSessions={() => setView('sessions')}
          onSaveProject={handleOpenSaveProject}
          onOpenFiles={() => openDockPanel('files')}
          onOpenAI={() => openDockPanel('ai')}
        />

        {/* Content area: terminal + optional dock panel */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Terminal */}
          <div className="flex-1 relative overflow-hidden bg-canvas">
            {activeTab && <TerminalView key={activeTab.session.id} sessionId={activeTab.session.id} />}
            {!activeTab && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-text-tertiary/30">
                <svg width="44" height="44" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.3" className="mb-3 opacity-60">
                  <rect x="6" y="8" width="36" height="32" rx="3" />
                  <path d="M14 20l6 6-6 6M24 32h10" />
                </svg>
                <p className="text-sm">Select a session to start</p>
              </div>
            )}
            {isConnecting && (
              <div className="absolute inset-0 flex items-center justify-center bg-canvas/75 pointer-events-none">
                <div className="flex items-center gap-2 text-text-tertiary/30 text-sm">
                  <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  Connecting...
                </div>
              </div>
            )}
          </div>

          {/* Right dock panel: Files or AI */}
          {showDockPanel && activeSessionId && (
            <DockPanel
              width={sidePanelWidth}
              collapsed={sidePanelCollapsed}
              onWidthChange={setSidePanelWidth}
              onCollapsedChange={setSidePanelCollapsed}
              title={dockTitle}
              onClose={closeDockPanel}
            >
              {dockSection === 'files'
                ? <FileManager sessionId={activeSessionId} onClose={closeDockPanel} />
                : <AIPanel sessionId={activeSessionId} onClose={closeDockPanel} />}
            </DockPanel>
          )}
        </div>

        {error && (
          <div className="px-4 py-1.5 text-xs text-error border-t border-white/10 bg-error/10 flex items-center justify-between shrink-0">
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
    </div>
  );
}
