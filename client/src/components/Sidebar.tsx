import { useEffect, useState, useCallback } from 'react';
import { api, SessionInfo } from '../core/api';
import { useServerStore } from '../stores/serverStore';
import { useAIStore } from '../stores/aiStore';

type NavSection = 'sessions' | 'files' | 'ai' | 'settings';

interface Props {
  activeSessionId: string | null;
  activeSection: NavSection;
  onSectionChange: (section: NavSection) => void;
  onSelectSession: (session: SessionInfo) => void;
}

export function Sidebar({ activeSessionId, activeSection, onSectionChange, onSelectSession }: Props) {
  const { servers, activeServerId, getActiveServer, getActiveToken, clearToken, addServer, setActiveServer, removeServer } = useServerStore();
  const summaries = useAIStore(s => s.summaries);
  const aiEnabled = useAIStore(s => s.aiEnabled);

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showServerModal, setShowServerModal] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const activeServer = servers.find(s => s.id === activeServerId);
  const isAdmin = activeServer?.role === 'admin';

  const loadSessions = useCallback(async () => {
    if (!getActiveToken()) return;
    try {
      const { sessions } = await api.listSessions();
      sessions.sort((a, b) => {
        if (a.is_persistent !== b.is_persistent) return a.is_persistent ? -1 : 1;
        return a.created_at.localeCompare(b.created_at);
      });
      setSessions(sessions);
    } catch { /* ignore */ }
  }, [getActiveToken]);

  useEffect(() => {
    if (activeSection === 'sessions') loadSessions();
  }, [activeSection, loadSessions]);

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

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this session?')) return;
    try {
      await api.deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch { /* ignore */ }
  };

  const handleTogglePersist = async (session: SessionInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (session.is_persistent) await api.unpersistSession(session.id);
      else await api.persistSession(session.id);
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, is_persistent: !s.is_persistent } : s));
    } catch { /* ignore */ }
  };

  const handleLogout = () => {
    const server = getActiveServer();
    if (server) clearToken(server.id);
    window.location.reload();
  };

  const visibleSessions = sessions.filter(s => showArchived || !s.is_archived);

  const navItems: { key: NavSection; icon: React.ReactNode; label: string; badge?: boolean }[] = [
    {
      key: 'sessions',
      label: 'Sessions',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10M7 13h6" /></svg>,
    },
    {
      key: 'files',
      label: 'Files',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7l2-3h5l2 3h9v13H3z" /></svg>,
    },
    {
      key: 'ai',
      label: 'AI',
      badge: aiEnabled,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /></svg>,
    },
    {
      key: 'settings',
      label: 'Settings',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" /></svg>,
    },
  ];

  return (
    <div className="flex h-full">
      {/* Icon nav rail */}
      <div className="w-14 bg-[#1a1a1f] flex flex-col items-center py-3 gap-1 border-r border-black/30">
        {navItems.map(item => (
          <button
            key={item.key}
            className={`relative flex flex-col items-center justify-center w-11 h-11 rounded-lg transition-colors ${
              activeSection === item.key
                ? 'bg-accent/15 text-accent'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
            onClick={() => onSectionChange(item.key)}
            title={item.label}
          >
            {item.icon}
            {item.badge && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-success" />}
          </button>
        ))}
        <div className="flex-1" />
        {/* Server status */}
        <button
          className="flex flex-col items-center justify-center w-11 h-11 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
          onClick={() => setShowServerModal(true)}
          title="Servers"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="7" rx="1" /><rect x="3" y="13" width="18" height="7" rx="1" /><path d="M7 7.5h.01M7 16.5h.01" /></svg>
          <span className={`w-1.5 h-1.5 rounded-full mt-1 ${getActiveToken() ? 'bg-success' : 'bg-gray-600'}`} />
        </button>
        <button
          className="flex flex-col items-center justify-center w-11 h-11 rounded-lg text-gray-500 hover:text-error hover:bg-white/5 transition-colors"
          onClick={handleLogout}
          title="Logout"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 17l5-5-5-5M21 12H9" /></svg>
        </button>
      </div>

      {/* Content panel — only show for sessions section */}
      {activeSection === 'sessions' && (
        <div className="w-64 bg-[#222229] flex flex-col border-r border-black/30">
          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sessions</span>
            <button
              className="text-gray-500 hover:text-gray-300 transition-colors"
              onClick={() => setShowArchived(!showArchived)}
              title={showArchived ? 'Hide archived' : 'Show archived'}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 3h12v4H2zM3 7v6h10V7M6 10h4" />
              </svg>
            </button>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-auto px-2">
            {visibleSessions.length === 0 && (
              <div className="text-center py-8 text-xs text-gray-600">No sessions</div>
            )}
            {visibleSessions.map(s => {
              const isActive = s.id === activeSessionId;
              const summary = summaries[s.id];
              return (
                <div
                  key={s.id}
                  className={`group flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors mb-0.5 ${
                    isActive ? 'bg-accent/15 text-white' : 'text-gray-300 hover:bg-white/5'
                  }`}
                  onClick={() => onSelectSession(s)}
                >
                  {/* Status dot */}
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    summary?.tag ? getSummaryColor(summary.tag) :
                    s.is_ghost ? 'bg-gray-600' :
                    s.state === 'active' ? 'bg-green-500' : 'bg-yellow-500'
                  }`} />

                  {/* Title */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      {s.is_persistent && <span className="text-yellow-500 text-xs shrink-0">★</span>}
                      <span className="text-sm truncate">{s.title || s.id.slice(0, 8)}</span>
                    </div>
                    {summary && (
                      <div className="text-xs text-gray-500 truncate">{summary.tag}</div>
                    )}
                  </div>

                  {/* Actions */}
                  {isAdmin && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className={`p-1 rounded hover:bg-white/10 ${s.is_persistent ? 'text-yellow-500' : 'text-gray-500'}`}
                        onClick={(e) => handleTogglePersist(s, e)}
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill={s.is_persistent ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5"><path d="M8 1l2 5 5 .5-3.5 3.5 1 5L8 12l-4.5 3 1-5L1 6.5l5-.5z" /></svg>
                      </button>
                      <button
                        className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-white/10"
                        onClick={(e) => handleDelete(s.id, e)}
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h10M6 4V2h4v2M5 4l1 10h4l1-10" /></svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Create */}
          {isAdmin && (
            <div className="p-3 border-t border-black/30">
              <div className="flex gap-2">
                <input
                  className="flex-1 px-2.5 py-1.5 bg-[#1a1a1f] border border-white/5 rounded-md text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent/50 transition-colors"
                  placeholder="New session..."
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !creating && handleCreate()}
                />
                <button
                  className="flex items-center justify-center w-8 bg-accent text-white rounded-md hover:opacity-90 disabled:opacity-30 transition-opacity"
                  onClick={handleCreate}
                  disabled={creating || !newTitle.trim()}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M3 8h10" /></svg>
                </button>
              </div>
            </div>
          )}
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

function getSummaryColor(tag: string): string {
  const map: Record<string, string> = {
    '完毕': 'bg-green-500', '进行': 'bg-blue-500', '需确认': 'bg-yellow-500',
    '需输入': 'bg-yellow-500', '需选择': 'bg-orange-500', '错误': 'bg-red-500',
    '等待': 'bg-blue-500', '自动处理': 'bg-cyan-500', '休眠中': 'bg-gray-600',
    '目标偏离': 'bg-red-500',
  };
  return map[tag] || 'bg-gray-500';
}

// --- Server modal (reuse existing design) ---
function ServerModal({ servers, activeServerId, onClose, onSelect, onAdd, onRemove }: {
  servers: ReturnType<typeof useServerStore.getState>['servers'];
  activeServerId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onAdd: (name: string, url: string) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#2a2a32] border border-white/10 rounded-2xl p-6 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-white">Servers</h2>
          <button className="text-gray-500 hover:text-white" onClick={onClose}>✕</button>
        </div>
        <div className="space-y-1.5 mb-5">
          {servers.map(s => (
            <div key={s.id} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${s.id === activeServerId ? 'bg-accent/15 border-accent/50' : 'bg-[#1a1a1f] border-white/5 hover:bg-white/5'}`} onClick={() => onSelect(s.id)}>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${s.token ? 'bg-green-500' : 'bg-gray-600'}`} />
                <div className="min-w-0">
                  <div className="text-sm text-white truncate">{s.name}</div>
                  <div className="text-xs text-gray-500 truncate font-mono">{s.url}</div>
                </div>
              </div>
              {s.id !== activeServerId && <button className="p-1.5 text-gray-500 hover:text-red-400 shrink-0" onClick={e => { e.stopPropagation(); onRemove(s.id); }}>✕</button>}
            </div>
          ))}
        </div>
        <div className="border-t border-white/5 pt-5">
          <div className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">Add Server</div>
          <div className="space-y-2">
            <input className="w-full px-3 py-2 bg-[#1a1a1f] border border-white/5 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent/50" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
            <input className="w-full px-3 py-2 bg-[#1a1a1f] border border-white/5 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent/50 font-mono" placeholder="http://host:port" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && name && url && (onAdd(name, url), setName(''), setUrl(''))} />
            <button className="w-full py-2 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-30" disabled={!name || !url} onClick={() => { onAdd(name, url); setName(''); setUrl(''); }}>Add Server</button>
          </div>
        </div>
      </div>
    </div>
  );
}
