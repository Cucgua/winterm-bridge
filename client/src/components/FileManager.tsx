import { useEffect, useState, useCallback } from 'react';
import { api, FileEntry, ListFilesResponse } from '../core/api';
import { useI18n } from '../i18n/i18nStore';
import { useServerStore } from '../stores/serverStore';
import {
  ChevronUpIcon,
  FileCodeIcon,
  FileIcon,
  FilesToolIcon,
  FolderIcon,
  RefreshIcon,
  SaveIcon,
  TrashIcon,
} from './ToolIcons';
import { ConfirmDialog, type ConfirmDialogRequest } from './ConfirmDialog';

interface Props {
  sessionId: string;
  onClose: () => void;
}

// Distinctive avatar tone for the Files panel (amber folder aesthetic).
const FILES_AVATAR_TONE = { backgroundColor: '#f08a00', color: '#ffffff' };

export function FileManager({ sessionId, onClose }: Props) {
  // onClose is part of the toggle contract (closed by re-clicking the toolbar
  // button) but the panel renders no in-card close affordance by design.
  void onClose;
  const { t } = useI18n();
  const { getActiveServer } = useServerStore();
  const isAdmin = getActiveServer()?.role === 'admin';

  const [cwd, setCwd] = useState('');
  const [currentPath, setCurrentPath] = useState('.');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showHidden, setShowHidden] = useState(false);

  // Editor state
  const [editingFile, setEditingFile] = useState<{ path: string; content: string; mtime: number } | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmDialogRequest | null>(null);

  const loadFiles = useCallback(async (path: string) => {
    setLoading(true);
    setError('');
    try {
      const data: ListFilesResponse = await api.listSessionFiles(sessionId, path, showHidden);
      setCwd(data.cwd);
      setCurrentPath(data.path);
      // Sort: dirs first, then by name
      const sorted = [...data.entries].sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(sorted);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('files_error_generic'));
    } finally {
      setLoading(false);
    }
  }, [sessionId, showHidden, t]);

  useEffect(() => {
    loadFiles('.');
  }, [loadFiles]);

  const navigateTo = (path: string) => {
    loadFiles(path);
  };

  const goUp = () => {
    if (currentPath === '.' || currentPath === '/') return;
    const parts = currentPath.split('/');
    parts.pop();
    navigateTo(parts.length > 1 ? parts.join('/') || '/' : '.');
  };

  const handleOpenFile = async (entry: FileEntry) => {
    if (entry.is_dir) {
      navigateTo(entry.path);
      return;
    }
    // Open editor
    try {
      const data = await api.getSessionFileContent(sessionId, entry.path);
      setEditingFile({ path: entry.path, content: data.content, mtime: data.mtime_ms });
      setEditContent(data.content);
      setEditError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('files_error_generic'));
    }
  };

  const handleSaveFile = async () => {
    if (!editingFile) return;
    setSaving(true);
    setEditError('');
    try {
      const result = await api.saveSessionFileContent(sessionId, editingFile.path, editContent, editingFile.mtime);
      if (result.ok) {
        setEditingFile(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('error_save_file');
      // Handle mtime conflict
      if (msg.includes('changed') || msg.includes('modified')) {
        setEditError(t('files_conflict_overwrite_confirm'));
      } else {
        setEditError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry: FileEntry) => {
    try {
      await api.deleteSessionFile(sessionId, entry.path, { recursive: entry.is_dir });
      loadFiles(currentPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('files_error_generic'));
    }
  };

  const requestDelete = (entry: FileEntry) => {
    const confirmKey = entry.is_dir ? 'files_delete_dir_confirm' : 'files_delete_confirm';
    setConfirmRequest({
      title: t('confirm_dialog_title'),
      message: t(confirmKey, { name: entry.name }),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      tone: 'danger',
      onConfirm: () => { void handleDelete(entry); },
    });
  };

  const displayPath = `${cwd}/${currentPath === '.' ? '' : currentPath}`;

  return (
    <div className="flex h-full flex-col bg-canvas">
      {/* Header — icon avatar + title + controls (no close button; toggled from toolbar) */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-theme-border/10 bg-surface px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
            style={FILES_AVATAR_TONE}
          >
            <FilesToolIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-text-primary/95">{t('files_title')}</h2>
            <p className="truncate font-mono text-xs text-text-secondary/55" title={displayPath}>{displayPath}</p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <IconAction title={t('files_refresh')} disabled={loading} onClick={() => loadFiles(currentPath)}>
            <RefreshIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </IconAction>
          <IconToggle
            title={t('files_show_hidden')}
            pressed={showHidden}
            onClick={() => { setShowHidden(v => !v); }}
          />
        </div>
      </div>

      {/* Breadcrumb / path bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-theme-border/10 bg-surface-highlight/15 px-4 py-2.5">
        <button
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary/60 transition-colors hover:bg-surface-highlight/40 hover:text-text-primary/95 disabled:opacity-30 disabled:hover:bg-transparent"
          onClick={goUp}
          disabled={currentPath === '.' || currentPath === '/'}
          title={t('files_up')}
        >
          <ChevronUpIcon className="h-4 w-4" />
        </button>
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
          <FolderIcon className="h-4 w-4 flex-shrink-0 text-warning" />
          <span className="truncate font-mono text-xs text-text-secondary/70">{displayPath}</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="shrink-0 border-b border-error/20 bg-error/10 px-4 py-2.5 text-xs font-semibold text-error">
          {error}
        </div>
      )}

      {/* File list */}
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {loading && (
          <div className="flex h-32 items-center justify-center">
            <span className="h-5 w-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          </div>
        )}
        {!loading && entries.length === 0 && (
          <div className="flex h-32 flex-col items-center justify-center text-text-tertiary/40">
            <FolderIcon className="mb-2 h-8 w-8" />
            <p className="text-sm font-semibold">{t('files_empty')}</p>
          </div>
        )}
        {!loading && entries.map(entry => {
          const isCodeFile = !entry.is_dir && isCodeName(entry.name);
          return (
            <div
              key={entry.path}
              className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-surface-highlight/35"
              onClick={() => handleOpenFile(entry)}
            >
              <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                entry.is_dir ? 'bg-warning/15 text-warning' : isCodeFile ? 'bg-accent/15 text-accent' : 'bg-surface-highlight/40 text-text-secondary/60'
              }`}>
                {entry.is_dir
                  ? <FolderIcon className="h-4 w-4" />
                  : isCodeFile
                    ? <FileCodeIcon className="h-4 w-4" />
                    : <FileIcon className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className={`truncate text-sm font-semibold ${entry.is_dir ? 'text-text-primary/95' : 'text-text-secondary/80'}`}>
                  {entry.name}
                </div>
                {!entry.is_dir && entry.size > 0 && (
                  <div className="truncate text-xs text-text-tertiary/55">{formatSize(entry.size)}</div>
                )}
              </div>
              {isAdmin && (
                <button
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-text-tertiary/45 opacity-0 transition-all hover:bg-error/15 hover:text-error group-hover:opacity-100"
                  title={t('files_delete')}
                  onClick={(e) => { e.stopPropagation(); requestDelete(entry); }}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* File editor modal */}
      {editingFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/75 p-4 backdrop-blur-sm"
          onClick={() => setEditingFile(null)}
        >
          <div
            className="flex w-[720px] max-w-full max-h-[82vh] flex-col overflow-hidden rounded-2xl border border-theme-border/10 bg-surface-elevated shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-theme-border/10 bg-surface px-5 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <FileCodeIcon className="h-4 w-4" />
                </span>
                <span className="truncate font-mono text-sm font-semibold text-text-primary/95" title={editingFile.path}>{editingFile.path}</span>
              </div>
              {isAdmin && (
                <button
                  className="flex h-9 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                  onClick={handleSaveFile}
                  disabled={saving}
                >
                  <SaveIcon className="h-4 w-4" />
                  {saving ? t('saving') : t('save')}
                </button>
              )}
            </div>
            {editError && (
              <div className="border-b border-error/20 bg-error/10 px-5 py-2 text-xs font-semibold text-error">{editError}</div>
            )}
            <textarea
              className="min-h-[300px] flex-1 resize-none bg-canvas p-4 font-mono text-sm leading-relaxed text-text-primary/90 outline-none placeholder:text-text-tertiary/40"
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              readOnly={!isAdmin}
              spellCheck={false}
            />
          </div>
        </div>
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

/** Small square icon button used for header actions (refresh, etc.). */
function IconAction({ title, disabled, onClick, children }: { title: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-theme-border/10 bg-surface-highlight/25 text-text-secondary/70 transition-colors hover:bg-surface-highlight/45 hover:text-text-primary/95 disabled:opacity-40"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Eye-style toggle for the "show hidden" filter, matching the settings toggle language. */
function IconToggle({ title, pressed, onClick }: { title: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
        pressed
          ? 'border-accent/40 bg-accent/15 text-accent'
          : 'border-theme-border/10 bg-surface-highlight/25 text-text-secondary/70 hover:bg-surface-highlight/45 hover:text-text-primary/95'
      }`}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        {pressed ? (
          <>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </>
        ) : (
          <>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a3 3 0 004.2 4.2" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.9 5.2A10.4 10.4 0 0112 5c6.5 0 10 7 10 7a17.3 17.3 0 01-3.2 4M6.6 6.6A17.5 17.5 0 002 12s3.5 7 10 7a10.4 10.4 0 003.4-.6" />
          </>
        )}
      </svg>
    </button>
  );
}

function isCodeName(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase();
  if (!ext) return false;
  return ['ts', 'tsx', 'js', 'jsx', 'go', 'rs', 'py', 'json', 'yml', 'yaml', 'sh', 'md', 'toml', 'css', 'html', 'sql'].includes(ext);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}
