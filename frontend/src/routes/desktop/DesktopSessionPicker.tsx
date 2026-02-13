import React, { useState, useEffect } from 'react';
import { SessionInfo, api } from '../../shared/core/api';
import { useI18n, formatRelativeTimeI18n } from '../../shared/i18n';
import { LanguageSelector } from '../../shared/components/LanguageSelector';
import { copyToClipboard } from '../../shared/utils/clipboard';
import { AIStatusTag } from '../../shared/components/AIStatusBadge';
import { AISettings } from '../../shared/components/AISettings';
import { SystemSettings } from '../../shared/components/SystemSettings';
import { AutoActionLogs } from '../../shared/components/AutoActionLogs';
import { useAIStore } from '../../shared/stores/aiStore';

interface DesktopSessionPickerProps {
  sessions: SessionInfo[];
  onSelect: (sessionId: string) => void;
  onCreate: (title?: string) => void;
  onDelete: (sessionId: string) => void;
  onLogout: () => void;
  onTogglePersist?: (sessionId: string, isPersistent: boolean) => void;
  onUnarchiveSession?: (sessionId: string) => void;
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
  onUnarchiveSession,
  onRefresh,
  isRefreshing,
}: DesktopSessionPickerProps) => {
  const [newSessionName, setNewSessionName] = useState('');
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  const [showAISettings, setShowAISettings] = useState(false);
  const [showSystemSettings, setShowSystemSettings] = useState(false);
  const [showLogsFor, setShowLogsFor] = useState<{ id: string; name: string } | null>(null);
  const [notifyStatus, setNotifyStatus] = useState<Record<string, boolean>>({});
  const [autoStatus, setAutoStatus] = useState<Record<string, boolean>>({});
  const [showGoalModal, setShowGoalModal] = useState<string | null>(null); // session ID for goal modal
  const [goalInput, setGoalInput] = useState('');
  const [autoLoading, setAutoLoading] = useState(false);
  const { t } = useI18n();
  const aiEnabled = useAIStore((state) => state.aiEnabled);
  const summaries = useAIStore((state) => state.summaries);

  // Fetch notification and auto-reply status for all sessions
  useEffect(() => {
    const fetchStatus = async () => {
      const nStatus: Record<string, boolean> = {};
      const aStatus: Record<string, boolean> = {};
      for (const session of sessions) {
        try {
          const settings = await api.getSessionSettings(session.id);
          nStatus[session.id] = settings.notify_enabled;
          aStatus[session.id] = settings.auto_enabled;
        } catch {
          nStatus[session.id] = false;
          aStatus[session.id] = false;
        }
      }
      setNotifyStatus(nStatus);
      setAutoStatus(aStatus);
    };
    if (sessions.length > 0) {
      fetchStatus();
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
    } catch {
      // Rollback on error
      setNotifyStatus(prev => ({ ...prev, [sessionId]: currentStatus }));
    }
  };

  const handleToggleAuto = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const currentStatus = autoStatus[sessionId] ?? false;

    if (!currentStatus) {
      // Opening: show goal modal
      setGoalInput('');
      setShowGoalModal(sessionId);
      return;
    }

    // Closing: disable directly
    setAutoStatus(prev => ({ ...prev, [sessionId]: false }));
    try {
      await api.disableSessionAuto(sessionId);
    } catch {
      setAutoStatus(prev => ({ ...prev, [sessionId]: true }));
    }
  };

  const handleConfirmGoal = async () => {
    if (!showGoalModal || autoLoading) return;
    const sessionId = showGoalModal;
    setAutoLoading(true);
    setAutoStatus(prev => ({ ...prev, [sessionId]: true }));
    setShowGoalModal(null);

    try {
      await api.enableSessionAuto(sessionId, goalInput);
    } catch {
      setAutoStatus(prev => ({ ...prev, [sessionId]: false }));
    } finally {
      setAutoLoading(false);
    }
  };

  const handleCreate = () => {
    onCreate(newSessionName.trim() || undefined);
    setNewSessionName('');
  };

  // Sort sessions: persistent -> normal -> ghost -> archived, then by creation time
  const sortedSessions = [...sessions].sort((a, b) => {
    const priority = (s: SessionInfo) => {
      if (s.is_archived) return 3;    // archived always last
      if (s.is_ghost) return 2;       // ghost near bottom (even if persistent)
      if (s.is_persistent) return 0;  // persistent first
      return 1;                       // normal in between
    };
    const pa = priority(a), pb = priority(b);
    if (pa !== pb) return pa - pb;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  return (
    <div className="flex flex-col h-screen bg-canvas text-text-primary transition-colors duration-200">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-theme-border bg-surface/80 backdrop-blur-sm overflow-visible relative z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">
              {t('app_name')}
            </h1>
            <p className="text-xs text-text-secondary">{t('sessions_title')}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <LanguageSelector />
          {/* System Settings button */}
          <button
            onClick={() => setShowSystemSettings(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-highlight rounded-lg transition-all"
            title={t('system_settings_title')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          {/* AI Settings button */}
          <button
            onClick={() => setShowAISettings(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-highlight rounded-lg transition-all"
            title={t('ai_settings_title')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="hidden md:inline">AI</span>
          </button>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-highlight rounded-lg transition-all disabled:opacity-50"
            title={t('session_refresh')}
          >
            <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t('session_refresh')}
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-highlight rounded-lg transition-all"
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
              <div className="flex flex-col items-center justify-center h-64 text-text-secondary">
                <svg className="w-16 h-16 mb-4 text-theme-border" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <p className="text-lg">{t('sessions_empty')}</p>
                <p className="text-sm text-text-secondary mt-1">Create a new session to get started</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedSessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => onSelect(session.id)}
                    onMouseEnter={() => setHoveredSession(session.id)}
                    onMouseLeave={() => setHoveredSession(null)}
                    className={`group relative bg-surface backdrop-blur-sm rounded-2xl p-5 transition-all cursor-pointer hover:scale-[1.02] hover:shadow-xl ${
                      session.is_archived
                        ? 'border border-dashed border-gray-600/50 opacity-60 hover:opacity-100 hover:border-green-500/50'
                        : session.is_ghost
                        ? 'border border-dashed border-theme-border hover:border-green-500/50'
                        : session.is_persistent
                        ? 'border border-yellow-600/30 hover:border-green-500/50'
                        : 'border border-theme-border hover:border-green-500/50'
                    } ${hoveredSession === session.id ? 'bg-surface-highlight' : ''}`}
                  >
                    {/* Archived badge */}
                    {session.is_archived && (
                      <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-gray-600 text-gray-200 text-xs rounded-full shadow-lg">
                        已归档
                      </div>
                    )}
                    {/* Persistent badge */}
                    {session.is_persistent && !session.is_archived && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center shadow-lg">
                        <svg className="w-3.5 h-3.5 text-black" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                      </div>
                    )}

                    {/* Session info - NEW LAYOUT */}
                    <div className="flex flex-col gap-1 mb-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-mono text-lg font-bold text-text-primary truncate" title={session.title || session.id}>
                          {session.title || `Session ${session.id.substring(0, 6)}`}
                        </h3>
                        {session.is_ghost && (
                          <span className="text-xs px-2 py-0.5 bg-gray-700/80 text-gray-400 rounded-full">
                            {t('session_state_ghost')}
                          </span>
                        )}
                      </div>

                      {/* Status + Time Row */}
                      <div className="flex items-center gap-2 text-xs text-text-secondary">
                        {/* Status Dot / AI Tag */}
                        {aiEnabled && summaries[session.id] ? (
                          <AIStatusTag
                            tag={summaries[session.id].tag}
                            description={summaries[session.id].description}
                          />
                        ) : (
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            session.is_ghost
                              ? 'bg-gray-400'
                              : session.state === 'active'
                              ? 'bg-green-500'
                              : 'bg-yellow-500'
                          }`} />
                        )}
                        
                        <span className="truncate">
                           #{session.id.substring(0, 6)}
                        </span>
                        <span>•</span>
                        <span>{formatRelativeTimeI18n(session.last_active, t)}</span>
                      </div>
                    </div>

                    {/* Tmux name */}
                    {session.tmux_name && !session.is_ghost && (
                      <div className="text-xs text-text-secondary font-mono mb-4 truncate">
                        tmux: {session.tmux_name}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 mt-auto pt-3 border-t border-theme-border">
                      {/* For archived sessions, show simplified buttons */}
                      {session.is_archived ? (
                        <>
                          {/* Unarchive/Restore button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onUnarchiveSession?.(session.id);
                            }}
                            className="p-2 bg-green-600/20 text-green-500 hover:bg-green-600/30 rounded-lg transition-all"
                            title="恢复到侧边栏"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => handleDelete(e, session.id)}
                            className="p-2 bg-surface-highlight hover:bg-red-600 text-text-secondary hover:text-white rounded-lg transition-all"
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
                            {t('session_join')}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={(e) => handleTogglePersist(e, session.id, !!session.is_persistent)}
                            className={`p-2 rounded-lg transition-all ${
                              session.is_persistent
                                ? 'bg-yellow-600/20 text-yellow-600 hover:bg-yellow-600/30'
                                : 'bg-surface-highlight text-text-secondary hover:bg-theme-border hover:text-yellow-600'
                            }`}
                            title={session.is_persistent ? t('session_persist_remove') : t('session_persist_add')}
                          >
                            <svg className="h-4 w-4" fill={session.is_persistent ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => handleToggleNotify(e, session.id)}
                            className={`p-2 rounded-lg transition-all ${
                              notifyStatus[session.id]
                                ? 'bg-blue-600/20 text-blue-600 hover:bg-blue-600/30'
                                : 'bg-surface-highlight text-text-secondary hover:bg-theme-border hover:text-blue-600'
                            }`}
                            title={notifyStatus[session.id] ? t('session_notify_on') : t('session_notify_off')}
                          >
                            <svg className="h-4 w-4" fill={notifyStatus[session.id] ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => handleToggleAuto(e, session.id)}
                            className={`p-2 rounded-lg transition-all ${
                              autoStatus[session.id]
                                ? 'bg-cyan-600/20 text-cyan-600 hover:bg-cyan-600/30'
                                : 'bg-surface-highlight text-text-secondary hover:bg-theme-border hover:text-cyan-600'
                            }`}
                            title={autoStatus[session.id] ? t('session_auto_on') : t('session_auto_off')}
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          </button>
                          {/* View logs button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowLogsFor({ id: session.id, name: session.title || session.tmux_name || session.id.slice(0, 8) });
                            }}
                            className="p-2 bg-surface-highlight hover:bg-purple-600/30 text-text-secondary hover:text-purple-600 rounded-lg transition-all"
                            title={t('session_view_logs')}
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </button>
                          {session.tmux_cmd && !session.is_ghost && (
                            <button
                              onClick={(e) => handleCopyTmuxCmd(e, session.tmux_cmd!)}
                              className="p-2 bg-surface-highlight hover:bg-blue-600 text-text-secondary hover:text-white rounded-lg transition-all"
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
                            className="p-2 bg-surface-highlight hover:bg-red-600 text-text-secondary hover:text-white rounded-lg transition-all"
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
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Create new session */}
        <aside className="w-80 border-l border-theme-border bg-surface/30 backdrop-blur-sm p-6 flex flex-col">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-text-primary">
            <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('session_create')}
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-text-secondary mb-2">{t('session_name_placeholder')}</label>
              <input
                type="text"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="my-project"
                className="w-full px-4 py-3 bg-surface-highlight border border-theme-border rounded-xl text-text-primary placeholder-text-secondary focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all"
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
          <div className="mt-auto pt-6 border-t border-theme-border">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-highlight rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-green-500">{sessions.filter(s => s.state === 'active').length}</div>
                <div className="text-xs text-text-secondary mt-1">{t('session_state_active')}</div>
              </div>
              <div className="bg-surface-highlight rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-text-secondary">{sessions.length}</div>
                <div className="text-xs text-text-secondary mt-1">Total</div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* AI Settings Modal */}
      <AISettings isOpen={showAISettings} onClose={() => setShowAISettings(false)} />

      {/* System Settings Modal */}
      <SystemSettings
        isOpen={showSystemSettings}
        onClose={() => setShowSystemSettings(false)}
        sessions={sessions}
      />

      {/* Session Logs Modal */}
      {showLogsFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl mx-4 bg-surface rounded-2xl border border-theme-border shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-theme-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">{t('auto_logs_session_title')}</h2>
                  <p className="text-xs text-text-secondary">{showLogsFor.name}</p>
                </div>
              </div>
              <button
                onClick={() => setShowLogsFor(null)}
                className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-highlight rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Content */}
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              <AutoActionLogs sessionId={showLogsFor.id} compact onClose={() => setShowLogsFor(null)} />
            </div>
          </div>
        </div>
      )}

      {/* Goal input modal */}
      {showGoalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowGoalModal(null)}>
          <div className="bg-surface border border-theme-border rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
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
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleConfirmGoal(); } }}
              />
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6">
              <button
                onClick={() => setShowGoalModal(null)}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary bg-surface-highlight/50 hover:bg-surface-highlight rounded-lg transition-all"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleConfirmGoal}
                disabled={autoLoading}
                className="px-4 py-2 text-sm text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-all disabled:opacity-50"
              >
                {t('unattended_enable')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
