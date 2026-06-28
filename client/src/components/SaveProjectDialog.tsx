import { useEffect, useState } from 'react';
import type { SessionInfo } from '../core/api';
import { useI18n } from '../i18n';
import { CloseIcon, SaveProjectIcon } from './ToolIcons';

function basename(path: string) {
  const trimmed = path.trim().replace(/[\\/]+$/, '');
  if (!trimmed) return '';
  const parts = trimmed.split(/[\\/]+/);
  return parts[parts.length - 1] || '';
}

export function defaultProjectNameForSession(session: SessionInfo) {
  return basename(session.current_path || '') || session.title || session.tmux_name || `Session ${session.id.slice(0, 6)}`;
}

interface Props {
  session: SessionInfo;
  loading?: boolean;
  error?: string;
  onClose: () => void;
  onSave: (name: string) => void;
}

// Distinctive avatar tone for the save-project dialog (magenta).
const SAVE_AVATAR_TONE = { backgroundColor: '#d4145a', color: '#ffffff' };

export function SaveProjectDialog({ session, loading = false, error = '', onClose, onSave }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState(defaultProjectNameForSession(session));

  useEffect(() => {
    setName(defaultProjectNameForSession(session));
  }, [session]);

  const handleSubmit = () => {
    if (loading) return;
    onSave(name.trim());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/75 p-4 backdrop-blur-sm"
      onClick={() => { if (!loading) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-theme-border/10 bg-surface-elevated p-6 shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        {/* Header — icon avatar + title + explicit close (form dialog: must be
            dismissable when clicked by mistake, unlike persistent tool panels) */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
              style={SAVE_AVATAR_TONE}
            >
              <SaveProjectIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-text-primary/95">{t('settings_save_project')}</h2>
              <p className="mt-0.5 truncate font-mono text-xs text-text-secondary/55" title={session.current_path || undefined}>
                {session.current_path || t('project_current_directory_fallback')}
              </p>
            </div>
          </div>
          <button
            type="button"
            title={t('close')}
            disabled={loading}
            onClick={onClose}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-text-tertiary/50 transition-colors hover:bg-surface-highlight/55 hover:text-text-primary/95 disabled:opacity-40"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-text-secondary/60">{t('project_name_placeholder')}</label>
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            onKeyDown={event => event.key === 'Enter' && handleSubmit()}
            autoFocus
            className="h-11 w-full rounded-xl border border-theme-border/10 bg-surface px-4 text-sm text-text-primary/95 outline-none transition-colors placeholder:text-text-tertiary/40 focus:border-accent"
            placeholder={defaultProjectNameForSession(session)}
          />
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            className="flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? t('saving') : t('create_project')}
          </button>
        </div>
      </div>
    </div>
  );
}
