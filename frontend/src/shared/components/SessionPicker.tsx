import React, { useState, useEffect } from 'react';
import { SessionInfo, api } from '../core/api';
import { useI18n, formatRelativeTimeI18n } from '../i18n';
import { LanguageSelector } from './LanguageSelector';
import { copyToClipboard } from '../utils/clipboard';
import { AIStatusTag } from './AIStatusBadge';
import { AISettings } from './AISettings';
import { useAIStore } from '../stores/aiStore';

interface SessionPickerProps {
  sessions: SessionInfo[];
  onSelect: (sessionId: string) => void;
  onCreate: (title?: string) => void;
  onDelete: (sessionId: string) => void;
  onLogout: () => void;
  onTogglePersist?: (sessionId: string, isPersistent: boolean) => void;
  onToggleNotify?: (sessionId: string, isNotifyEnabled: boolean) => void;
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
  onToggleNotify,
  onRefresh,
  isRefreshing,
}) => {
  const [newSessionName, setNewSessionName] = useState('');
  const [showAISettings, setShowAISettings] = useState(false);
  const [notifyStatus, setNotifyStatus] = useState<Record<string, boolean>>({});
  const { t } = useI18n();
  const aiEnabled = useAIStore((state) => state.aiEnabled);
  const summaries = useAIStore((state) => state.summaries);

  // Fetch notification status for all sessions
  useEffect(() => {
    const fetchNotifyStatus = async () => {
      const status: Record<string, boolean> = {};
      for (const session of sessions) {
        try {
          const settings = await api.getSessionSettings(session.id);
          status[session.id] = settings.notify_enabled;
        } catch {
          status[session.id] = false;
        }
      }
      setNotifyStatus(status);
    };
    if (sessions.length > 0) {
      fetchNotifyStatus();
    }
  }, [sessions]);

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

  const handleToggleNotify = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const currentStatus = notifyStatus[sessionId] ?? false;
    // Optimistic update
    setNotifyStatus(prev => ({ ...prev, [sessionId]: !currentStatus }));
    try {
      if (currentStatus) {
        await api.disableSessionNotify(sessionId);
      } else {
        await api.enableSessionNotify(sessionId);
      }
      onToggleNotify?.(sessionId, currentStatus);
    } catch {
      // Rollback on error
      setNotifyStatus(prev => ({ ...prev, [sessionId]: currentStatus }));
    }
  };

  const handleCreate = () => {
    onCreate(newSessionName.trim() || undefined);
    setNewSessionName('');
  };

  // Sort sessions: persistent first, then by creation time (stable order)
  const sortedSessions = [...sessions].sort((a, b) => {
    if (a.is_persistent && !b.is_persistent) return -1;
    if (!a.is_persistent && b.is_persistent) return 1;
    // Use created_at for stable sorting instead of last_active
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
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
            {/* AI Settings button */}
            <button
              onClick={() => setShowAISettings(true)}
              className="p-2 text-gray-400 hover:text-purple-400 transition-colors"
              title={t('ai_settings_title')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </button>
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
            sortedSessions.map((session) => {
              const isNotifyEnabled = notifyStatus[session.id] ?? false;
              return (
                <div
                  key={session.id}
                  onClick={() => onSelect(session.id)}
                  className={`bg-gray-900/60 backdrop-blur-sm rounded-xl p-3 transition-all cursor-pointer active:scale-[0.98] ${
                    session.is_ghost
                      ? 'border border-dashed border-gray-600'
                      : session.is_persistent
                      ? 'border border-yellow-600/40'
                      : 'border border-gray-800/50'
                  }`}
                >
                  {/* Row 1: Title + Status/Tag + Action icons */}
                  <div className="flex items-center gap-2">
                    {/* Title */}
                    <h3 className="font-mono text-sm font-semibold text-gray-100 truncate flex-1 min-w-0">
                      {session.title || `Session ${session.id.substring(0, 8)}`}
                    </h3>
                    {/* AI status tag or status dot */}
                    {aiEnabled && summaries[session.id] ? (
                      <AIStatusTag
                        tag={summaries[session.id].tag}
                        description={summaries[session.id].description}
                      />
                    ) : (
                      <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                        session.is_ghost
                          ? 'bg-gray-500'
                          : session.state === 'active'
                          ? 'bg-green-500'
                          : 'bg-yellow-500'
                      }`} title={session.is_ghost ? t('session_state_ghost') : (session.state === 'active' ? t('session_state_active') : t('session_state_idle'))}></span>
                    )}
                    {/* Persist toggle - bookmark icon */}
                    <button
                      onClick={(e) => handleTogglePersist(e, session.id, !!session.is_persistent)}
                      className={`p-1.5 rounded-md transition-all ${
                        session.is_persistent
                          ? 'text-yellow-400 bg-yellow-600/20'
                          : 'text-gray-500 hover:text-yellow-400 hover:bg-gray-800'
                      }`}
                      title={session.is_persistent ? t('session_persist_remove') : t('session_persist_add')}
                    >
                      <svg className="w-4 h-4" fill={session.is_persistent ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    </button>
                    {/* Notify toggle - bell icon */}
                    <button
                      onClick={(e) => handleToggleNotify(e, session.id)}
                      className={`p-1.5 rounded-md transition-all ${
                        isNotifyEnabled
                          ? 'text-blue-400 bg-blue-600/20'
                          : 'text-gray-500 hover:text-blue-400 hover:bg-gray-800'
                      }`}
                      title={isNotifyEnabled ? t('session_notify_on') : t('session_notify_off')}
                    >
                      <svg className="w-4 h-4" fill={isNotifyEnabled ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                    </button>
                  </div>
                  {/* Row 2: Description/Time + Actions */}
                  <div className="flex items-center justify-between mt-2">
                    <div className="text-xs text-gray-500 flex items-center gap-1.5 min-w-0 flex-1">
                      {aiEnabled && summaries[session.id] ? (
                        <span className="truncate">{summaries[session.id].description}</span>
                      ) : (
                        <span>{session.is_ghost ? t('session_state_ghost') : (session.state === 'active' ? t('session_state_active') : t('session_state_idle'))}</span>
                      )}
                      <span className="text-gray-700 flex-shrink-0">•</span>
                      <span className="flex-shrink-0">{formatRelativeTimeI18n(session.last_active, t)}</span>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      {/* Copy tmux cmd */}
                      {session.tmux_cmd && !session.is_ghost && (
                        <button
                          onClick={(e) => handleCopyTmuxCmd(e, session.tmux_cmd!)}
                          className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-800 rounded-md transition-all"
                          title={t('session_copy_tmux')}
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                            <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                          </svg>
                        </button>
                      )}
                      {/* Delete */}
                      <button
                        onClick={(e) => handleDelete(e, session.id)}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-md transition-all"
                        title={t('delete')}
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {/* Join button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(session.id);
                        }}
                        className="px-2.5 py-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-md font-medium transition-all text-xs shadow-lg shadow-green-500/10"
                      >
                        {session.is_ghost ? t('session_revive') : t('session_join')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
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

      {/* AI Settings Modal */}
      <AISettings isOpen={showAISettings} onClose={() => setShowAISettings(false)} />
    </div>
  );
};
