import { useEffect, useState, useCallback, useMemo } from 'react';
import { api, SessionInfo } from '../core/api';
import { useServerStore } from '../stores/serverStore';
import { useAIStore } from '../stores/aiStore';
import { getStatusDotColor, hasAiTagColor } from '../utils/statusColor';
import { formatRelativeTimeI18n, useI18n } from '../i18n';
import { ConfirmDialog, type ConfirmDialogRequest } from './ConfirmDialog';

interface Props {
  activeSessionId: string | null;
  onSelectSession: (session: SessionInfo) => void;
}

/** A collapsible group of sessions. */
interface SessionGroup {
  key: string;
  label: string;
  sessions: SessionInfo[];
  defaultOpen: boolean;
}

/**
 * Termius-style host list panel.
 *
 * Sessions are bucketed into collapsible groups (Pinned / Active / Idle /
 * Archived) with count badges, mirroring Termius' grouped host list. Each
 * entry is a compact row with a connection icon, status dot, title, tag
 * meta, and relative time. A header search filters across all groups.
 */
export function Sidebar({ activeSessionId, onSelectSession }: Props) {
  const { t, language } = useI18n();
  const { servers, activeServerId, getActiveToken, addServer, setActiveServer, removeServer } = useServerStore();
  const summaries = useAIStore(s => s.summaries);

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [showServerModal, setShowServerModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [query, setQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [confirmRequest, setConfirmRequest] = useState<ConfirmDialogRequest | null>(null);

  const activeServer = servers.find(s => s.id === activeServerId);
  const isAdmin = activeServer?.role === 'admin';

  const loadSessions = useCallback(async () => {
    if (!getActiveToken()) return;
    try {
      const { sessions } = await api.listSessions();
      sessions.sort((a, b) => b.last_active.localeCompare(a.last_active));
      setSessions(sessions);
    } catch { /* ignore */ }
  }, [getActiveToken]);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => {
    const interval = setInterval(loadSessions, 30000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const { session } = await api.createSession({ title: newTitle.trim() });
      setNewTitle('');
      onSelectSession(session);
    } catch { /* ignore */ }
    setCreating(false);
  };

  const deleteSession = async (id: string) => {
    try {
      await api.deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch { /* ignore */ }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmRequest({
      title: t('confirm_dialog_title'),
      message: t('session_delete_confirm'),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      tone: 'danger',
      onConfirm: () => { void deleteSession(id); },
    });
  };

  const handleTogglePersist = async (session: SessionInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (session.is_persistent) await api.unpersistSession(session.id);
      else await api.persistSession(session.id);
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, is_persistent: !s.is_persistent } : s));
    } catch { /* ignore */ }
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Bucket sessions into Termius-style groups.
  const groups = useMemo<SessionGroup[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = (s: SessionInfo) => !q || (s.title || s.id).toLowerCase().includes(q);
    const filtered = sessions.filter(matches);

    const pinned = filtered.filter(s => s.is_persistent && !s.is_archived);
    const active = filtered.filter(s => !s.is_persistent && !s.is_archived && s.state === 'active' && !s.is_ghost);
    const idle = filtered.filter(s => !s.is_persistent && !s.is_archived && (s.state !== 'active' || s.is_ghost));
    const archived = filtered.filter(s => s.is_archived);

    return [
      { key: 'pinned', label: t('session_group_pinned'), sessions: pinned, defaultOpen: true },
      { key: 'active', label: t('session_group_active'), sessions: active, defaultOpen: true },
      { key: 'idle', label: t('session_group_idle'), sessions: idle, defaultOpen: true },
      { key: 'archived', label: t('session_group_archived'), sessions: archived, defaultOpen: false },
    ].filter(g => g.sessions.length > 0 || g.key === 'archived');
  }, [sessions, query, t, language]);

  return (
    <div className="w-64 bg-surface flex flex-col border-r border-theme-border/10 shrink-0">
      {/* Header: title + server switcher */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-text-secondary/60 uppercase tracking-wider">{t('nav_sessions')}</span>
          {isAdmin && (
            <button
              className="p-1 text-text-tertiary/30 hover:text-accent rounded transition-colors"
              onClick={() => setNewTitle(newTitle ? '' : ' ')}
              title={t('session_new')}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 3v10M3 8h10" /></svg>
            </button>
          )}
        </div>

        {/* Inline search */}
        <div className="relative mb-2">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary/30" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="7" cy="7" r="4.5" /><path d="M11 11l3 3" />
          </svg>
          <input
            className="w-full pl-7 pr-2 py-1 bg-sidebar border border-theme-border/10 rounded text-xs text-text-primary/95 placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
            placeholder={t('session_search_placeholder')}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        {/* Server switcher row */}
        <button
          className="w-full flex items-center justify-between px-2 py-1.5 bg-sidebar rounded border border-theme-border/10 hover:border-accent/60 transition-colors group"
          onClick={() => setShowServerModal(true)}
          title={t('server_switch')}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getActiveToken() ? 'bg-success' : 'bg-text-tertiary'}`} />
            <span className="text-xs text-text-primary/95 truncate">{activeServer?.name || t('server_none')}</span>
          </div>
          <svg className="text-text-tertiary/30 group-hover:text-accent transition-colors shrink-0" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 7l3 3 3-3" /></svg>
        </button>
      </div>

      {/* Create row (collapsible) */}
      {isAdmin && newTitle !== '' && (
        <div className="px-3 pb-2 shrink-0">
          <div className="flex gap-1.5">
            <input
              className="flex-1 px-2 py-1 bg-sidebar border border-theme-border/10 rounded text-xs text-text-primary/95 placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
              placeholder={t('session_name_placeholder')}
              value={newTitle.trim() === '' && newTitle === ' ' ? '' : newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !creating && handleCreate()}
              autoFocus
            />
            <button
              className="flex items-center justify-center w-7 bg-accent text-accent-foreground rounded hover:opacity-90 disabled:opacity-30 transition-opacity shrink-0"
              onClick={handleCreate}
              disabled={creating || !newTitle.trim()}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M3 8h10" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Grouped session list */}
      <div className="flex-1 overflow-auto min-h-0">
        {groups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" className="text-text-tertiary/30 mb-2">
              <rect x="3" y="4" width="18" height="14" rx="2" /><path d="M7 9l3 3-3 3M13 15h4" />
            </svg>
            <p className="text-xs text-text-tertiary/30">{query ? t('no_matches') : t('sessions_empty')}</p>
          </div>
        )}

        {groups.map(group => {
          const isCollapsed = collapsedGroups.has(group.key);
          return (
            <div key={group.key} className="mb-0.5">
              {/* Group header */}
              <button
                className="w-full flex items-center gap-1 px-3 py-1 text-text-tertiary/30 hover:text-text-secondary/60 transition-colors group"
                onClick={() => toggleGroup(group.key)}
              >
                <svg className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`} width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 4l4 4-4 4" /></svg>
                <span className="text-[11px] font-semibold uppercase tracking-wider">{group.label}</span>
                <span className="text-[11px] text-text-tertiary/30">{group.sessions.length}</span>
              </button>

              {/* Group entries */}
              {!isCollapsed && group.sessions.map(s => (
                <SessionRow
                  key={s.id}
                  session={s}
                  isActive={s.id === activeSessionId}
                  isAdmin={!!isAdmin}
                  summary={summaries[s.id]}
                  onSelect={onSelectSession}
                  onDelete={handleDelete}
                  onTogglePersist={handleTogglePersist}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* Server modal */}
      {showServerModal && (
        <ServerModal
          servers={servers}
          activeServerId={activeServerId}
          onClose={() => setShowServerModal(false)}
          onSelect={(id) => { setActiveServer(id); setShowServerModal(false); window.location.reload(); }}
          onAdd={(name, url) => { addServer(name, url); }}
          onRemove={(id) => { removeServer(id); }}
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

/** Compact host entry row. */
function SessionRow({ session, isActive, isAdmin, summary, onSelect, onDelete, onTogglePersist }: {
  session: SessionInfo;
  isActive: boolean;
  isAdmin: boolean;
  summary?: { tag: string; description: string };
  onSelect: (s: SessionInfo) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onTogglePersist: (s: SessionInfo, e: React.MouseEvent) => void;
}) {
  const { t } = useI18n();
  const dotColor = summary && hasAiTagColor(summary.tag)
    ? getStatusDotColor({ kind: 'ai', tag: summary.tag })
    : getStatusDotColor({ kind: 'session', state: session.state, isGhost: session.is_ghost });

  const tags: string[] = [];
  if (summary) tags.push(summary.tag);
  else {
    if (session.is_ghost) tags.push(t('session_state_ghost'));
    if (session.is_archived) tags.push(t('session_group_archived'));
  }

  return (
    <div
      className={`group flex items-center gap-2 pl-5 pr-2 py-2.5 cursor-pointer transition-colors border-l-2 ${
        isActive ? 'bg-surface-highlight border-accent text-text-primary/95' : 'border-transparent text-text-secondary/60 hover:bg-surface-highlight/45 hover:text-text-primary/95'
      }`}
      onClick={() => onSelect(session)}
    >
      {/* Connection icon */}
      <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        {session.is_ghost
          ? <><rect x="3" y="4" width="18" height="14" rx="2" strokeDasharray="3 2" /><path d="M7 9l3 3-3 3M13 15h4" /></>
          : <><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M7 9l3 3-3 3M13 15h4" /></>}
      </svg>

      {/* Status dot */}
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />

      {/* Title + tags */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          {session.is_persistent && (
            <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor" className="text-warning shrink-0"><path d="M8 1l2 5 5 .5-3.5 3.5 1 5L8 12l-4.5 3 1-5L1 6.5l5-.5z" /></svg>
          )}
          <span className="text-xs truncate">{session.title || session.id.slice(0, 8)}</span>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          {tags.length > 0
            ? <span className="text-[10px] text-text-tertiary/30 truncate">{tags.join(', ')}</span>
            : <span className="text-[10px] text-text-tertiary/30">{formatRelativeTimeI18n(session.last_active, t)}</span>}
        </div>
      </div>

      {/* Admin actions */}
      {isAdmin && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            className={`p-0.5 rounded hover:bg-surface-highlight/45 transition-colors ${session.is_persistent ? 'text-warning' : 'text-text-tertiary/30 hover:text-warning'}`}
            onClick={(e) => onTogglePersist(session, e)}
            title={session.is_persistent ? t('session_unpin') : t('session_pin')}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill={session.is_persistent ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5"><path d="M8 1l2 5 5 .5-3.5 3.5 1 5L8 12l-4.5 3 1-5L1 6.5l5-.5z" /></svg>
          </button>
          <button
            className="p-0.5 rounded text-text-tertiary/30 hover:text-error hover:bg-surface-highlight/45 transition-colors"
            onClick={(e) => onDelete(session.id, e)}
            title={t('delete')}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h10M6 4V2h4v2M5 4l1 10h4l1-10" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}

// --- Server modal ---
function ServerModal({ servers, activeServerId, onClose, onSelect, onAdd, onRemove }: {
  servers: ReturnType<typeof useServerStore.getState>['servers'];
  activeServerId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onAdd: (name: string, url: string) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  return (
    <div className="fixed inset-0 bg-canvas/75 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface-elevated border border-theme-border/10 rounded-xl p-5 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text-primary/95">{t('servers')}</h2>
          <button className="p-1 text-text-tertiary/30 hover:text-text-primary/95 rounded hover:bg-surface-highlight/45 transition-colors" onClick={onClose} title={t('close')}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3L13 13M13 3L3 13" /></svg>
          </button>
        </div>
        <div className="space-y-1 mb-4">
          {servers.map(s => (
            <div key={s.id} className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${s.id === activeServerId ? 'bg-accent/15 border-accent/50' : 'bg-surface border-theme-border/10 hover:bg-surface-highlight/45'}`} onClick={() => onSelect(s.id)}>
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${s.token ? 'bg-success' : 'bg-text-tertiary'}`} />
                <div className="min-w-0">
                  <div className="text-sm text-text-primary/95 truncate">{s.name}</div>
                  <div className="text-xs text-text-tertiary/30 truncate font-mono">{s.url}</div>
                </div>
              </div>
              {s.id !== activeServerId && <button className="p-1 text-text-tertiary/30 hover:text-error rounded hover:bg-surface-highlight/45 transition-colors shrink-0" onClick={e => { e.stopPropagation(); onRemove(s.id); }} title={t('server_remove')}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3L13 13M13 3L3 13" /></svg>
              </button>}
            </div>
          ))}
        </div>
        <div className="border-t border-theme-border/10 pt-4">
          <div className="text-[11px] font-medium text-text-tertiary/30 mb-2 uppercase tracking-wide">{t('server_add')}</div>
          <div className="space-y-1.5">
            <input className="w-full px-2.5 py-1.5 bg-surface border border-theme-border/10 rounded text-sm text-text-primary/95 placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors" placeholder={t('server_name')} value={name} onChange={e => setName(e.target.value)} />
            <input className="w-full px-2.5 py-1.5 bg-surface border border-theme-border/10 rounded text-sm text-text-primary/95 placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors font-mono" placeholder={t('server_url_placeholder')} value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && name && url && (onAdd(name, url), setName(''), setUrl(''))} />
            <button className="w-full py-1.5 bg-accent text-accent-foreground rounded text-sm font-medium hover:opacity-90 disabled:opacity-30 transition-opacity" disabled={!name || !url} onClick={() => { onAdd(name, url); setName(''); setUrl(''); }}>{t('server_add')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
