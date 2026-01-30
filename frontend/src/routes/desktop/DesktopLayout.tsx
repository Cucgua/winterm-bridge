import React, { useState } from 'react';
import { SessionInfo } from '../../shared/core/api';
import { useI18n } from '../../shared/i18n';
import { copyToClipboard } from '../../shared/utils/clipboard';

interface DesktopLayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
  onBackToSessions: () => void;
  sessions: SessionInfo[];
  currentSessionId?: string;
  onSwitchSession: (sessionId: string) => void;
  onCreateSession: (title?: string) => void;
  onDeleteSession: (sessionId: string) => void;
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
}: DesktopLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const { t } = useI18n();

  const currentSession = sessions.find(s => s.id === currentSessionId);

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
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`rounded-lg p-2.5 text-sm cursor-pointer transition-all group ${
                    session.id === currentSessionId
                      ? 'bg-gradient-to-r from-green-900/80 to-emerald-900/60 border border-green-700/50'
                      : 'bg-gray-800/50 hover:bg-gray-700/50 border border-transparent'
                  }`}
                  onClick={() => session.id !== currentSessionId && onSwitchSession(session.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        session.state === 'active' ? 'bg-green-500' : 'bg-yellow-500'
                      }`}></span>
                      <span className="truncate font-medium">
                        {session.title || `Session ${session.id.substring(0, 6)}`}
                      </span>
                    </div>
                    {session.id !== currentSessionId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(t('session_delete_confirm'))) {
                            onDeleteSession(session.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 p-1 transition-all rounded"
                        title={t('delete')}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {session.id === currentSessionId && (
                    <div className="text-xs text-green-400 mt-1 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {t('session_current')}
                    </div>
                  )}
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
            {sessions.slice(0, 5).map((session) => (
              <button
                key={session.id}
                onClick={() => session.id !== currentSessionId && onSwitchSession(session.id)}
                className={`w-8 h-8 rounded-lg mb-1 flex items-center justify-center transition-all ${
                  session.id === currentSessionId
                    ? 'bg-green-700/50 border border-green-600/50'
                    : 'bg-gray-800/50 hover:bg-gray-700/50'
                }`}
                title={session.title || `Session ${session.id.substring(0, 6)}`}
              >
                <span className={`w-2 h-2 rounded-full ${
                  session.state === 'active' ? 'bg-green-500' : 'bg-yellow-500'
                }`}></span>
              </button>
            ))}
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
                <span className={`w-2 h-2 rounded-full ${
                  currentSession.state === 'active' ? 'bg-green-500' : 'bg-yellow-500'
                }`}></span>
                <span className="text-sm font-medium text-white truncate max-w-[200px]">
                  {currentSession.title || `Session ${currentSession.id.substring(0, 8)}`}
                </span>
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
