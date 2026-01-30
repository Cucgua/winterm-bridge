import React, { useState } from 'react';
import { SessionInfo } from '../core/api';
import { useI18n, formatRelativeTimeI18n } from '../i18n';
import { LanguageSelector } from './LanguageSelector';
import { copyToClipboard } from '../utils/clipboard';

interface SessionPickerProps {
  sessions: SessionInfo[];
  onSelect: (sessionId: string) => void;
  onCreate: (title?: string) => void;
  onDelete: (sessionId: string) => void;
  onLogout: () => void;
  onTogglePersist?: (sessionId: string, isPersistent: boolean) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const SessionPicker: React.FC<SessionPickerProps> = ({
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
    <div className="flex flex-col h-full bg-black text-white p-4 pb-safe">
      <div className="w-full max-w-md mx-auto flex flex-col flex-1 min-h-0">
        {/* Header with logo */}
        <div className="text-center mb-4 flex-shrink-0">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 mb-2 shadow-lg shadow-green-500/20">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            {t('app_name')}
          </h1>
        </div>

        {/* Title bar */}
        <div className="flex justify-between items-center mb-3 flex-shrink-0">
          <h2 className="text-base font-semibold text-white">{t('sessions_title')}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              title={t('session_refresh')}
            >
              <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <LanguageSelector />
            <button
              onClick={onLogout}
              className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">{t('logout')}</span>
            </button>
          </div>
        </div>

        {/* Session list - flex-1 to take remaining space */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 mb-3 pr-1">
          {sortedSessions.length === 0 ? (
            <div className="text-center py-10 text-gray-500 bg-gray-900/50 rounded-xl border border-gray-800/50">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p>{t('sessions_empty')}</p>
            </div>
          ) : (
            sortedSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => onSelect(session.id)}
                className={`bg-gray-900/60 backdrop-blur-sm rounded-xl p-4 transition-all cursor-pointer hover:scale-[1.01] ${
                  session.is_ghost
                    ? 'border border-dashed border-gray-600 hover:border-green-500'
                    : session.is_persistent
                    ? 'border border-yellow-600/40 hover:border-green-500'
                    : 'border border-gray-800/50 hover:border-green-500'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-mono text-base font-semibold text-gray-100 truncate">
                        {session.title || `Session ${session.id.substring(0, 8)}`}
                      </h3>
                      {session.is_ghost && (
                        <span className="text-xs px-1.5 py-0.5 bg-gray-700/80 text-gray-400 rounded-md">
                          {t('session_state_idle')}
                        </span>
                      )}
                      {session.is_persistent && (
                        <svg className="w-4 h-4 text-yellow-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1.5 flex items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${
                        session.is_ghost
                          ? 'bg-gray-500'
                          : session.state === 'active'
                          ? 'bg-green-500'
                          : 'bg-yellow-500'
                      }`}></span>
                      <span>{session.is_ghost ? t('session_state_ghost') : (session.state === 'active' ? t('session_state_active') : t('session_state_idle'))}</span>
                      <span className="text-gray-700">•</span>
                      <span>{formatRelativeTimeI18n(session.last_active, t)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 ml-3">
                    {/* Persist toggle button */}
                    <button
                      onClick={(e) => handleTogglePersist(e, session.id, !!session.is_persistent)}
                      className={`p-2 rounded-lg transition-all ${
                        session.is_persistent
                          ? 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30'
                          : 'bg-gray-800/80 text-gray-500 hover:bg-gray-700 hover:text-yellow-400'
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
                        className="p-2 bg-gray-800/80 hover:bg-blue-600 text-gray-500 hover:text-white rounded-lg transition-all"
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
                      className="p-2 bg-gray-800/80 hover:bg-red-600 text-gray-500 hover:text-white rounded-lg transition-all"
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
                      className="px-3.5 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg font-medium transition-all text-sm shadow-lg shadow-green-500/10"
                    >
                      {session.is_ghost ? t('session_revive') : t('session_join')}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Create session form - fixed at bottom */}
        <div className="flex-shrink-0 bg-gray-900/40 backdrop-blur-sm rounded-xl p-3 border border-gray-800/50">
          <input
            type="text"
            value={newSessionName}
            onChange={(e) => setNewSessionName(e.target.value)}
            placeholder={t('session_name_placeholder')}
            className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all mb-2 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button
            onClick={handleCreate}
            className="w-full py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-500/20 text-sm"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            <span>{t('session_create')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
