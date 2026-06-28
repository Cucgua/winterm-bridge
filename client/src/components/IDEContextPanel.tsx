import { useEffect, useMemo, useState } from 'react';
import { api, IDEProjectContext, SessionInfo } from '../core/api';
import { useI18n } from '../i18n/i18nStore';
import { copyToClipboard } from '../utils/clipboard';

interface Props {
  session: SessionInfo;
  onClose: () => void;
}

function titleOf(session: SessionInfo) {
  return session.title || session.tmux_name || `Session ${session.id.slice(0, 6)}`;
}

export function IDEContextPanel({ session, onClose }: Props) {
  const { t } = useI18n();
  const [projects, setProjects] = useState<IDEProjectContext[]>([]);
  const [matchedIndex, setMatchedIndex] = useState(-1);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const activeProject = projects[activeIndex];

  const loadContext = async () => {
    setLoading(true);
    try {
      const result = await api.getIDEContext(session.current_path, titleOf(session));
      setProjects(result.projects);
      setMatchedIndex(result.matchedIndex);
      const nextIndex = result.matchedIndex >= 0 ? result.matchedIndex : Math.max(result.fallbackIndex, 0);
      setActiveIndex(nextIndex);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('ide_test_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContext();
  }, [session.id, session.current_path, session.title, session.tmux_name]);

  const copyPayload = useMemo(() => {
    if (!activeProject) return '';
    const lines = [
      `${t('ide_field_project')}: ${activeProject.project?.name || '-'}`,
      `${t('ide_field_project_path')}: ${activeProject.project?.basePath || '-'}`,
    ];
    const activeFile = activeProject.openFiles.find(file => file.isActive) || activeProject.openFiles[0];
    if (activeFile) {
      lines.push(`${t('files_current')}: ${activeFile.path}`);
    }
    if (activeProject.currentFunction) {
      lines.push(`${t('ide_field_current_function')}: ${activeProject.currentFunction.signature}`);
    }
    return lines.join('\n');
  }, [activeProject, t]);

  const copyText = async (text: string) => {
    if (!text) return;
    try {
      await copyToClipboard(text);
      setNotice(t('ide_copied'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('session_copy_failed'));
    }
  };

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-theme-border/10 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-text-primary/95">{t('ide_panel_title')}</h2>
          <p className="mt-1 truncate text-xs font-semibold text-text-secondary/45">{session.current_path || titleOf(session)}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button className="rounded-lg px-2 py-1 text-xs font-semibold text-text-secondary/60 transition-colors hover:bg-surface-highlight/35 hover:text-text-primary/95" onClick={loadContext}>
            {t('trellis_refresh')}
          </button>
          <button className="rounded-lg px-2 py-1 text-xs font-semibold text-text-secondary/60 transition-colors hover:bg-surface-highlight/35 hover:text-text-primary/95" onClick={onClose} title={t('settings_close')}>
            ×
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div className={`border-b px-4 py-2 text-xs font-semibold ${error ? 'border-error/20 bg-error/10 text-error' : 'border-accent/20 bg-accent/10 text-accent'}`}>
          {error || notice}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm font-semibold text-text-tertiary/45">{t('loading')}</div>
      ) : projects.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-5 text-center text-sm font-semibold text-text-tertiary/45">{t('ide_no_projects')}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            {projects.map((project, index) => (
              <button
                key={`${project.project?.basePath || 'project'}-${index}`}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                  activeIndex === index
                    ? 'border-accent/40 bg-accent/15 text-accent'
                    : 'border-theme-border/10 bg-surface-highlight/20 text-text-secondary/65 hover:bg-surface-highlight/35 hover:text-text-primary/95'
                }`}
                onClick={() => setActiveIndex(index)}
              >
                {project.project?.name || t('ide_field_project')}
                {index === matchedIndex && <span className="ml-2 text-xs">{t('ide_matched')}</span>}
              </button>
            ))}
          </div>

          {activeProject && (
            <div className="space-y-4">
              <section className="rounded-xl border border-theme-border/10 bg-surface-highlight/20 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold text-text-primary/95">{activeProject.project?.name || t('ide_field_project')}</h3>
                    <p className="mt-1 truncate font-mono text-xs text-text-secondary/55">{activeProject.project?.basePath || '-'}</p>
                  </div>
                  <button className="rounded-lg px-2 py-1 text-xs font-semibold text-text-secondary/60 transition-colors hover:bg-surface-highlight/35 hover:text-text-primary/95" onClick={() => copyText(copyPayload)}>
                    {t('ide_copy_all')}
                  </button>
                </div>
                {activeProject.currentFunction ? (
                  <div className="rounded-xl bg-canvas p-3">
                    <div className="mb-1 text-xs font-bold uppercase text-text-secondary/45">{t('ide_field_current_function')}</div>
                    <button
                      className="block w-full truncate text-left font-mono text-sm text-accent"
                      onClick={() => copyText(activeProject.currentFunction?.signature || '')}
                      title={t('ide_copy_signature')}
                    >
                      {activeProject.currentFunction.signature}
                    </button>
                    <div className="mt-1 truncate text-xs text-text-secondary/50">
                      {activeProject.currentFunction.filePath}:{activeProject.currentFunction.lineNumber}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-theme-border/10 bg-canvas px-4 py-5 text-center text-sm font-semibold text-text-tertiary/45">
                    {t('ide_no_data')}
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-theme-border/10 bg-surface-highlight/20 p-4">
                <div className="mb-3 text-sm font-bold text-text-primary/95">{t('ide_field_open_files')}</div>
                {activeProject.openFiles.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-theme-border/10 bg-canvas px-4 py-5 text-center text-sm font-semibold text-text-tertiary/45">
                    {t('ide_no_data')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeProject.openFiles.map(file => (
                      <button
                        key={file.path}
                        className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                          file.isActive
                            ? 'border-accent/35 bg-accent/10'
                            : 'border-theme-border/10 bg-canvas hover:bg-surface-highlight/25'
                        }`}
                        onClick={() => copyText(file.path)}
                        title={t('ide_copy_file_path')}
                      >
                        <div className="truncate text-sm font-bold text-text-primary/95">{file.name}</div>
                        <div className="mt-1 truncate font-mono text-xs text-text-secondary/50">{file.path}</div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
