import { useState, useEffect, useCallback, useRef } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { TerminalView } from './components/TerminalView';
import { Sidebar } from './components/Sidebar';
import { AIPanel } from './components/AIPanel';
import { FileManager } from './components/FileManager';
import { SettingsDialog } from './components/SettingsDialog';
import { api, SessionInfo } from './core/api';
import { socket, ControlMessage } from './core/socket';
import { useServerStore } from './stores/serverStore';
import { useAIStore } from './stores/aiStore';
import { useTheme } from './hooks/useTheme';

type AppState = 'init' | 'awaiting_auth' | 'ready';
type NavSection = 'sessions' | 'files' | 'ai' | 'settings';

interface TabInfo {
  session: SessionInfo;
}

export default function App() {
  const [state, setState] = useState<AppState>('init');
  const [error, setError] = useState('');
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeSection, setActiveSection] = useState<NavSection>('sessions');
  const [showSettings, setShowSettings] = useState(false);
  const initRef = useRef(false);

  const { getActiveServer, clearToken } = useServerStore();
  const { setSummary, addWorkflowEvent, addAutoAction } = useAIStore();
  const summaries = useAIStore(s => s.summaries);
  const aiEnabled = useAIStore(s => s.aiEnabled);

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

  const setAiEnabled = useAIStore(s => s.setAiEnabled);
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

  const openSession = async (session: SessionInfo) => {
    const existing = tabs.find(t => t.session.id === session.id);
    if (existing) {
      setTabs(prev => prev.map(t => t.session.id === session.id ? { ...t, session } : t));
      setActiveSessionId(session.id);
      await connectSocket(session);
      return;
    }
    setTabs(prev => [...prev, { session }]);
    setActiveSessionId(session.id);
    await connectSocket(session);
  };

  const handleSelectTab = async (sessionId: string) => {
    const tab = tabs.find(t => t.session.id === sessionId);
    if (!tab) return;
    setActiveSessionId(sessionId);
    await connectSocket(tab.session);
  };

  const handleCloseTab = async (sessionId: string) => {
    const remaining = tabs.filter(t => t.session.id !== sessionId);
    setTabs(remaining);
    if (sessionId === activeSessionId) {
      await socket.disconnect();
      if (remaining.length === 0) {
        setActiveSessionId(null);
        setActiveSection('sessions');
      } else {
        const last = remaining[remaining.length - 1];
        setActiveSessionId(last.session.id);
        await connectSocket(last.session);
      }
    }
  };

  // Handle section change from sidebar
  const handleSectionChange = (section: NavSection) => {
    if (section === 'settings') {
      setShowSettings(true);
      return;
    }
    setActiveSection(section);
  };

  // === Render ===

  if (state === 'init') {
    return <div className="h-full flex items-center justify-center bg-[#0e0e12]"><p className="text-gray-500">Loading...</p></div>;
  }

  if (state === 'awaiting_auth') {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  // ready state — main Termius-style layout
  const activeTab = tabs.find(t => t.session.id === activeSessionId);

  return (
    <div className="h-full flex bg-[#0e0e12] text-white overflow-hidden">
      {/* Left: Sidebar (icon rail + content panel) */}
      <Sidebar
        activeSessionId={activeSessionId}
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        onSelectSession={openSession}
      />

      {/* Right: Terminal area + optional side panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Tab bar */}
        <div className="flex items-center h-9 bg-[#1a1a1f] border-b border-black/40 shrink-0">
          <div className="flex items-center flex-1 overflow-x-auto h-full">
            {tabs.map(tab => {
              const isActive = tab.session.id === activeSessionId;
              const summary = summaries[tab.session.id];
              return (
                <div
                  key={tab.session.id}
                  className={`group flex items-center gap-2 px-3 h-full cursor-pointer border-r border-black/30 transition-colors shrink-0 max-w-[180px] ${
                    isActive ? 'bg-[#0e0e12] text-white' : 'text-gray-400 hover:bg-white/5'
                  }`}
                  onClick={() => handleSelectTab(tab.session.id)}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    summary?.tag ? getDotColor(summary.tag) :
                    tab.session.is_ghost ? 'bg-gray-600' :
                    tab.session.state === 'active' ? 'bg-green-500' : 'bg-yellow-500'
                  }`} />
                  <span className="text-xs truncate flex-1">{tab.session.title || tab.session.id.slice(0, 8)}</span>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity shrink-0"
                    onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.session.id); }}
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3l6 6M9 3l-6 6" /></svg>
                  </button>
                </div>
              );
            })}
          </div>
          {tabs.length === 0 && (
            <span className="px-4 text-xs text-gray-600">No active sessions — select from sidebar</span>
          )}
        </div>

        {/* Content area: terminal + optional right panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Terminal */}
          <div className="flex-1 relative overflow-hidden bg-[#09090b]">
            {activeTab && <TerminalView key={activeTab.session.id} sessionId={activeTab.session.id} />}
            {!activeTab && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-50">
                  <rect x="6" y="8" width="36" height="32" rx="3" />
                  <path d="M14 20l6 6-6 6M24 32h10" />
                </svg>
                <p className="text-sm">Select a session to start</p>
              </div>
            )}
            {isConnecting && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#09090b]/75 pointer-events-none">
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  Connecting...
                </div>
              </div>
            )}
          </div>

          {/* Right panel: Files or AI (based on activeSection) */}
          {activeSection === 'files' && activeSessionId && (
            <div className="w-72 shrink-0 overflow-hidden">
              <FileManager sessionId={activeSessionId} onClose={() => setActiveSection('sessions')} />
            </div>
          )}
          {activeSection === 'ai' && activeSessionId && (
            <div className="w-80 shrink-0 overflow-hidden">
              <AIPanel sessionId={activeSessionId} onClose={() => setActiveSection('sessions')} />
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 py-1.5 text-xs text-red-400 border-t border-white/5 bg-red-500/10 flex items-center justify-between shrink-0">
            <span>{error}</span>
            <button className="opacity-70 hover:opacity-100" onClick={() => setError('')}>✕</button>
          </div>
        )}
      </div>

      {/* Settings dialog */}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function getDotColor(tag: string): string {
  const map: Record<string, string> = {
    '完毕': 'bg-green-500', '进行': 'bg-blue-500', '需确认': 'bg-yellow-500',
    '需输入': 'bg-yellow-500', '需选择': 'bg-orange-500', '错误': 'bg-red-500',
    '等待': 'bg-blue-500', '自动处理': 'bg-cyan-500', '休眠中': 'bg-gray-600',
    '目标偏离': 'bg-red-500',
  };
  return map[tag] || 'bg-gray-500';
}
