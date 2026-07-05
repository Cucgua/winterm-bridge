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
import { useSplitStore, countLeaves, sessionsInTree, findNode, type SplitTab, type TerminalTool } from './stores/splitStore';
import { socketManager } from './core/socketManager';
import { SplitView } from './components/SplitView';
import { useTheme } from './hooks/useTheme';
import { useZoomLevel } from './hooks/useZoomLevel';
import { sessionDisplayTitle as titleOf } from './utils/sessionTitle';

type AppState = 'init' | 'awaiting_auth' | 'ready';
type AppView = 'sessions' | 'terminal';

const CLIENT_NOTIFY_TAGS = new Set(['需确认', '需输入', '需选择', '完毕', '错误', '目标偏离']);
const MAX_ATTENTION_TOASTS = 4;

function compareSessionsForTabs(a: SessionInfo, b: SessionInfo) {
  const created = a.created_at.localeCompare(b.created_at);
  if (created !== 0) return created;
  return a.id.localeCompare(b.id);
}

function mergeTabsWithSessions(
  currentTabs: TabInfo[],
  sessions: SessionInfo[],
  sessionsInSplit: Set<string>,
) {
  const orderedSessions = [...sessions].sort(compareSessionsForTabs);
  const sessionsById = new Map(orderedSessions.map(session => [session.id, session]));
  const mergedTabs: TabInfo[] = [];

  for (const tab of currentTabs) {
    // Split-page tabs have no session; preserve them as-is.
    if (tab.kind === 'split') {
      mergedTabs.push(tab);
      continue;
    }
    if (!tab.session) continue;
    const session = sessionsById.get(tab.session.id);
    if (session) {
      mergedTabs.push({ ...tab, session });
    }
  }

  // Add sessions not yet opened as tabs — but skip any already living inside a
  // split page (move semantics: a session in a split pane has no standalone tab).
  const seenIds = new Set(mergedTabs.filter(tab => tab.session).map(tab => tab.session!.id));
  for (const session of orderedSessions) {
    if (!seenIds.has(session.id) && !sessionsInSplit.has(session.id)) {
      mergedTabs.push({ session, kind: 'single' });
    }
  }

  return mergedTabs;
}

/** Resolve the sessionId bound to a pane inside a split tab's tree (or null). */
function findPaneSessionId(
  splitTabs: SplitTab[],
  splitTabId: string | null,
  paneId: string,
): string | null {
  if (!splitTabId) return null;
  const tab = splitTabs.find(st => st.id === splitTabId);
  if (!tab) return null;
  return findNode(tab.root, paneId)?.sessionId ?? null;
}

export default function App() {
  const [state, setState] = useState<AppState>('init');
  const [error, setError] = useState('');
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // Cache of session metadata by id, so split-pane headers can show titles for
  // sessions that no longer have a standalone tab (moved into a split page).
  const [sessionCache, setSessionCache] = useState<Record<string, SessionInfo>>({});
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

    const tab = tabsRef.current.find(item => item.kind === 'single' && item.session?.id === sessionId);
    if (!tab || !tab.session) return;

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
        // Reconcile persisted split layouts against the live session list: any
        // pane bound to a session that no longer exists is emptied (its tree
        // position is kept so the user can re-drop a session into it).
        const { sessions } = await api.listSessions();
        const liveIds = new Set(sessions.map(s => s.id));
        const store = useSplitStore.getState();
        for (const st of store.splitTabs) {
          store.pruneDeadSessions(st.id, liveIds);
        }
        // Rebuild TabInfo entries for persisted split tabs (single-session tabs
        // are filled by the first syncLiveSessionsIntoTabs run below).
        setTabs(prev => {
          const splitEntries = useSplitStore.getState().splitTabs.map(st => ({
            kind: 'split' as const,
            splitTabId: st.id,
            splitCount: countLeaves(st.root),
          }));
          return [...prev.filter(t => t.kind === 'single'), ...splitEntries];
        });
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
      const liveIds = new Set(sessions.map(s => s.id));
      setSessionCache(prev => {
        const next = { ...prev };
        for (const s of sessions) next[s.id] = s;
        return next;
      });
      // Self-heal: any pane bound to a session that vanished (deleted elsewhere,
      // or a persistent session that became a ghost) is emptied in place so it
      // never lingers as a stuck "connecting…" zombie pane.
      const store = useSplitStore.getState();
      for (const st of store.splitTabs) {
        store.pruneDeadSessions(st.id, liveIds);
      }
      // Collect every session id currently inside a split page, so we don't
      // re-create standalone tabs for them (move semantics).
      const sessionsInSplit = new Set<string>();
      for (const st of useSplitStore.getState().splitTabs) {
        for (const sid of sessionsInTree(st.root)) sessionsInSplit.add(sid);
      }
      setTabs(prev => mergeTabsWithSessions(prev, sessions, sessionsInSplit));

      // If the active single-session tab's session vanished from the server,
      // fall back. Split-page tabs are tracked by splitTabId (not a session id)
      // and must be excluded here, otherwise the splitTabId fails the
      // "is this a live session" check and yanks the user back to the session list.
      const activeIsSingleSession =
        !!activeSessionId &&
        !sessionsInSplit.has(activeSessionId) &&
        tabs.some(t => t.kind === 'single' && t.session?.id === activeSessionId);
      if (activeIsSingleSession && !sessions.some(session => session.id === activeSessionId)) {
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
    setSessionCache(prev => ({ ...prev, [session.id]: session }));
    const existing = tabs.find(t => t.kind === 'single' && t.session?.id === session.id);
    if (existing) {
      setTabs(prev => prev.map(t => t.session?.id === session.id ? { ...t, session } : t));
      setActiveSessionId(session.id);
      setView('terminal');
      await connectSocket(session);
      return;
    }
    setTabs(prev => [...prev, { session, kind: 'single' }]);
    setActiveSessionId(session.id);
    setView('terminal');
    await connectSocket(session);
  };

  /**
   * Create a brand-new split page (independent of any session tab). The page
   * starts with a single empty pane prompting the user to drag a session in.
   * Existing session tabs are untouched — sessions move into panes only when
   * dragged, so closing the split page never affects other tabs.
   */
  const handleStartSplit = () => {
    const splitTabId = useSplitStore.getState().createSplitTab();
    setTabs(prev => [...prev, { kind: 'split' as const, splitTabId, splitCount: 0 }]);
    // Activate the new split page (reuse activeSessionId slot with splitTabId).
    setActiveSessionId(splitTabId);
    void socket.disconnect();
    // Close any single-tab drawer; split panes have their own tool buttons.
    setTerminalTool(null);
    setView('terminal');
  };

  /**
   * Called after a session is dropped into a split pane. Enforces move
   * semantics: remove the session's standalone tab (if any) so it can't be
   * opened twice. If the session was already in another split pane, that's
   * prevented upstream (tabs only hold sessions not in any split).
   */
  const handleSessionDropped = (sessionId: string) => {
    setTabs(prev => prev.filter(t => !(t.kind === 'single' && t.session?.id === sessionId)));
  };

  /**
   * Release a session from a split pane back to the tab bar. Called when a pane
   * is closed: the session stays alive on the server, so we re-create a single-
   * session tab for it (using the cached SessionInfo) instead of letting it
   * vanish from the UI. The socket is disconnected — re-opening the tab will
   * reconnect via the singleton.
   */
  const handleReleasePaneSession = (sessionId: string) => {
    void socketManager.disconnect(sessionId);
    const session = sessionCache[sessionId];
    if (!session) return;
    setTabs(prev => {
      // Avoid duplicating if a tab already exists (e.g. race with sync).
      if (prev.some(t => t.kind === 'single' && t.session?.id === sessionId)) return prev;
      return [...prev, { session, kind: 'single' as const }];
    });
  };

  /**
   * Close a split page: release every session in its panes back to the tab bar,
   * disconnect their sockets, then remove the page tab and its split-store entry.
   * Sessions are NOT deleted on the server — they return as single-session tabs.
   */
  const handleCloseSplitTab = async (splitTabId: string) => {
    const tab = tabs.find(t => t.kind === 'split' && t.splitTabId === splitTabId);
    if (!tab) return;
    const splitTab = useSplitStore.getState().splitTabs.find(st => st.id === splitTabId);
    const releasedSessionIds = splitTab ? sessionsInTree(splitTab.root) : [];
    // Release each pane's session back to the tab bar before tearing down.
    const sessionsToRestore: SessionInfo[] = [];
    for (const sid of releasedSessionIds) {
      await socketManager.disconnect(sid);
      const session = sessionCache[sid];
      if (session) sessionsToRestore.push(session);
    }
    useSplitStore.getState().removeSplitTab(splitTabId);
    setTabs(prev => {
      const withoutSplit = prev.filter(t => !(t.kind === 'split' && t.splitTabId === splitTabId));
      // Re-add released sessions as single tabs (skip any already present).
      const existing = new Set(withoutSplit.filter(t => t.session).map(t => t.session!.id));
      const restored = sessionsToRestore
        .filter(s => !existing.has(s.id))
        .map(s => ({ session: s, kind: 'single' as const }));
      return [...withoutSplit, ...restored];
    });
    if (activeSessionId === splitTabId) {
      // Switch to the last restored session, or the last remaining tab, or sessions view.
      const targetSession = sessionsToRestore[sessionsToRestore.length - 1];
      if (targetSession) {
        setActiveSessionId(targetSession.id);
        setView('terminal');
        await connectSocket(targetSession);
      } else {
        const remaining = tabs.filter(t => !(t.kind === 'split' && t.splitTabId === splitTabId));
        if (remaining.length === 0) {
          setActiveSessionId(null);
          setView('sessions');
        } else {
          const last = remaining[remaining.length - 1];
          setActiveSessionId(last.kind === 'split' ? last.splitTabId! : last.session!.id);
          setView('terminal');
          if (last.kind === 'single' && last.session) {
            await connectSocket(last.session);
          }
        }
      }
    }
  };

  /**
   * Select a session from the session-list page. If the session already lives in
   * a split pane, switch to that split page instead of opening a duplicate tab.
   * Otherwise open it as a normal single-session tab.
   */
  const handleSelectFromList = (session: SessionInfo) => {
    setSessionCache(prev => ({ ...prev, [session.id]: session }));
    for (const st of useSplitStore.getState().splitTabs) {
      if (sessionsInTree(st.root).includes(session.id)) {
        setActiveSessionId(st.id);
        useSplitStore.getState().setActiveSplitTab(st.id);
        setView('terminal');
        return;
      }
    }
    void openSession(session);
  };

  const handleSelectTab = async (tabKey: string) => {
    // tabKey is a session id (single tab) or splitTabId (split-page tab).
    const tab = tabs.find(t =>
      t.kind === 'split' ? t.splitTabId === tabKey : t.session?.id === tabKey,
    );
    if (!tab) return;
    setActiveSessionId(tabKey);
    setView('terminal');
    if (tab.kind === 'split' && tab.splitTabId) {
      useSplitStore.getState().setActiveSplitTab(tab.splitTabId);
      await socket.disconnect();
    } else if (tab.session) {
      // Leaving split view: drop any open pane drawer so it doesn't linger.
      if (useSplitStore.getState().activeTool) {
        useSplitStore.getState().setActiveTool(useSplitStore.getState().activeTool!.paneId, null);
      }
      await connectSocket(tab.session);
    }
  };

  const closeTabSession = async (sessionId: string) => {
    const tab = tabs.find(t => t.kind === 'single' && t.session?.id === sessionId);
    if (!tab || !tab.session) return;

    try {
      await api.deleteSession(sessionId);
    } catch (e) {
      const message = e instanceof Error ? e.message : t('error_delete_session');
      if (!message.toLowerCase().includes('not found')) {
        setError(message);
        return;
      }
    }

    const remaining = tabs.filter(t => !(t.kind === 'single' && t.session?.id === sessionId));
    setTabs(remaining);
    if (sessionId === activeSessionId) {
      await socket.disconnect();
      if (remaining.length === 0) {
        setActiveSessionId(null);
        setView('sessions');
        setTerminalTool(null);
      } else {
        const last = remaining[remaining.length - 1];
        const lastKey = last.kind === 'split' ? last.splitTabId! : last.session!.id;
        setActiveSessionId(lastKey);
        setView('terminal');
        if (last.kind === 'single' && last.session) {
          await connectSocket(last.session);
        }
      }
    }
  };

  const handleCloseTab = (sessionId: string) => {
    const tab = tabs.find(t => t.kind === 'single' && t.session?.id === sessionId);
    if (!tab || !tab.session) return;
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
    setTabs(prev => prev.map(tab => tab.session?.id === fresh.id ? { ...tab, session: fresh } : tab));
    return fresh;
  };

  const handleOpenSaveProject = async () => {
    // Toggle: if the dialog is already open, close it. Otherwise open it.
    if (saveProjectSession) {
      if (!saveProjectLoading) setSaveProjectSession(null);
      return;
    }
    const tab = tabs.find(t => t.kind === 'single' && t.session?.id === activeSessionId);
    if (!tab || !tab.session) return;
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

  // ready state
  // activeSessionId holds a session id for single tabs OR a splitTabId for
  // split-page tabs (the latter reuse the same state slot to track which tab
  // is active). Resolve accordingly.
  const activeTab = tabs.find(t =>
    t.kind === 'split' ? t.splitTabId === activeSessionId : t.session?.id === activeSessionId,
  );

  // Sync split-page leaf counts from the split store into the tab bar labels,
  // and drop any split page whose store entry was removed (e.g. last pane closed).
  const splitTabs = useSplitStore(s => s.splitTabs);
  useEffect(() => {
    setTabs(prev => {
      const next: TabInfo[] = [];
      for (const tab of prev) {
        if (tab.kind === 'split' && tab.splitTabId) {
          const splitTab = splitTabs.find(st => st.id === tab.splitTabId);
          if (!splitTab) continue; // store entry gone → drop the page tab
          next.push({ ...tab, splitCount: countLeaves(splitTab.root) });
        } else {
          next.push(tab);
        }
      }
      return next;
    });
  }, [splitTabs]);

  const handleLogout = () => {
    const server = getActiveServer();
    if (server) clearToken(server.id);
    window.location.reload();
  };

  const handleOpenAttentionSession = (sessionId: string) => {
    setAttentionToasts(current => current.filter(item => item.sessionId !== sessionId));
    const tab = tabsRef.current.find(item => item.kind === 'single' && item.session?.id === sessionId);
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
    () => tabs.map(t => ({ ...t, summary: t.session ? summaries[t.session.id] : undefined })),
    [tabs, summaries],
  );

  // Overlay tools (Files/AI/Trellis/IDE) render as one global right-side drawer
  // — same position/size as in single-tab mode. The only difference is where
  // the open tool + target session come from: single tabs use App-local state
  // (terminalTool) bound to activeSessionId; split tabs use the split store's
  // activeTool (which pane opened which tool), resolving the pane's sessionId
  // from the split tree.
  const splitActiveTool = useSplitStore(s => s.activeTool);
  const isSplitView = activeTab?.kind === 'split';

  // The effective tool + session id driving the drawer in either mode.
  const effectiveTool: TerminalTool = isSplitView ? splitActiveTool?.tool ?? null : terminalTool;
  const effectiveSessionId: string | null = isSplitView
    ? (splitActiveTool ? findPaneSessionId(splitTabs, activeTab?.splitTabId ?? null, splitActiveTool.paneId) : null)
    : activeSessionId;

  const showTerminalTool = view === 'terminal' && !!effectiveTool && !!effectiveSessionId;
  const terminalToolTitle = effectiveTool === 'files'
    ? t('files_title')
    : effectiveTool === 'trellis'
      ? t('trellis_title')
      : effectiveTool === 'ide'
        ? t('ide_panel_title')
        : t('ai_settings_title');
  const terminalOverlayWidth = effectiveTool === 'trellis' ? trellisPanelWidth : sidePanelWidth;
  const setTerminalOverlayWidth = effectiveTool === 'trellis' ? setTrellisPanelWidth : setSidePanelWidth;

  // Close the active drawer regardless of mode (single → App state, split → store).
  const closeTerminalTool = useCallback(() => {
    if (useSplitStore.getState().activeTool) {
      useSplitStore.getState().setActiveTool(useSplitStore.getState().activeTool!.paneId, null);
      return;
    }
    setTerminalTool(null);
  }, []);

  // === Render ===

  if (state === 'init') {
    return <div className="h-full flex items-center justify-center bg-canvas"><p className="text-text-secondary/60">{t('loading')}</p></div>;
  }

  if (state === 'awaiting_auth') {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  // ready state

  if (view === 'sessions') {
    return (
      <div className="relative h-full bg-canvas">
        <SessionSelectPage
          onSelectSession={handleSelectFromList}
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
          onCloseSplitTab={handleCloseSplitTab}
          onNewTab={handleNewTab}
          onBackToSessions={() => setView('sessions')}
          onSaveProject={handleOpenSaveProject}
          onOpenFiles={() => openTerminalTool('files')}
          onOpenAI={() => openTerminalTool('ai')}
          onOpenTrellis={() => openTerminalTool('trellis')}
          onOpenIDE={() => openTerminalTool('ide')}
          onStartSplit={handleStartSplit}
        />

        {/* Content area: terminal with overlay tools */}
        <div className="flex-1 overflow-hidden min-h-0">
          <div className="relative h-full overflow-hidden bg-canvas">
            {activeTab?.kind === 'split' && activeTab.splitTabId
              ? (() => {
                  const splitTab = splitTabs.find(st => st.id === activeTab.splitTabId);
                  if (!splitTab) return null;
                  return (
                    <SplitView
                      splitTabId={splitTab.id}
                      root={splitTab.root}
                      activePaneId={splitTab.activePaneId}
                      sessionMap={sessionCache}
                      onSessionDropped={handleSessionDropped}
                      onClosePane={handleReleasePaneSession}
                    />
                  );
                })()
              : activeTab?.kind === 'single' && activeTab.session && (
                <TerminalView key={activeTab.session.id} sessionId={activeTab.session.id} />
              )}
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
              {showTerminalTool && effectiveSessionId && (
                <TerminalOverlayDrawer
                  label={terminalToolTitle}
                  width={terminalOverlayWidth}
                  minWidth={effectiveTool === 'trellis' ? TRELLIS_PANEL_MIN_WIDTH : undefined}
                  maxWidth={effectiveTool === 'trellis' ? TRELLIS_PANEL_MAX_WIDTH : undefined}
                  onWidthChange={setTerminalOverlayWidth}
                  onClose={closeTerminalTool}
                >
                  {effectiveTool === 'files' && <FileManager sessionId={effectiveSessionId} onClose={closeTerminalTool} />}
                  {effectiveTool === 'ai' && <AIPanel sessionId={effectiveSessionId} onClose={closeTerminalTool} />}
                  {effectiveTool === 'trellis' && <TrellisPanel sessionId={effectiveSessionId} onClose={closeTerminalTool} />}
                  {effectiveTool === 'ide' && sessionCache[effectiveSessionId] && <IDEContextPanel session={sessionCache[effectiveSessionId]} onClose={closeTerminalTool} />}
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
