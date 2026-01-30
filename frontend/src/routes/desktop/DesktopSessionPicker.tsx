import React, { useState } from 'react';
import { SessionInfo } from '../../shared/core/api';
import { useI18n, formatRelativeTimeI18n } from '../../shared/i18n';
import { LanguageSelector } from '../../shared/components/LanguageSelector';
import { copyToClipboard } from '../../shared/utils/clipboard';

interface DesktopSessionPickerProps {
  sessions: SessionInfo[];
  onSelect: (sessionId: string) => void;
  onCreate: (title?: string) => void;
  onDelete: (sessionId: string) => void;
  onLogout: () => void;
  onTogglePersist?: (sessionId: string, isPersistent: boolean) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const DesktopSessionPicker: React.FC<DesktopSessionPickerProps> = ({
  sessions,
  onSelect,
  onCreate,
  onDelete,
  onLogout,
  onTogglePersist,
  onRefresh,
  isRefreshing,
}) => {
  const [newSessionName, setNewSessionName] = useState('');
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  const { t } = useI18n();

  const handleDelete = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (confirm(t('session_delete_confirm'))) {
      onDelete(sessionId);
    }
  };

  const handleCopyTmuxCmd = (e: React.MouseEvent, tmuxCmd: string) => {
    e.stopPropagation();
    copyToClipboard(tmuxCmd).then(() => {
      alert(t('session_copied'));
    }).catch(() => {
      alert(t('session_copy_failed') + ': ' + tmuxCmd);
    });
  };

  const handleTogglePersist = (e: React.MouseEvent, sessionId: string, isPersistent: boolean) => {
    e.stopPropagation();
    onTogglePersist?.(sessionId, isPersistent);
  };

  const handleCreate = () => {
    onCreate(newSessionName.trim() || undefined);
    setNewSessionName('');
  };

  // Sort sessions: persistent first, then by last_active
  const sortedSessions = [...sessions].sort((a, b) => {
    if (a.is_persistent && !b.is_persistent) return -1;
    if (!a.is_persistent && b.is_persistent) return 1;
    return new Date(b.last_active).getTime() - new Date(a.last_active).getTime();
  });

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-gray-800/50 bg-black/30 backdrop-blur-sm overflow-visible relative z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              {t('app_name')}
            </h1>
            <p className="text-xs text-gray-500">{t('sessions_title')}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <LanguageSelector />
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg transition-all disabled:opacity-50"
            title={t('session_refresh')}
          >
            <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t('session_refresh')}
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {t('logout')}
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Sessions grid */}
        <div className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-5xl mx-auto">
            {sortedSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <svg className="w-16 h-16 mb-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <p className="text-lg">{t('sessions_empty')}</p>
                <p className="text-sm text-gray-600 mt-1">Create a new session to get started</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedSessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => onSelect(session.id)}
                    onMouseEnter={() => setHoveredSession(session.id)}
                    onMouseLeave={() => setHoveredSession(null)}
                    className={`group relative bg-gray-900/50 backdrop-blur-sm rounded-2xl p-5 transition-all cursor-pointer hover:scale-[1.02] hover:shadow-xl ${
                      session.is_ghost
                        ? 'border border-dashed border-gray-600 hover:border-green-500/50'
                        : session.is_persistent
                        ? 'border border-yellow-600/30 hover:border-green-500/50'
                        : 'border border-gray-800/50 hover:border-green-500/50'
                    } ${hoveredSession === session.id ? 'bg-gray-800/50' : ''}`}
                  >
                    {/* Persistent badge */}
                    {session.is_persistent && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center shadow-lg">
                        <svg className="w-3.5 h-3.5 text-black" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      </div>
                    )}

                    {/* Session info */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          session.is_ghost
                            ? 'bg-gray-500'
                            : session.state === 'active'
                            ? 'bg-green-500 shadow-lg shadow-green-500/50'
                            : 'bg-yellow-500'
                        }`}></div>
                        <h3 className="font-mono text-base font-semibold text-white truncate max-w-[180px]">
                          {session.title || `Session ${session.id.substring(0, 8)}`}
                        </h3>
                      </div>
                      {session.is_ghost && (
                        <span className="text-xs px-2 py-0.5 bg-gray-700/80 text-gray-400 rounded-full">
                          {t('session_state_ghost')}
                        </span>
                      )}
                    </div>

                    {/* Status and time */}
                    <div className="text-xs text-gray-500 mb-4 flex items-center gap-2">
                      <span className={session.state === 'active' ? 'text-green-400' : ''}>
                        {session.is_ghost ? t('session_state_ghost') : (session.state === 'active' ? t('session_state_active') : t('session_state_idle'))}
                      </span>
                      <span className="text-gray-700">•</span>
                      <span>{formatRelativeTimeI18n(session.last_active, t)}</span>
                    </div>

                    {/* Tmux name */}
                    {session.tmux_name && !session.is_ghost && (
                      <div className="text-xs text-gray-600 font-mono mb-4 truncate">
                        tmux: {session.tmux_name}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 mt-auto pt-3 border-t border-gray-800/50">
                      <button
                        onClick={(e) => handleTogglePersist(e, session.id, !!session.is_persistent)}
                        className={`p-2 rounded-lg transition-all ${
                          session.is_persistent
                            ? 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30'
                            : 'bg-gray-800/50 text-gray-500 hover:bg-gray-700 hover:text-yellow-400'
                        }`}
                        title={session.is_persistent ? t('session_persist_remove') : t('session_persist_add')}
                      >
                        <svg className="h-4 w-4" fill={session.is_persistent ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={session.is_persistent ? 0 : 2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                      </button>
                      {session.tmux_cmd && !session.is_ghost && (
                        <button
                          onClick={(e) => handleCopyTmuxCmd(e, session.tmux_cmd!)}
                          className="p-2 bg-gray-800/50 hover:bg-blue-600 text-gray-500 hover:text-white rounded-lg transition-all"
                          title={t('session_copy_tmux')}
                        >
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                            <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDelete(e, session.id)}
                        className="p-2 bg-gray-800/50 hover:bg-red-600 text-gray-500 hover:text-white rounded-lg transition-all"
                        title={t('delete')}
                      >
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(session.id);
                        }}
                        className="flex-1 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg font-medium transition-all text-sm shadow-lg shadow-green-500/10"
                      >
                        {session.is_ghost ? t('session_revive') : t('session_join')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Create new session */}
        <aside className="w-80 border-l border-gray-800/50 bg-black/30 backdrop-blur-sm p-6 flex flex-col">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('session_create')}
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">{t('session_name_placeholder')}</label>
              <input
                type="text"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="my-project"
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>

            <button
              onClick={handleCreate}
              className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-500/20"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              <span>{t('session_create')}</span>
            </button>
          </div>

          {/* Stats */}
          <div className="mt-auto pt-6 border-t border-gray-800/50">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-900/30 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-green-400">{sessions.filter(s => s.state === 'active').length}</div>
                <div className="text-xs text-gray-500 mt-1">{t('session_state_active')}</div>
              </div>
              <div className="bg-gray-900/30 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-gray-400">{sessions.length}</div>
                <div className="text-xs text-gray-500 mt-1">Total</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
