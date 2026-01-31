import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { SessionInfo, api } from '../../shared/core/api';
import { useI18n } from '../../shared/i18n';
import { copyToClipboard } from '../../shared/utils/clipboard';
import { AIStatusIndicator, getTagDotColor } from '../../shared/components/AIStatusBadge';
import { useAIStore } from '../../shared/stores/aiStore';

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
}: DesktopLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const { t } = useI18n();
  const aiEnabled = useAIStore((state) => state.aiEnabled);
  const summaries = useAIStore((state) => state.summaries);

  // Session notification state
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyLoading, setNotifyLoading] = useState(false);

  const currentSession = sessions.find(s => s.id === currentSessionId);

  // Sort sessions: persistent first, then by creation time (stable order)
  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      if (a.is_persistent && !b.is_persistent) return -1;
      if (!a.is_persistent && b.is_persistent) return 1;
      // Use created_at for stable sorting instead of last_active
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
    <div className="flex h-screen bg-black text-white">
      {/* Sidebar */}
      <aside className={`${sidebarCollapsed ? 'w-12' : 'w-56'} border-r border-gray-800/50 transition-all flex flex-col bg-gray-950`}>
        <div className="p-2 border-b border-gray-800/50">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
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
            <div className="text-xs text-gray-500 uppercase mb-2 px-1">{t('sessions_count')} ({sessions.length})</div>
            <div className="space-y-1">
              {sortedSessions.map((session) => (
                <div
                  key={session.id}
                  className={`rounded-lg px-2.5 py-1.5 text-sm cursor-pointer transition-all group ${
                    session.id === currentSessionId
                      ? 'bg-gradient-to-r from-green-900/80 to-emerald-900/60 border border-green-700/50'
                      : 'bg-gray-800/50 hover:bg-gray-700/50 border border-transparent'
                  }`}
                  onClick={() => session.id !== currentSessionId && onSwitchSession(session.id)}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {/* Status dot or AI indicator */}
                      {aiEnabled && summaries[session.id] ? (
                        <AIStatusIndicator sessionId={session.id} />
                      ) : (
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          session.state === 'active' ? 'bg-green-500' : 'bg-yellow-500'
                        }`}></span>
                      )}
                      <span className="truncate font-medium text-xs">
                        {session.title || `Session ${session.id.substring(0, 6)}`}
                      </span>
                      {/* Current session checkmark */}
                      {session.id === currentSessionId && (
                        <svg className="w-3 h-3 text-green-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    {session.id !== currentSessionId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(t('session_delete_confirm'))) {
                            onDeleteSession(session.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 p-0.5 transition-all rounded flex-shrink-0"
                        title={t('delete')}
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                const name = prompt(t('session_name_placeholder'));
                onCreateSession(name || undefined);
              }}
              className="w-full mt-3 p-2.5 text-sm bg-gray-800/50 hover:bg-green-700/50 rounded-lg transition-all flex items-center justify-center gap-1.5 border border-gray-700/50 hover:border-green-600/50"
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
            <div className="text-xs text-gray-500 mb-2">{sessions.length}</div>
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
                      : 'bg-gray-800/50 hover:bg-gray-700/50'
                  }`}
                  title={tooltip}
                >
                  <span className={`w-2 h-2 rounded-full ${dotColor}`}></span>
                </button>
              );
            })}
          </div>
        )}

        <div className="p-2 border-t border-gray-800/50 mt-auto">
          <button
            onClick={onLogout}
            className="w-full p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
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
        <header className="h-11 flex items-center justify-between px-4 bg-gray-900/80 border-b border-gray-800/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            {/* Back to sessions button */}
            <button
              onClick={onBackToSessions}
              className="flex items-center gap-1.5 px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors text-sm"
              title={t('session_back')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">{t('sessions_title')}</span>
            </button>

            <div className="w-px h-5 bg-gray-700"></div>

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
                <span className="text-sm font-medium text-white truncate max-w-[200px]">
                  {currentSession.title || `Session ${currentSession.id.substring(0, 8)}`}
                </span>
                {/* AI description (when enabled) */}
                {aiEnabled && summaries[currentSessionId!] && (
                  <span className="text-xs text-gray-400 truncate max-w-[300px] hidden lg:inline">
                    {summaries[currentSessionId!].description}
                  </span>
                )}
                {currentSession.tmux_cmd && (
                  <button
                    onClick={handleCopyTmuxCmd}
                    className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-all ${
                      copySuccess
                        ? 'bg-green-600/20 text-green-400'
                        : 'bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700'
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
                    : 'bg-gray-800/50 text-gray-500 hover:text-gray-300 hover:bg-gray-700'
                }`}
                title={notifyEnabled ? t('session_notify_on') : t('session_notify_off')}
              >
                <svg className="w-3 h-3" fill={notifyEnabled ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="hidden md:inline">{notifyEnabled ? t('session_notify_on') : t('session_notify_off')}</span>
              </button>
            )}
            {/* Persistence toggle */}
            {currentSession && onTogglePersist && (
              <button
                onClick={handleTogglePersist}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-all ${
                  currentSession.is_persistent
                    ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                    : 'bg-gray-800/50 text-gray-500 hover:text-gray-300 hover:bg-gray-700'
                }`}
                title={currentSession.is_persistent ? t('session_persist_on') : t('session_persist_off')}
              >
                <svg className="w-3 h-3" fill={currentSession.is_persistent ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                <span className="hidden md:inline">{currentSession.is_persistent ? t('session_persist_on') : t('session_persist_off')}</span>
              </button>
            )}
            <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-800/50 rounded-md">{t('desktop_mode')}</span>
          </div>
        </header>

        {/* Terminal area */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
