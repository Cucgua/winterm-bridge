import { useEffect, useState, useCallback } from 'react';
import { api, SessionInfo } from '../core/api';
import { useServerStore } from '../stores/serverStore';

interface Props {
  onSelect: (session: SessionInfo) => void;
}

export function SessionPicker({ onSelect }: Props) {
  const { servers, activeServerId, getActiveServer, getActiveToken, clearToken, addServer, setActiveServer, removeServer } = useServerStore();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [showServerModal, setShowServerModal] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const activeServer = servers.find(s => s.id === activeServerId);
  const isAdmin = activeServer?.role === 'admin';

  const loadSessions = useCallback(async () => {
    try {
      const { sessions } = await api.listSessions();
      sessions.sort((a, b) => {
        if (a.is_persistent !== b.is_persistent) return a.is_persistent ? -1 : 1;
        return a.created_at.localeCompare(b.created_at);
      });
      setSessions(sessions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    const interval = setInterval(loadSessions, 30000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    setError('');
    try {
      const { session } = await api.createSession({ title: newTitle.trim() });
      onSelect(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    try {
      await api.deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete session');
    }
  };

  const handleTogglePersist = async (session: SessionInfo) => {
    try {
      if (session.is_persistent) await api.unpersistSession(session.id);
      else await api.persistSession(session.id);
      setSessions(prev => prev.map(s =>
        s.id === session.id ? { ...s, is_persistent: !s.is_persistent } : s
      ));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleToggleArchive = async (session: SessionInfo) => {
    try {
      if (session.is_archived) await api.unarchiveSession(session.id);
      else await api.archiveSession(session.id);
      setSessions(prev => prev.map(s =>
        s.id === session.id ? { ...s, is_archived: !s.is_archived } : s
      ));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleLogout = () => {
    const server = getActiveServer();
    if (server) clearToken(server.id);
    window.location.reload();
  };

  const visibleSessions = sessions.filter(s => showArchived || !s.is_archived);
  const persistentCount = sessions.filter(s => s.is_persistent).length;
  const activeCount = sessions.filter(s => s.state === 'active' && !s.is_ghost).length;

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-canvas gap-3">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-text-secondary">Loading sessions...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-canvas">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-text-primary tracking-tight">WinTerm</h1>
          <div className="flex items-center gap-1">
            <button
              className="p-1.5 text-text-secondary hover:text-text-primary rounded-md hover:bg-surface transition-colors"
              onClick={() => setShowArchived(!showArchived)}
              title={showArchived ? 'Hide archived' : 'Show archived'}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                {showArchived
                  ? <path d="M2 3 L14 3 L14 13 L2 13 Z M5 8 L11 8" />
                  : <path d="M2 3 L14 3 L14 7 L2 7 Z M4 9 L12 9 M4 11 L12 11" />}
              </svg>
            </button>
            <button
              className="p-1.5 text-text-secondary hover:text-text-primary rounded-md hover:bg-surface transition-colors"
              onClick={loadSessions}
              title="Refresh"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M13 4 A5 5 0 1 0 14 8 M13 3 L13 5 L11 5" />
              </svg>
            </button>
            <button
              className="p-1.5 text-text-secondary hover:text-error rounded-md hover:bg-surface transition-colors"
              onClick={handleLogout}
              title="Logout"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 2 L12 2 L12 14 L6 14 M2 8 L9 8 M7 5 L10 8 L7 11" />
              </svg>
            </button>
          </div>
        </div>

        {/* Server selector bar */}
        <button
          className="flex items-center justify-between w-full px-3 py-2 bg-surface rounded-lg border border-theme-border hover:border-accent transition-colors group"
          onClick={() => setShowServerModal(true)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${getActiveToken() ? 'bg-success' : 'bg-text-secondary'}`} />
            <div className="min-w-0 text-left">
              <div className="text-sm text-text-primary truncate">{activeServer?.name || 'No server'}</div>
              <div className="text-xs text-text-secondary truncate">{activeServer?.url}</div>
            </div>
          </div>
          <svg className="text-text-secondary group-hover:text-accent transition-colors shrink-0" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 7 L8 10 L11 7" />
          </svg>
        </button>
      </div>

      {/* Stats bar */}
      <div className="px-6 pb-2 flex items-center gap-4 text-xs text-text-secondary shrink-0">
        <span>{sessions.length} total</span>
        <span className="text-success">{activeCount} active</span>
        <span className="text-warning">{persistentCount} pinned</span>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mb-2 px-3 py-2 text-xs text-error bg-error/10 rounded-lg border border-error/30 flex items-center justify-between shrink-0">
          <span className="truncate">{error}</span>
          <button className="ml-2 shrink-0 opacity-70 hover:opacity-100" onClick={() => setError('')}>✕</button>
        </div>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-auto px-4 pb-2">
        <div className="space-y-1">
          {visibleSessions.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-secondary">
                  <rect x="3" y="4" width="18" height="14" rx="2" />
                  <path d="M7 9 L11 9 M7 13 L14 13" />
                </svg>
              </div>
              <p className="text-sm text-text-secondary">
                {showArchived ? 'No archived sessions' : 'No sessions yet'}
              </p>
              {!showArchived && isAdmin && (
                <p className="text-xs text-text-secondary mt-1">Create one below</p>
              )}
            </div>
          )}
          {visibleSessions.map(s => (
            <div
              key={s.id}
              className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface transition-all cursor-pointer border border-transparent hover:border-theme-border"
              onClick={() => onSelect(s)}
            >
              {/* Status indicator */}
              <div className="relative shrink-0">
                <span className={`block w-2 h-2 rounded-full ${
                  s.is_ghost ? 'bg-text-secondary' :
                  s.state === 'active' ? 'bg-success' : 'bg-warning'
                }`} />
                {s.state === 'active' && !s.is_ghost && (
                  <span className="absolute inset-0 w-2 h-2 rounded-full bg-success animate-ping opacity-50" />
                )}
              </div>

              {/* Title + meta */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {s.is_persistent && (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-warning shrink-0">
                      <path d="M8 1 L10 5.5 L15 6 L11.5 9.5 L12.5 14.5 L8 12 L3.5 14.5 L4.5 9.5 L1 6 L6 5.5 Z" />
                    </svg>
                  )}
                  <span className="text-sm text-text-primary truncate">{s.title || `Session ${s.id.slice(0, 8)}`}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {s.is_ghost && <span className="text-xs text-text-secondary">ghost</span>}
                  {s.is_archived && <span className="text-xs text-text-secondary">archived</span>}
                  <span className="text-xs text-text-secondary">{formatRelativeTime(s.last_active)}</span>
                </div>
              </div>

              {/* Actions */}
              {isAdmin && (
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className={`p-1.5 rounded-md hover:bg-canvas transition-colors ${s.is_persistent ? 'text-warning' : 'text-text-secondary hover:text-warning'}`}
                    onClick={(e) => { e.stopPropagation(); handleTogglePersist(s); }}
                    title={s.is_persistent ? 'Unpin' : 'Pin'}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill={s.is_persistent ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                      <path d="M8 1 L10 5.5 L15 6 L11.5 9.5 L12.5 14.5 L8 12 L3.5 14.5 L4.5 9.5 L1 6 L6 5.5 Z" />
                    </svg>
                  </button>
                  {s.is_persistent && (
                    <button
                      className={`p-1.5 rounded-md hover:bg-canvas transition-colors ${s.is_archived ? 'text-accent' : 'text-text-secondary hover:text-accent'}`}
                      onClick={(e) => { e.stopPropagation(); handleToggleArchive(s); }}
                      title={s.is_archived ? 'Unarchive' : 'Archive'}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="2" y="3" width="12" height="4" rx="0.5" />
                        <path d="M3 7 L3 13 L13 13 L13 7 M6 9 L10 9" />
                      </svg>
                    </button>
                  )}
                  <button
                    className="p-1.5 rounded-md text-text-secondary hover:text-error hover:bg-canvas transition-colors"
                    onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                    title="Delete"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M3 4 L13 4 M5 4 L5 2 L11 2 L11 4 M6 7 L6 13 M10 7 L10 13 M4 4 L4 14 L12 14 L12 4" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Create bar */}
      {isAdmin && (
        <div className="p-4 shrink-0 border-t border-theme-border">
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 bg-surface border border-theme-border rounded-lg text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent transition-colors"
              placeholder="New session name..."
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !creating && handleCreate()}
            />
            <button
              className="flex items-center justify-center w-9 h-9 bg-accent text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
              onClick={handleCreate}
              disabled={creating || !newTitle.trim()}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3 L8 13 M3 8 L13 8" />
              </svg>
            </button>
          </div>
        </div>
      )}

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
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

// --- Server management modal ---
interface ServerModalProps {
  servers: ReturnType<typeof useServerStore.getState>['servers'];
  activeServerId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onAdd: (name: string, url: string) => void;
  onRemove: (id: string) => void;
}

function ServerModal({ servers, activeServerId, onClose, onSelect, onAdd, onRemove }: ServerModalProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const handleAdd = () => {
    if (!name.trim() || !url.trim()) return;
    onAdd(name.trim(), url.trim());
    setName('');
    setUrl('');
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface border border-theme-border rounded-2xl p-6 w-96 max-h-[80vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-text-primary">Servers</h2>
          <button className="p-1 text-text-secondary hover:text-text-primary rounded hover:bg-canvas transition-colors" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3 L13 13 M13 3 L3 13" />
            </svg>
          </button>
        </div>

        <div className="space-y-1.5 mb-5">
          {servers.map(s => (
            <div
              key={s.id}
              className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                s.id === activeServerId
                  ? 'bg-canvas border-accent ring-1 ring-accent/30'
                  : 'bg-canvas border-theme-border hover:bg-surface-highlight'
              }`}
              onClick={() => onSelect(s.id)}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${s.token ? 'bg-success' : 'bg-text-secondary'}`} />
                <div className="min-w-0">
                  <div className="text-sm text-text-primary truncate">{s.name}</div>
                  <div className="text-xs text-text-secondary truncate font-mono">{s.url}</div>
                </div>
              </div>
              {s.id !== activeServerId && (
                <button
                  className="p-1.5 text-text-secondary hover:text-error rounded-lg hover:bg-surface transition-colors shrink-0 ml-2"
                  onClick={e => { e.stopPropagation(); onRemove(s.id); }}
                  title="Remove"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 3 L13 13 M13 3 L3 13" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-theme-border pt-5">
          <div className="text-xs font-medium text-text-secondary mb-3 uppercase tracking-wide">Add Server</div>
          <div className="space-y-2">
            <input
              className="w-full px-3 py-2 bg-canvas border border-theme-border rounded-lg text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent transition-colors"
              placeholder="Name (e.g. My Server)"
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <input
              className="w-full px-3 py-2 bg-canvas border border-theme-border rounded-lg text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent transition-colors font-mono"
              placeholder="http://host:port"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <button
              className="w-full py-2 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              onClick={handleAdd}
              disabled={!name.trim() || !url.trim()}
            >
              Add Server
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
