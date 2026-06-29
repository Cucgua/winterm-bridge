import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { api, type ProjectInfo, type SessionInfo } from '../core/api';
import { useI18n } from '../i18n/i18nStore';
import { useServerStore } from '../stores/serverStore';
import { useAIStore } from '../stores/aiStore';
import { getStatusDotColor, hasAiTagColor } from '../utils/statusColor';
import { formatRelativeTime } from '../utils/time';
import { getWorkspaceIconTone } from '../utils/workspaceIdentity';
import { SaveProjectDialog } from './SaveProjectDialog';
import { SettingsDialog } from './SettingsDialog';
import { WindowControls, WindowDragRegion } from './WindowControls';
import { ConfirmDialog, type ConfirmDialogRequest } from './ConfirmDialog';

interface Props {
  onSelectSession: (session: SessionInfo) => void;
  onLogout: () => void;
}

type ViewMode = 'all' | 'projects' | 'sessions' | 'settings';

function classNames(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(' ');
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
  const { t } = useI18n();
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
  const [confirmRequest, setConfirmRequest] = useState<ConfirmDialogRequest | null>(null);
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
      setError(e instanceof Error ? e.message : t('error_load_workspace'));
    } finally {
      setLoading(false);
    }
  }, [getActiveToken, isAdmin, t]);

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
      setError(e instanceof Error ? e.message : t('error_create_project'));
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
      setError(e instanceof Error ? e.message : t('error_create_session'));
    } finally {
      setOpeningProjectId('');
    }
  };

  const deleteProject = async (project: ProjectInfo) => {
    try {
      await api.deleteProject(project.id);
      setProjects(prev => prev.filter(item => item.id !== project.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error_delete_project'));
    }
  };

  const handleDeleteProject = (project: ProjectInfo, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setConfirmRequest({
      title: t('confirm_dialog_title'),
      message: t('project_delete_confirm', { name: project.name }),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      tone: 'danger',
      onConfirm: () => { void deleteProject(project); },
    });
  };

  const deleteSession = async (session: SessionInfo) => {
    try {
      await api.deleteSession(session.id);
      setSessions(prev => prev.filter(item => item.id !== session.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error_delete_session'));
    }
  };

  const handleDeleteSession = (session: SessionInfo, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setConfirmRequest({
      title: t('confirm_dialog_title'),
      message: t('session_end_confirm', { name: titleOf(session) }),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      tone: 'danger',
      onConfirm: () => { void deleteSession(session); },
    });
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
      setError(e instanceof Error ? e.message : t('error_refresh_session'));
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
      setSaveProjectError(e instanceof Error ? e.message : t('error_create_project'));
    } finally {
      setSaveProjectLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-text-primary/95">
      <header data-tauri-drag-region className="h-14 flex-shrink-0 border-b border-theme-border/10 bg-surface px-5">
        <div data-tauri-drag-region className="flex h-full items-center gap-3">
          <button className="flex h-9 min-w-[13.75rem] items-center gap-2 rounded-xl bg-surface-highlight/50 px-3 text-text-primary/95">
            <ProjectIcon />
            <span className="truncate text-sm font-semibold">{t('workspace')}</span>
          </button>

          <WindowDragRegion />

          <div className="flex items-center gap-2">
            <button
              className="h-9 rounded-lg border border-theme-border/10 bg-surface-highlight/25 px-3 text-sm font-semibold text-text-secondary/70 transition-colors hover:bg-surface-highlight/45 hover:text-text-primary/95"
              onClick={() => setServerModalOpen(true)}
            >
              {activeServer?.name || t('server_none')}
            </button>
            <button
              className="h-9 rounded-lg border border-theme-border/10 bg-surface-highlight/25 px-3 text-sm font-semibold text-text-secondary/70 transition-colors hover:bg-surface-highlight/45 hover:text-text-primary/95"
              onClick={onLogout}
            >
              {t('logout')}
            </button>
            <div className="h-6 w-px bg-theme-border/10" />
            <WindowControls />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[15rem] flex-shrink-0 border-r border-theme-border/10 bg-sidebar px-4 py-5">
          <nav className="space-y-2">
            <NavButton active={mode === 'all'} label={t('workspace')} icon="workspace" onClick={() => setMode('all')} />
            <NavButton active={mode === 'sessions'} label={t('sessions_count')} icon="sessions" onClick={() => setMode('sessions')} />
            <NavButton active={mode === 'projects'} label={t('projects')} icon="projects" onClick={() => setMode('projects')} />
            <NavButton active={mode === 'settings'} label={t('settings')} icon="settings" onClick={() => setMode('settings')} />
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto bg-canvas px-4 py-5 md:px-6">
          {mode === 'settings' ? (
            <SettingsDialog variant="embedded" onClose={() => setMode('all')} />
          ) : (
            <>
              <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={handleCreateProject}
                    disabled={!isAdmin || loading || !newProjectName.trim()}
                    className="flex h-9 items-center gap-2 rounded-lg bg-surface-highlight/35 px-4 text-sm font-bold uppercase text-text-secondary/75 transition-colors hover:bg-surface-highlight/50 hover:text-text-primary/95 disabled:opacity-40"
                  >
                    <ProjectIcon />
                    {t('new_project')}
                  </button>
                  <input
                    value={newProjectName}
                    onChange={event => setNewProjectName(event.target.value)}
                    onKeyDown={event => event.key === 'Enter' && handleCreateProject()}
                    placeholder={t('project_name_placeholder')}
                    className="h-9 w-48 rounded-lg border border-theme-border/10 bg-surface-highlight/25 px-3 text-sm text-text-primary/95 placeholder:text-text-tertiary/40 outline-none transition-colors focus:border-accent"
                  />
                  <input
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder={t('search_workspace')}
                    className="h-9 w-64 rounded-lg border border-theme-border/10 bg-surface-highlight/25 px-3 text-sm text-text-primary/95 placeholder:text-text-tertiary/40 outline-none transition-colors focus:border-accent"
                  />
                </div>
                <button
                  onClick={loadData}
                  disabled={loading}
                  className="rounded-lg p-2.5 text-text-secondary/55 transition-colors hover:bg-surface-highlight/35 hover:text-text-primary/95 disabled:opacity-40"
                  title={t('session_refresh')}
                >
                  <svg className={classNames('h-4 w-4', loading && 'animate-spin')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>

              {error && (
                <div className="mb-6 rounded-lg border border-error/30 bg-error/10 px-3 py-2.5 text-sm text-error">
                  {error}
                </div>
              )}

              {showSessions && (
                <section className="mb-10">
                  <div className="mb-4 flex items-end justify-between gap-4">
                    <h2 className="text-lg font-bold text-text-primary/95">{t('sessions_count')}</h2>
                    <span className="text-sm font-semibold text-text-secondary/45">{t('sessions_live_count', { n: visibleSessions.length })}</span>
                  </div>
                  {visibleSessions.length === 0 ? (
                    <EmptyState loading={loading} label={t('no_live_sessions')} />
                  ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {visibleSessions.map(session => {
                        const summary = summaries[session.id];
                        const iconTone = getWorkspaceIconTone('session', session.id || titleOf(session));
                        const dotColor = summary && hasAiTagColor(summary.tag)
                          ? getStatusDotColor({ kind: 'ai', tag: summary.tag })
                          : getStatusDotColor({ kind: 'session', state: session.state, isGhost: false });
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
                            className="group min-h-[3.5rem] w-full cursor-pointer rounded-xl border border-theme-border/10 bg-surface-elevated px-4 py-3 outline-none transition-all hover:border-theme-border/20 hover:bg-surface-highlight focus:border-accent/80"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                                style={iconTone}
                              >
                                <AppIcon className="h-5 w-5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <h3 className="truncate text-sm font-bold text-text-primary/95" title={titleOf(session)}>{titleOf(session)}</h3>
                                <div className="mt-0.5 flex items-center gap-2 text-xs font-semibold text-text-secondary/60">
                                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dotColor}`} />
                                  <span className="truncate">{summary?.tag || subtitleOf(session)}</span>
                                </div>
                                <div className="mt-0.5 text-[0.6875rem] text-text-tertiary/40">
                                  #{session.id.slice(0, 6)} · {formatRelativeTime(session.last_active)}
                                </div>
                              </div>
                              {isAdmin && (
                                <div className="flex flex-shrink-0 items-center gap-1 opacity-100 transition-opacity xl:opacity-0 xl:group-hover:opacity-100 xl:group-focus-within:opacity-100">
                                  <IconButton title={t('settings_save_project')} onClick={event => handleOpenSaveProject(session, event)}>
                                    <path d="M4 6h7v7H4V6zm9 5h7v7h-7v-7zM8 15h3v3H8v-3zm7-9h3v3h-3V6z" />
                                  </IconButton>
                                  <IconButton title={t('end_session')} onClick={event => handleDeleteSession(session, event)}>
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

              {showProjects && (
                <section>
                  <div className="mb-4 flex items-end justify-between gap-4">
                    <h2 className="text-lg font-bold text-text-primary/95">{t('projects')}</h2>
                    <span className="text-sm font-semibold text-text-secondary/45">{t('projects_count', { n: visibleProjects.length })}</span>
                  </div>
                  {visibleProjects.length === 0 ? (
                    <EmptyState loading={loading} label={t('no_projects')} />
                  ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {visibleProjects.map(project => {
                        const opening = openingProjectId === project.id;
                        const iconTone = getWorkspaceIconTone('project', project.id || project.name);
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
                              'group min-h-[3.75rem] w-full cursor-pointer rounded-xl border border-theme-border/10 bg-surface-elevated px-4 py-3 text-left outline-none transition-all hover:border-theme-border/20 hover:bg-surface-highlight focus:border-accent/80',
                              opening && 'border-accent/70 bg-surface-highlight',
                            )}
                          >
                            <div className="flex items-center gap-4">
                              <div
                                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                                style={iconTone}
                              >
                                <ProjectIcon />
                              </div>
                              <div className="min-w-0 flex-1">
                                <h3 className="truncate text-sm font-bold text-text-primary/95" title={project.name}>{project.name}</h3>
                                <div className="mt-0.5 truncate text-xs font-semibold text-text-secondary/60" title={project.working_dir || undefined}>
                                  {project.working_dir || t('project_default_directory')}
                                </div>
                                <div className="mt-0.5 text-[0.6875rem] text-text-tertiary/40">
                                  {t('project_sessions_created', { n: project.session_counter })}
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

      {confirmRequest && (
        <ConfirmDialog
          {...confirmRequest}
          onCancel={() => setConfirmRequest(null)}
        />
      )}
    </div>
  );
}

function EmptyState({ loading, label }: { loading: boolean; label: string }) {
  const { t } = useI18n();

  return (
    <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-theme-border/10 bg-surface-highlight/15 text-text-tertiary/40">
      <AppIcon className="mb-3 h-10 w-10" />
      <p className="text-sm font-semibold">{loading ? t('loading') : label}</p>
    </div>
  );
}

function NavButton({ active, label, icon, onClick }: { active?: boolean; label: string; icon: 'workspace' | 'projects' | 'sessions' | 'settings'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={classNames(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors',
        active ? 'bg-surface-highlight/55 text-text-primary/95' : 'text-text-secondary/60 hover:bg-surface-highlight/35 hover:text-text-primary/95',
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
        'flex h-7 w-7 items-center justify-center rounded-lg border transition-all',
        active ? 'border-accent/40 bg-accent/15 text-accent' : 'border-theme-border/5 bg-surface-highlight/20 text-text-secondary/60 hover:bg-surface-highlight/35 hover:text-text-primary/95',
      )}
      onClick={onClick}
      title={title}
    >
      <svg className="h-3.5 w-3.5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-96 rounded-xl border border-theme-border/10 bg-surface-elevated p-4" onClick={event => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary/95">{t('servers')}</h2>
          <button className="rounded p-1 text-text-tertiary/40 transition-colors hover:bg-surface-highlight/35 hover:text-text-primary/95" onClick={onClose} title={t('settings_close')}>x</button>
        </div>
        <div className="mb-3 space-y-1">
          {servers.map(server => (
            <div
              key={server.id}
              className={classNames(
                'flex cursor-pointer items-center justify-between rounded-lg border p-2 transition-all',
                server.id === activeServerId ? 'border-accent/50 bg-accent/15' : 'border-theme-border/10 bg-surface hover:bg-surface-highlight/30',
              )}
              onClick={() => onSelect(server.id)}
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-text-primary/95">{server.name}</div>
                <div className="truncate font-mono text-xs text-text-tertiary/40">{server.url}</div>
              </div>
              {server.id !== activeServerId && (
                <button
                  className="rounded p-1 text-text-tertiary/40 transition-colors hover:bg-surface-highlight/35 hover:text-error"
                  onClick={event => { event.stopPropagation(); onRemove(server.id); }}
                  title={t('server_remove')}
                >
                  x
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="border-t border-theme-border/10 pt-3">
          <div className="mb-1.5 text-[0.6875rem] font-medium uppercase text-text-tertiary/40">{t('server_add')}</div>
          <div className="space-y-1.5">
            <input className="w-full rounded border border-theme-border/10 bg-surface px-2.5 py-1.5 text-sm text-text-primary/95 outline-none transition-colors placeholder:text-text-tertiary/40 focus:border-accent" placeholder={t('server_name')} value={name} onChange={event => setName(event.target.value)} />
            <input className="w-full rounded border border-theme-border/10 bg-surface px-2.5 py-1.5 font-mono text-sm text-text-primary/95 outline-none transition-colors placeholder:text-text-tertiary/40 focus:border-accent" placeholder={t('server_url_placeholder')} value={url} onChange={event => setUrl(event.target.value)} />
            <button className="w-full rounded bg-accent py-1.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-30" disabled={!name || !url} onClick={() => { onAdd(name, url); setName(''); setUrl(''); }}>{t('server_add')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
