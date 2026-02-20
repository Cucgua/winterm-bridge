import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { SessionInfo, api } from '../../shared/core/api';
import { useI18n, formatRelativeTimeI18n } from '../../shared/i18n';
import { copyToClipboard } from '../../shared/utils/clipboard';
import { AIStatusIndicator, getTagDotColor } from '../../shared/components/AIStatusBadge';
import { AutoActionLogs } from '../../shared/components/AutoActionLogs';
import { IDEContextPopover } from '../../shared/components/IDEContextPopover';
import { FileManagerPanel } from '../../shared/components/FileManagerPanel';
import { useAIStore } from '../../shared/stores/aiStore';
import { useIDEStore } from '../../shared/stores/ideStore';
import { useTheme } from '../../shared/hooks/useTheme';

interface DesktopLayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
  onBackToSessions: () => void;
  sessions: SessionInfo[];
  currentSessionId?: string;
  onSwitchSession: (sessionId: string) => void;
  onCreateSession: (title?: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onTogglePersist?: (sessionId: string, isPersistent: boolean) => void;
  onArchiveSession?: (sessionId: string) => void;
  userRole?: 'admin' | 'guest';
}

export function DesktopLayout({
  children,
  onLogout,
  onBackToSessions,
  sessions,
  currentSessionId,
  onSwitchSession,
  onCreateSession,
  onDeleteSession,
  onTogglePersist,
  onArchiveSession,
  userRole = 'guest',
}: DesktopLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const { t } = useI18n();
  const aiEnabled = useAIStore((state) => state.aiEnabled);
  const summaries = useAIStore((state) => state.summaries);

  // Copy mode state (synced via custom events from TerminalView)
  const [copyModeActive, setCopyModeActive] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => setCopyModeActive((e as CustomEvent).detail?.active ?? false);
    window.addEventListener('copy-mode-changed', handler);
    return () => window.removeEventListener('copy-mode-changed', handler);
  }, []);

  // Theme support
  const { setTheme, isDark } = useTheme();

  // IDE popover state
  const [idePopoverOpen, setIdePopoverOpen] = useState(false);
  const ideButtonRef = useRef<HTMLButtonElement>(null);
  const ideConfig = useIDEStore((s) => s.config);
  const ideConnected = useIDEStore((s) => s.isConnected);
  const ideHasChange = useIDEStore((s) => s.hasChange);
  const ideSetConfig = useIDEStore((s) => s.setConfig);
  const ideFetchContext = useIDEStore((s) => s.fetchContext);
  const ideResetForSession = useIDEStore((s) => s.resetForSession);

  // Load IDE config once
  useEffect(() => {
    api.getIDEConfig().then(ideSetConfig).catch(() => {});
  }, [ideSetConfig]);

  // Reset IDE selection when switching sessions
  useEffect(() => {
    ideResetForSession();
  }, [currentSessionId, ideResetForSession]);

  useEffect(() => {
    if (!currentSessionId) {
      setShowFiles(false);
    }
  }, [currentSessionId]);

  // Session notification state
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyLoading, setNotifyLoading] = useState(false);

  // Session auto-reply state
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);

  // Goal modal state
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  // Track if goal modal is for editing existing goal (vs enabling auto mode)
  const [isGoalEdit, setIsGoalEdit] = useState(false);

  const sessionGoals = useAIStore((state) => state.sessionGoals);
  const setSessionGoal = useAIStore((state) => state.setSessionGoal);

  const currentSession = sessions.find(s => s.id === currentSessionId);

  // Poll IDE context
  useEffect(() => {
    if (!ideConfig?.enabled) return;
    const poll = () => {
      ideFetchContext(currentSession?.current_path, currentSession?.title);
    };
    poll();
    const timer = setInterval(poll, (ideConfig.poll_interval || 5) * 1000);
    return () => clearInterval(timer);
  }, [ideConfig?.enabled, ideConfig?.poll_interval, currentSession?.current_path, currentSession?.title, ideFetchContext]);

  // Sort sessions: persistent -> normal -> ghost, then by creation time
  // Filter out archived sessions from sidebar
  const sortedSessions = useMemo(() => {
    const priority = (s: SessionInfo) => {
      if (s.is_ghost) return 2;      // ghost always last (even if persistent)
      if (s.is_persistent) return 0;  // persistent first
      return 1;                       // normal in between
    };
    return [...sessions]
      .filter(s => !s.is_archived)
      .sort((a, b) => {
        const pa = priority(a), pb = priority(b);
        if (pa !== pb) return pa - pb;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
  }, [sessions]);

  // Load session settings when current session changes
  useEffect(() => {
    if (!currentSessionId) return;

    const loadSettings = async () => {
      try {
        const settings = await api.getSessionSettings(currentSessionId);
        setNotifyEnabled(settings.notify_enabled);
        setAutoEnabled(settings.auto_enabled);
        if (settings.session_goal !== undefined) {
          setSessionGoal(currentSessionId, settings.session_goal);
        }
      } catch {
        // Ignore errors
      }
    };

    loadSettings();
  }, [currentSessionId]);

  // Toggle notification for current session
  const handleToggleNotify = useCallback(async () => {
    if (!currentSessionId || notifyLoading) return;

    setNotifyLoading(true);
    const newValue = !notifyEnabled;
    setNotifyEnabled(newValue); // Optimistic update

    try {
      if (newValue) {
        await api.enableSessionNotify(currentSessionId);
      } else {
        await api.disableSessionNotify(currentSessionId);
      }
    } catch {
      setNotifyEnabled(!newValue); // Rollback on error
    } finally {
      setNotifyLoading(false);
    }
  }, [currentSessionId, notifyEnabled, notifyLoading]);

  // Toggle auto-reply for current session
  const handleToggleAuto = useCallback(async () => {
    if (!currentSessionId || autoLoading) return;

    if (!autoEnabled) {
      // Opening: show goal modal instead of directly enabling
      setGoalInput(sessionGoals[currentSessionId] || '');
      setIsGoalEdit(false);
      setShowGoalModal(true);
      return;
    }

    // Closing: disable directly
    setAutoLoading(true);
    setAutoEnabled(false); // Optimistic update

    try {
      await api.disableSessionAuto(currentSessionId);
    } catch {
      setAutoEnabled(true); // Rollback on error
    } finally {
      setAutoLoading(false);
    }
  }, [currentSessionId, autoEnabled, autoLoading, sessionGoals]);

  // Confirm enabling unattended mode with goal
  const handleConfirmGoal = useCallback(async () => {
    if (!currentSessionId || autoLoading) return;

    setAutoLoading(true);
    setAutoEnabled(true); // Optimistic update
    setShowGoalModal(false);

    try {
      await api.enableSessionAuto(currentSessionId, goalInput);
      setSessionGoal(currentSessionId, goalInput);
    } catch {
      setAutoEnabled(false); // Rollback on error
    } finally {
      setAutoLoading(false);
    }
  }, [currentSessionId, autoLoading, goalInput, setSessionGoal]);

  // Save goal from modal (edit mode)
  const handleSaveGoalEdit = useCallback(async () => {
    if (!currentSessionId) return;
    setShowGoalModal(false);
    try {
      await api.setSessionGoal(currentSessionId, goalInput);
      setSessionGoal(currentSessionId, goalInput);
    } catch {
      // Ignore errors
    }
  }, [currentSessionId, goalInput, setSessionGoal]);

  // Toggle persistence for current session
  const handleTogglePersist = useCallback(() => {
    if (!currentSession || !onTogglePersist) return;
    onTogglePersist(currentSession.id, currentSession.is_persistent || false);
  }, [currentSession, onTogglePersist]);

  const handleCopyTmuxCmd = () => {
    if (currentSession?.tmux_cmd) {
      copyToClipboard(currentSession.tmux_cmd).then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      });
    }
  };

  return (
    <div className="flex h-screen bg-canvas text-text-primary">
      {/* Sidebar */}
      <aside className={`${sidebarCollapsed ? 'w-12' : 'w-56'} border-r border-theme-border/50 transition-all flex flex-col bg-surface`}>
        <div className="p-2 border-b border-theme-border/50">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full p-2 text-text-secondary hover:text-text-primary hover:bg-surface-highlight rounded-lg transition-colors"
            title={sidebarCollapsed ? t('desktop_sidebar_expand') : t('desktop_sidebar_collapse')}
          >
            {sidebarCollapsed ? (
              <svg className="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            ) : (
              <svg className="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            )}
          </button>
        </div>

        {!sidebarCollapsed && (
          <div className="flex-1 p-2 overflow-y-auto">
            <div className="text-xs text-text-secondary uppercase mb-2 px-1">{t('sessions_count')} ({sessions.length})</div>
            <div className="space-y-1.5">
              {sortedSessions.map((session) => (
                <div
                  key={session.id}
                  className={`rounded-lg px-3 py-2.5 cursor-pointer transition-all group shadow-sm ${
                    session.id === currentSessionId
                      ? 'bg-accent/10 border border-accent/40 shadow-accent/10'
                      : 'bg-surface hover:bg-surface-highlight border border-theme-border hover:border-accent/30'
                  }`}
                  onClick={() => session.id !== currentSessionId && onSwitchSession(session.id)}
                >
                  {/* Row 1: Session Name (bold, larger) */}
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className={`truncate font-semibold text-sm ${
                      session.id === currentSessionId ? 'text-accent' : 'text-text-primary'
                    }`}>
                      {session.title || `Session ${session.id.substring(0, 6)}`}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Current session checkmark */}
                      {session.id === currentSessionId && (
                        <svg className="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      {/* Archive button - only for persistent sessions not current */}
                      {session.id !== currentSessionId && session.is_persistent && onArchiveSession && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onArchiveSession(session.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-yellow-500 p-1 transition-all rounded hover:bg-yellow-500/10 flex-shrink-0"
                          title="归档"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                          </svg>
                        </button>
                      )}
                      {/* Delete button */}
                      {session.id !== currentSessionId && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(t('session_delete_confirm'))) {
                              onDeleteSession(session.id);
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-error p-1 transition-all rounded hover:bg-error/10 flex-shrink-0"
                          title={t('delete')}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Row 2: Status + Time (smaller, secondary) */}
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    {/* Status dot or AI indicator */}
                    {aiEnabled && summaries[session.id] ? (
                      <AIStatusIndicator sessionId={session.id} />
                    ) : (
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        session.state === 'active' ? 'bg-success' : 'bg-warning'
                      }`}></span>
                    )}
                    <span className="truncate">
                      {aiEnabled && summaries[session.id]
                        ? formatRelativeTimeI18n(new Date(summaries[session.id].timestamp * 1000).toISOString(), t)
                        : formatRelativeTimeI18n(session.last_active, t)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                const name = prompt(t('session_name_placeholder'));
                onCreateSession(name || undefined);
              }}
              className="w-full mt-3 p-2.5 text-sm bg-surface-highlight/50 hover:bg-green-700/50 rounded-lg transition-all flex items-center justify-center gap-1.5 border border-theme-border/50 hover:border-green-600/50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>{t('session_new')}</span>
            </button>
          </div>
        )}

        {sidebarCollapsed && (
          <div className="flex-1 p-2 flex flex-col items-center">
            <div className="text-xs text-text-secondary mb-2">{sessions.length}</div>
            {sortedSessions.slice(0, 5).map((session) => {
              const summary = aiEnabled ? summaries[session.id] : undefined;
              const dotColor = summary
                ? getTagDotColor(summary.tag)
                : session.state === 'active' ? 'bg-green-500' : 'bg-yellow-500';
              const tooltip = summary
                ? `${session.title || session.id.substring(0, 6)} - ${summary.tag}: ${summary.description}`
                : session.title || `Session ${session.id.substring(0, 6)}`;
              return (
                <button
                  key={session.id}
                  onClick={() => session.id !== currentSessionId && onSwitchSession(session.id)}
                  className={`w-8 h-8 rounded-lg mb-1 flex items-center justify-center transition-all ${
                    session.id === currentSessionId
                      ? 'bg-green-700/50 border border-green-600/50'
                      : 'bg-surface-highlight/50 hover:bg-surface-highlight'
                  }`}
                  title={tooltip}
                >
                  <span className={`w-2 h-2 rounded-full ${dotColor}`}></span>
                </button>
              );
            })}
          </div>
        )}

        <div className="p-2 border-t border-theme-border/50 mt-auto">
          <button
            onClick={onLogout}
            className="w-full p-2 text-text-secondary hover:text-text-primary hover:bg-surface-highlight rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
            title={t('logout')}
          >
            {sidebarCollapsed ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>{t('logout')}</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="h-11 flex items-center justify-between px-4 bg-surface/80 border-b border-theme-border/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            {/* Back to sessions button */}
            <button
              onClick={onBackToSessions}
              className="flex items-center gap-1.5 px-2 py-1 text-text-secondary hover:text-text-primary hover:bg-surface-highlight rounded-lg transition-colors text-sm"
              title={t('session_back')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">{t('sessions_title')}</span>
            </button>

            <div className="w-px h-5 bg-theme-border"></div>

            {/* Current session info */}
            {currentSession && (
              <div className="flex items-center gap-2">
                {/* AI status indicator (when enabled) or status dot */}
                {aiEnabled && summaries[currentSessionId!] ? (
                  <AIStatusIndicator sessionId={currentSessionId!} />
                ) : (
                  <span className={`w-2 h-2 rounded-full ${
                    currentSession.state === 'active' ? 'bg-green-500' : 'bg-yellow-500'
                  }`}></span>
                )}
                <span className="text-sm font-medium text-text-primary truncate max-w-[200px]">
                  {currentSession.title || `Session ${currentSession.id.substring(0, 8)}`}
                </span>
                {/* AI description (when enabled) */}
                {aiEnabled && summaries[currentSessionId!] && (
                  <span className="text-xs text-text-secondary truncate max-w-[300px] hidden lg:inline">
                    {summaries[currentSessionId!].description}
                  </span>
                )}
                {currentSession.tmux_cmd && (
                  <button
                    onClick={handleCopyTmuxCmd}
                    className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-all ${
                      copySuccess
                        ? 'bg-green-600/20 text-green-400'
                        : 'bg-surface-highlight/50 text-text-secondary hover:text-text-primary hover:bg-surface-highlight'
                    }`}
                    title={t('session_copy_tmux')}
                  >
                    {copySuccess ? (
                      <>
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        <span>{t('session_copied')}</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                          <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                        </svg>
                        <span className="hidden md:inline">tmux</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
            {/* IDE context button */}
            {ideConfig?.enabled && (
              <div className="relative">
                <button
                  ref={ideButtonRef}
                  onClick={() => setIdePopoverOpen(!idePopoverOpen)}
                  className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-all ${
                    idePopoverOpen
                      ? 'bg-purple-600/20 text-purple-400'
                      : ideHasChange
                        ? 'bg-purple-600/30 text-purple-300 animate-pulse'
                        : ideConnected
                          ? 'bg-surface-highlight/50 text-text-secondary hover:text-text-primary'
                          : 'bg-surface-highlight/50 text-gray-600'
                  }`}
                  title={t('ide_panel_title')}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  <span className={`w-1.5 h-1.5 rounded-full ${ideConnected ? 'bg-green-400' : 'bg-gray-500'}`} />
                </button>
                <IDEContextPopover
                  isOpen={idePopoverOpen}
                  onClose={() => setIdePopoverOpen(false)}
                  anchorRef={ideButtonRef}
                  config={ideConfig}
                />
              </div>
            )}
            <button
              onClick={() => setShowFiles((prev) => !prev)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-all ${
                showFiles
                  ? 'bg-accent/20 text-accent hover:bg-accent/30'
                  : 'bg-surface-highlight/50 text-text-secondary hover:text-text-primary hover:bg-surface-highlight'
              }`}
              title={t('files_title')}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h6l2 2h10v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              <span className="hidden md:inline">{t('files_title')}</span>
            </button>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('toggle-copy-mode'))}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-all ${
                copyModeActive
                  ? 'bg-accent/20 text-accent hover:bg-accent/30'
                  : 'bg-surface-highlight/50 text-text-secondary hover:text-text-primary hover:bg-surface-highlight'
              }`}
              title="Copy Mode"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              <span className="hidden md:inline">Copy</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Notification toggle */}
            {currentSession && aiEnabled && (
              <button
                onClick={handleToggleNotify}
                disabled={notifyLoading}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-all ${
                  notifyEnabled
                    ? 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30'
                    : 'bg-surface-highlight/50 text-text-secondary hover:text-text-primary hover:bg-surface-highlight'
                }`}
                title={notifyEnabled ? t('session_notify_on') : t('session_notify_off')}
              >
                <svg className="w-3 h-3" fill={notifyEnabled ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="hidden md:inline">{notifyEnabled ? t('session_notify_on') : t('session_notify_off')}</span>
              </button>
            )}
            {/* Auto-reply toggle */}
            {currentSession && aiEnabled && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleToggleAuto}
                  disabled={autoLoading}
                  className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-all ${
                    autoEnabled
                      ? 'bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30'
                      : 'bg-surface-highlight/50 text-text-secondary hover:text-text-primary hover:bg-surface-highlight'
                  }`}
                  title={autoEnabled ? t('session_auto_on') : t('session_auto_off')}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="hidden md:inline">{autoEnabled ? t('session_auto_on') : t('session_auto_off')}</span>
                </button>
                {/* Goal display (when auto enabled) */}
                {autoEnabled && currentSessionId && (
                  <button
                    onClick={() => {
                      setGoalInput(sessionGoals[currentSessionId] || '');
                      setIsGoalEdit(true);
                      setShowGoalModal(true);
                    }}
                    className="px-2 py-0.5 text-xs text-cyan-400/70 hover:text-cyan-300 truncate max-w-[300px] transition-colors"
                    title={t('unattended_goal_edit')}
                  >
                    {sessionGoals[currentSessionId] || t('unattended_goal_empty')}
                  </button>
                )}
              </div>
            )}
            {/* Auto-action logs toggle - only show when auto-reply is OFF */}
            {currentSession && aiEnabled && !autoEnabled && (
              <button
                onClick={() => setShowLogs(!showLogs)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-all ${
                  showLogs
                    ? 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30'
                    : 'bg-surface-highlight/50 text-text-secondary hover:text-text-primary hover:bg-surface-highlight'
                }`}
                title={t('session_view_logs')}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="hidden md:inline">{t('auto_logs_title')}</span>
              </button>
            )}
            {/* Persistence toggle */}
            {currentSession && onTogglePersist && (
              <button
                onClick={handleTogglePersist}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-all ${
                  currentSession.is_persistent
                    ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                    : 'bg-surface-highlight/50 text-text-secondary hover:text-text-primary hover:bg-surface-highlight'
                }`}
                title={currentSession.is_persistent ? t('session_persist_on') : t('session_persist_off')}
              >
                <svg className="w-3 h-3" fill={currentSession.is_persistent ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                <span className="hidden md:inline">{currentSession.is_persistent ? t('session_persist_on') : t('session_persist_off')}</span>
              </button>
            )}
            <span className="text-xs text-text-secondary px-2 py-0.5 bg-surface-highlight/50 rounded-md">{t('desktop_mode')}</span>
            {/* Theme toggle */}
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-all bg-surface-highlight/50 text-text-secondary hover:text-text-primary hover:bg-surface-highlight"
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>
        </header>

        {/* Terminal area with optional logs panel */}
        <div className="flex-1 overflow-hidden flex">
          {/* Terminal */}
          <div className={`flex-1 overflow-hidden flex flex-col transition-all ${showLogs ? 'mr-0' : ''}`}>
            <div className="flex-1 overflow-hidden">
              {children}
            </div>
          </div>

          {/* Logs panel - auto show when autoEnabled, or manual toggle */}
          {(autoEnabled || showLogs) && currentSessionId && (
            <div className="w-80 border-l border-theme-border/50 bg-surface/95 backdrop-blur-sm flex flex-col overflow-hidden">
              {/* Panel content - AutoActionLogs 组件内部已有 header */}
              <div className="flex-1 overflow-y-auto p-3">
                <AutoActionLogs
                  key={currentSessionId}
                  sessionId={currentSessionId}
                  compact
                  onClose={!autoEnabled ? () => setShowLogs(false) : undefined}
                />
              </div>
            </div>
          )}

          <FileManagerPanel
            isOpen={showFiles}
            onClose={() => setShowFiles(false)}
            sessionId={currentSessionId}
            currentPath={currentSession?.current_path}
            canWrite={userRole === 'admin'}
          />
        </div>
      </main>

      {/* Goal input modal */}
      {showGoalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-theme-border rounded-2xl shadow-2xl w-full max-w-md mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-text-primary mb-2">{t('unattended_goal_title')}</h3>
              <p className="text-sm text-text-secondary mb-4">{t('unattended_goal_desc')}</p>
              <textarea
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                placeholder={t('unattended_goal_placeholder')}
                rows={3}
                autoFocus
                className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-text-secondary/50 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all resize-none"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); isGoalEdit ? handleSaveGoalEdit() : handleConfirmGoal(); } }}
              />
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6">
              <button
                onClick={() => setShowGoalModal(false)}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary bg-surface-highlight/50 hover:bg-surface-highlight rounded-lg transition-all"
              >
                {t('cancel')}
              </button>
              <button
                onClick={isGoalEdit ? handleSaveGoalEdit : handleConfirmGoal}
                disabled={autoLoading}
                className="px-4 py-2 text-sm text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-all disabled:opacity-50"
              >
                {isGoalEdit ? t('save') : t('unattended_enable')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
