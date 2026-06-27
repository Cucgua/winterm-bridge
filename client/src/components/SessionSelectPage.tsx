import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { api, type ProjectInfo, type SessionInfo } from '../core/api';
import { useServerStore } from '../stores/serverStore';
import { useAIStore } from '../stores/aiStore';
import { getStatusDotColor, hasAiTagColor } from '../utils/statusColor';
import { formatRelativeTime } from '../utils/time';
import { SaveProjectDialog } from './SaveProjectDialog';
import { SettingsDialog } from './SettingsDialog';

interface Props {
  onSelectSession: (session: SessionInfo) => void;
  onLogout: () => void;
}

type ViewMode = 'all' | 'projects' | 'sessions' | 'settings';

const projectPalette = [
  'bg-sky-700',
  'bg-emerald-700',
  'bg-amber-600',
  'bg-rose-700',
  'bg-indigo-700',
  'bg-cyan-700',
];

const sessionPalette = [
  'from-orange-500 to-red-600',
  'from-amber-400 to-orange-600',
  'from-sky-500 to-blue-700',
  'from-rose-500 to-fuchsia-700',
  'from-emerald-400 to-teal-700',
  'from-violet-500 to-indigo-700',
];

function classNames(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(' ');
}

function hashString(value: string) {
  return value.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
}

function titleOf(session: SessionInfo) {
  return session.title || session.tmux_name || `Session ${session.id.slice(0, 6)}`;
}

function subtitleOf(session: SessionInfo) {
  if (session.current_path) return session.current_path;
  if (session.tmux_name) return `tmux: ${session.tmux_name}`;
  return session.state === 'active' ? 'connected' : 'running';
}

function sessionMatchesQuery(session: SessionInfo, query: string) {
  if (!query) return true;
  return [session.title, session.tmux_name, session.current_path, session.id]
    .filter(Boolean)
    .some(value => value!.toLowerCase().includes(query));
}

function projectMatchesQuery(project: ProjectInfo, query: string) {
  if (!query) return true;
  return [project.name, project.working_dir, project.id]
    .filter(Boolean)
    .some(value => value!.toLowerCase().includes(query));
}

function AppIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function ProjectIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 7h6v6H5V7zm8 4h6v6h-6v-6zM9 15h2v2H9v-2zm4-8h2v2h-2V7z" />
    </svg>
  );
}

export function SessionSelectPage({ onSelectSession, onLogout }: Props) {
  const { servers, activeServerId, getActiveToken, addServer, setActiveServer, removeServer } = useServerStore();
  const summaries = useAIStore(s => s.summaries);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [mode, setMode] = useState<ViewMode>('all');
  const [loading, setLoading] = useState(false);
  const [openingProjectId, setOpeningProjectId] = useState('');
  const [query, setQuery] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [saveProjectSession, setSaveProjectSession] = useState<SessionInfo | null>(null);
  const [saveProjectLoading, setSaveProjectLoading] = useState(false);
  const [saveProjectError, setSaveProjectError] = useState('');
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [error, setError] = useState('');

  const activeServer = servers.find(s => s.id === activeServerId);
  const isAdmin = activeServer?.role === 'admin';

  const loadData = useCallback(async () => {
    if (!getActiveToken()) return;
    setLoading(true);
    try {
      const sessionsResult = await api.listSessions();
      sessionsResult.sessions.sort((a, b) => b.last_active.localeCompare(a.last_active));
      setSessions(sessionsResult.sessions);

      if (isAdmin) {
        const projectsResult = await api.listProjects();
        projectsResult.projects.sort((a, b) => {
          const aTime = a.last_opened_at || a.created_at;
          const bTime = b.last_opened_at || b.created_at;
          return bTime.localeCompare(aTime);
        });
        setProjects(projectsResult.projects);
      } else {
        setProjects([]);
      }

      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workspace');
    } finally {
      setLoading(false);
    }
  }, [getActiveToken, isAdmin]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const q = query.trim().toLowerCase();
  const visibleProjects = useMemo(() => projects.filter(project => projectMatchesQuery(project, q)), [projects, q]);
  const visibleSessions = useMemo(() => sessions.filter(session => sessionMatchesQuery(session, q)), [sessions, q]);

  const showProjects = mode === 'all' || mode === 'projects';
  const showSessions = mode === 'all' || mode === 'sessions';

  const handleCreateProject = async () => {
    if (!isAdmin) return;
    const name = newProjectName.trim();
    if (!name) return;
    setLoading(true);
    try {
      const { project } = await api.createProject({ name });
      setNewProjectName('');
      setProjects(prev => [project, ...prev]);
      setMode('projects');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenProject = async (project: ProjectInfo) => {
    if (!isAdmin || openingProjectId) return;
    setOpeningProjectId(project.id);
    try {
      const { session } = await api.createProjectSession(project.id);
      setSessions(prev => [session, ...prev.filter(existing => existing.id !== session.id)]);
      await loadData();
      onSelectSession(session);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create session');
    } finally {
      setOpeningProjectId('');
    }
  };

  const handleDeleteProject = async (project: ProjectInfo, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!confirm(`删除项目 "${project.name}"？\n已有运行会话不会被关闭。`)) return;
    try {
      await api.deleteProject(project.id);
      setProjects(prev => prev.filter(item => item.id !== project.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete project');
    }
  };

  const handleDeleteSession = async (session: SessionInfo, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!confirm(`结束会话 "${titleOf(session)}"？\n这会关闭对应的 tmux session，正在运行的进程也会停止。`)) return;
    try {
      await api.deleteSession(session.id);
      setSessions(prev => prev.filter(item => item.id !== session.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete session');
    }
  };

  const refreshSession = async (session: SessionInfo) => {
    const result = await api.listSessions();
    const fresh = result.sessions.find(item => item.id === session.id) || session;
    setSessions(result.sessions.sort((a, b) => b.last_active.localeCompare(a.last_active)));
    return fresh;
  };

  const handleOpenSaveProject = async (session: SessionInfo, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!isAdmin) return;
    setSaveProjectError('');
    try {
      const fresh = await refreshSession(session);
      setSaveProjectSession(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh session');
    }
  };

  const handleSaveProject = async (name: string) => {
    if (!saveProjectSession) return;
    setSaveProjectLoading(true);
    setSaveProjectError('');
    try {
      const { project } = await api.createProjectFromSession(saveProjectSession.id, { name });
      setProjects(prev => [project, ...prev.filter(item => item.id !== project.id)]);
      setMode('projects');
      setSaveProjectSession(null);
      await loadData();
    } catch (e) {
      setSaveProjectError(e instanceof Error ? e.message : 'Failed to create project');
    } finally {
      setSaveProjectLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#080d1d] text-text-primary/95">
      <header className="h-20 flex-shrink-0 border-b border-theme-border/10 bg-[#0f1628] px-7 shadow-[0_1px_0_rgba(255,255,255,0.03)]">
        <div className="flex h-full items-center gap-4">
          <button className="flex h-11 min-w-[220px] items-center gap-3 rounded-2xl bg-white/[0.1] px-4 text-text-primary/95">
            <ProjectIcon />
            <span className="truncate text-lg font-semibold">Workspace</span>
          </button>

          <div className="ml-auto flex items-center gap-3">
            <button
              className="h-10 rounded-xl border border-theme-border/10 bg-white/[0.05] px-4 text-sm font-semibold text-text-secondary/70 transition-colors hover:bg-white/[0.09] hover:text-text-primary/95"
              onClick={() => setServerModalOpen(true)}
            >
              {activeServer?.name || 'No server'}
            </button>
            <button
              className="h-10 rounded-xl border border-theme-border/10 bg-white/[0.05] px-4 text-sm font-semibold text-text-secondary/70 transition-colors hover:bg-white/[0.09] hover:text-text-primary/95"
              onClick={onLogout}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[302px] flex-shrink-0 border-r border-theme-border/10 bg-[#101729] px-6 py-8">
          <nav className="space-y-4">
            <NavButton active={mode === 'all'} label="Workspace" icon="workspace" onClick={() => setMode('all')} />
            <NavButton active={mode === 'projects'} label="Projects" icon="projects" onClick={() => setMode('projects')} />
            <NavButton active={mode === 'sessions'} label="Sessions" icon="sessions" onClick={() => setMode('sessions')} />
            <NavButton active={mode === 'settings'} label="Settings" icon="settings" onClick={() => setMode('settings')} />
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto bg-[#080d1d] px-5 py-8 md:px-7">
          {mode === 'settings' ? (
            <SettingsDialog variant="embedded" onClose={() => setMode('all')} />
          ) : (
            <>
              <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleCreateProject}
                    disabled={!isAdmin || loading || !newProjectName.trim()}
                    className="flex h-11 items-center gap-2 rounded-xl bg-white/[0.08] px-5 text-sm font-bold uppercase text-text-secondary/75 transition-colors hover:bg-white/[0.12] hover:text-text-primary/95 disabled:opacity-40"
                  >
                    <ProjectIcon />
                    New Project
                  </button>
                  <input
                    value={newProjectName}
                    onChange={event => setNewProjectName(event.target.value)}
                    onKeyDown={event => event.key === 'Enter' && handleCreateProject()}
                    placeholder="Project name"
                    className="h-11 w-52 rounded-xl border border-theme-border/10 bg-white/[0.07] px-4 text-sm text-text-primary/95 placeholder-text-tertiary/40 outline-none transition-colors focus:border-accent"
                  />
                  <input
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="Search projects or sessions"
                    className="h-11 w-72 rounded-xl border border-theme-border/10 bg-white/[0.07] px-4 text-sm text-text-primary/95 placeholder-text-tertiary/40 outline-none transition-colors focus:border-accent"
                  />
                </div>
                <button
                  onClick={loadData}
                  disabled={loading}
                  className="rounded-xl p-3 text-text-secondary/55 transition-colors hover:bg-white/[0.07] hover:text-text-primary/95 disabled:opacity-40"
                  title="Refresh"
                >
                  <svg className={classNames('h-5 w-5', loading && 'animate-spin')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>

              {error && (
                <div className="mb-5 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
                  {error}
                </div>
              )}

              {showProjects && (
                <section className="mb-9">
                  <div className="mb-4 flex items-end justify-between gap-4">
                    <h2 className="text-xl font-bold text-text-primary/95">Projects</h2>
                    <span className="text-sm font-semibold text-text-secondary/45">{visibleProjects.length} projects</span>
                  </div>
                  {visibleProjects.length === 0 ? (
                    <EmptyState loading={loading} label="No projects" />
                  ) : (
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                      {visibleProjects.map(project => {
                        const color = projectPalette[hashString(project.id) % projectPalette.length];
                        const opening = openingProjectId === project.id;
                        return (
                          <article
                            key={project.id}
                            onClick={() => handleOpenProject(project)}
                            onKeyDown={event => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                handleOpenProject(project);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            className={classNames(
                              'group min-h-[92px] w-full cursor-pointer rounded-2xl border border-theme-border/10 bg-[#1a2135] px-5 py-4 text-left shadow-[0_12px_28px_rgba(0,0,0,0.16)] outline-none transition-all hover:border-theme-border/20 hover:bg-[#202841] focus:border-emerald-400/80',
                              opening && 'border-emerald-400/70 bg-[#202841]',
                            )}
                          >
                            <div className="flex items-center gap-5">
                              <div className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl ${color} text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]`}>
                                <ProjectIcon />
                              </div>
                              <div className="min-w-0 flex-1">
                                <h3 className="truncate text-lg font-bold text-text-primary/95" title={project.name}>{project.name}</h3>
                                <div className="mt-1 truncate text-sm font-semibold text-text-secondary/60" title={project.working_dir || undefined}>
                                  {project.working_dir || 'Default directory'}
                                </div>
                                <div className="mt-1 text-xs text-text-tertiary/40">
                                  {project.session_counter} sessions created
                                </div>
                              </div>
                              {isAdmin && (
                                <div className="flex flex-shrink-0 items-center gap-1 opacity-100 transition-opacity xl:opacity-0 xl:group-hover:opacity-100 xl:group-focus-within:opacity-100">
                                  <IconButton title="Open new session" onClick={event => { event.stopPropagation(); handleOpenProject(project); }}>
                                    <path d="M12 5v14m7-7H5" />
                                  </IconButton>
                                  <IconButton title="Delete project" onClick={event => handleDeleteProject(project, event)}>
                                    <path d="M6 7h12M9 7V5h6v2m-5 3v6m4-6v6M8 7l1 12h6l1-12" />
                                  </IconButton>
                                </div>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {showSessions && (
                <section>
                  <div className="mb-4 flex items-end justify-between gap-4">
                    <h2 className="text-xl font-bold text-text-primary/95">Sessions</h2>
                    <span className="text-sm font-semibold text-text-secondary/45">{visibleSessions.length} live</span>
                  </div>
                  {visibleSessions.length === 0 ? (
                    <EmptyState loading={loading} label="No live sessions" />
                  ) : (
                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 2xl:grid-cols-3">
                      {visibleSessions.map(session => {
                        const summary = summaries[session.id];
                        const dotColor = summary && hasAiTagColor(summary.tag)
                          ? getStatusDotColor({ kind: 'ai', tag: summary.tag })
                          : getStatusDotColor({ kind: 'session', state: session.state, isGhost: false });
                        const color = sessionPalette[hashString(session.id) % sessionPalette.length];

                        return (
                          <article
                            key={session.id}
                            onClick={() => onSelectSession(session)}
                            onKeyDown={event => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onSelectSession(session);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            className="group min-h-[86px] w-full cursor-pointer rounded-2xl border border-theme-border/10 bg-[#1a2135] px-5 py-4 shadow-[0_12px_28px_rgba(0,0,0,0.16)] outline-none transition-all hover:border-theme-border/20 hover:bg-[#202841] focus:border-emerald-400/80"
                          >
                            <div className="flex items-center gap-4">
                              <div className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${color} text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]`}>
                                <AppIcon className="h-6 w-6" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <h3 className="truncate text-lg font-bold text-text-primary/95" title={titleOf(session)}>{titleOf(session)}</h3>
                                <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-text-secondary/60">
                                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dotColor}`} />
                                  <span className="truncate">{summary?.tag || subtitleOf(session)}</span>
                                </div>
                                <div className="mt-1 text-xs text-text-tertiary/40">
                                  #{session.id.slice(0, 6)} · {formatRelativeTime(session.last_active)}
                                </div>
                              </div>
                              {isAdmin && (
                                <div className="flex flex-shrink-0 items-center gap-1 opacity-100 transition-opacity xl:opacity-0 xl:group-hover:opacity-100 xl:group-focus-within:opacity-100">
                                  <IconButton title="Save as project" onClick={event => handleOpenSaveProject(session, event)}>
                                    <path d="M4 6h7v7H4V6zm9 5h7v7h-7v-7zM8 15h3v3H8v-3zm7-9h3v3h-3V6z" />
                                  </IconButton>
                                  <IconButton title="End session" onClick={event => handleDeleteSession(session, event)}>
                                    <path d="M6 7h12M9 7V5h6v2m-5 3v6m4-6v6M8 7l1 12h6l1-12" />
                                  </IconButton>
                                </div>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </main>
      </div>

      {serverModalOpen && (
        <ServerModal
          servers={servers}
          activeServerId={activeServerId}
          onClose={() => setServerModalOpen(false)}
          onSelect={id => { setActiveServer(id); setServerModalOpen(false); window.location.reload(); }}
          onAdd={(name, url) => { addServer(name, url); }}
          onRemove={id => { removeServer(id); }}
        />
      )}

      {saveProjectSession && (
        <SaveProjectDialog
          session={saveProjectSession}
          loading={saveProjectLoading}
          error={saveProjectError}
          onClose={() => { if (!saveProjectLoading) setSaveProjectSession(null); }}
          onSave={handleSaveProject}
        />
      )}
    </div>
  );
}

function EmptyState({ loading, label }: { loading: boolean; label: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.03] text-text-tertiary/40">
      <AppIcon className="mb-4 h-12 w-12" />
      <p className="text-lg font-semibold">{loading ? 'Loading...' : label}</p>
    </div>
  );
}

function NavButton({ active, label, icon, onClick }: { active?: boolean; label: string; icon: 'workspace' | 'projects' | 'sessions' | 'settings'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={classNames(
        'flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left text-lg font-semibold transition-colors',
        active ? 'bg-white/[0.08] text-text-primary/95' : 'text-text-secondary/60 hover:bg-white/[0.05] hover:text-text-primary/95',
      )}
    >
      <NavIcon type={icon} />
      {label}
    </button>
  );
}

function NavIcon({ type }: { type: 'workspace' | 'projects' | 'sessions' | 'settings' }) {
  if (type === 'projects') {
    return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h7v7H4V6zm9 5h7v7h-7v-7zM8 15h3v3H8v-3zm7-9h3v3h-3V6z" /></svg>;
  }
  if (type === 'sessions') {
    return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
  }
  if (type === 'settings') {
    return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
  }
  return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>;
}

function IconButton({ title, active, onClick, children }: { title: string; active?: boolean; onClick: (event: MouseEvent<HTMLButtonElement>) => void; children: ReactNode }) {
  return (
    <button
      className={classNames(
        'flex h-8 w-8 items-center justify-center rounded-lg border transition-all',
        active ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300' : 'border-white/5 bg-white/[0.04] text-text-secondary/60 hover:bg-white/[0.08] hover:text-text-primary/95',
      )}
      onClick={onClick}
      title={title}
    >
      <svg className="h-4 w-4" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {children}
      </svg>
    </button>
  );
}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-96 rounded-xl border border-white/10 bg-surface-elevated p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary/95">Servers</h2>
          <button className="rounded p-1 text-text-tertiary/40 transition-colors hover:bg-surface hover:text-text-primary/95" onClick={onClose}>x</button>
        </div>
        <div className="mb-4 space-y-1">
          {servers.map(server => (
            <div
              key={server.id}
              className={classNames(
                'flex cursor-pointer items-center justify-between rounded-lg border p-2.5 transition-all',
                server.id === activeServerId ? 'border-accent/50 bg-accent/15' : 'border-white/10 bg-surface hover:bg-white/5',
              )}
              onClick={() => onSelect(server.id)}
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-text-primary/95">{server.name}</div>
                <div className="truncate font-mono text-xs text-text-tertiary/40">{server.url}</div>
              </div>
              {server.id !== activeServerId && (
                <button
                  className="rounded p-1 text-text-tertiary/40 transition-colors hover:bg-surface hover:text-error"
                  onClick={event => { event.stopPropagation(); onRemove(server.id); }}
                >
                  x
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 pt-4">
          <div className="mb-2 text-[11px] font-medium uppercase text-text-tertiary/40">Add Server</div>
          <div className="space-y-1.5">
            <input className="w-full rounded border border-white/10 bg-surface px-2.5 py-1.5 text-sm text-text-primary/95 outline-none transition-colors focus:border-accent" placeholder="Name" value={name} onChange={event => setName(event.target.value)} />
            <input className="w-full rounded border border-white/10 bg-surface px-2.5 py-1.5 font-mono text-sm text-text-primary/95 outline-none transition-colors focus:border-accent" placeholder="http://host:port" value={url} onChange={event => setUrl(event.target.value)} />
            <button className="w-full rounded bg-accent py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-30" disabled={!name || !url} onClick={() => { onAdd(name, url); setName(''); setUrl(''); }}>Add Server</button>
          </div>
        </div>
      </div>
    </div>
  );
}
