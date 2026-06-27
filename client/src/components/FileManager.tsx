import { useEffect, useState, useCallback } from 'react';
import { api, FileEntry, ListFilesResponse } from '../core/api';
import { useI18n } from '../i18n/i18nStore';
import { useServerStore } from '../stores/serverStore';

interface Props {
  sessionId: string;
  onClose: () => void;
}

export function FileManager({ sessionId, onClose }: Props) {
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
  }, [sessionId, showHidden]);

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
    const confirmKey = entry.is_dir ? 'files_delete_dir_confirm' : 'files_delete_confirm';
    if (!confirm(t(confirmKey, { name: entry.name }))) return;
    try {
      await api.deleteSessionFile(sessionId, entry.path, { recursive: entry.is_dir });
      loadFiles(currentPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('files_error_generic'));
    }
  };

  // File extension → color
  const getFileColor = (name: string): string => {
    const ext = name.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      ts: 'text-accent', tsx: 'text-accent', js: 'text-warning', jsx: 'text-warning',
      go: 'text-success', rs: 'text-error', py: 'text-warning',
      md: 'text-text-secondary/60', json: 'text-accent', yml: 'text-text-secondary/60',
      yaml: 'text-text-secondary/60', sh: 'text-success',
    };
    return map[ext || ''] || 'text-text-primary/95';
  };

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-theme-border/10 shrink-0">
        <h2 className="text-sm font-bold text-text-primary/95">{t('files_title')}</h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-text-secondary/60 cursor-pointer">
            <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} />
            {t('files_show_hidden')}
          </label>
          <button className="text-xs text-text-secondary/60 hover:text-text-primary/95" onClick={() => loadFiles(currentPath)} title={t('files_refresh')}>↻</button>
          <button className="text-text-secondary/60 hover:text-text-primary/95" onClick={onClose} title={t('settings_close')}>✕</button>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-theme-border/10 shrink-0 overflow-x-auto">
        <button
          className="text-xs text-text-secondary/60 hover:text-text-primary/95 px-1"
          onClick={goUp}
          disabled={currentPath === '.' || currentPath === '/'}
          title={t('files_up')}
        >
          ↑
        </button>
        <span className="text-xs text-text-secondary/60 truncate">{cwd}/{currentPath === '.' ? '' : currentPath}</span>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 text-xs text-error bg-error/10 border-b border-error/20">
          {error}
          <button className="ml-2 underline" onClick={() => setError('')}>{t('cancel')}</button>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-auto">
        {loading && <p className="text-sm text-text-secondary/60 text-center py-4">{t('loading')}</p>}
        {!loading && entries.length === 0 && (
          <p className="text-sm text-text-secondary/60 text-center py-4">{t('files_empty')}</p>
        )}
        {!loading && entries.map(entry => (
          <div
            key={entry.path}
            className="flex items-center justify-between px-4 py-1.5 hover:bg-surface-highlight/35 cursor-pointer group"
            onClick={() => handleOpenFile(entry)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm shrink-0">
                {entry.is_dir ? '📁' : '📄'}
              </span>
              <span className={`text-sm truncate ${entry.is_dir ? 'text-text-primary/95 font-medium' : getFileColor(entry.name)}`}>
                {entry.name}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!entry.is_dir && <span className="text-xs text-text-secondary/60">{formatSize(entry.size)}</span>}
              {isAdmin && (
                <button
                  className="opacity-0 group-hover:opacity-100 text-xs text-text-secondary/60 hover:text-error px-1"
                  onClick={(e) => { e.stopPropagation(); handleDelete(entry); }}
                  title={t('files_delete')}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* File editor modal */}
      {editingFile && (
        <div className="fixed inset-0 bg-canvas/70 flex items-center justify-center z-50 backdrop-blur-sm" onClick={() => setEditingFile(null)}>
          <div className="bg-surface-elevated border border-theme-border/10 rounded-xl p-4 w-[700px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-text-primary/95 truncate">{editingFile.path}</span>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    className="px-3 py-1 bg-accent text-accent-foreground rounded text-xs hover:opacity-90 disabled:opacity-50"
                    onClick={handleSaveFile}
                    disabled={saving}
                  >
                    {saving ? t('loading') : t('save')}
                  </button>
                )}
                <button className="text-text-secondary/60 hover:text-text-primary/95 text-xs" onClick={() => setEditingFile(null)}>{t('settings_close')}</button>
              </div>
            </div>
            {editError && <div className="text-xs text-error mb-2">{editError}</div>}
            <textarea
              className="flex-1 w-full bg-canvas border border-theme-border/10 rounded-lg p-3 text-sm text-text-primary/95 font-mono resize-none focus:outline-none focus:border-accent"
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              readOnly={!isAdmin}
              style={{ minHeight: '300px' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}
