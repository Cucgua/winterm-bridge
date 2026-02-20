import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, FileEntry } from '../core/api';
import { useI18n } from '../i18n';

interface FileManagerPanelProps {
  sessionId?: string;
  currentPath?: string;
  canWrite: boolean;
  isOpen: boolean;
  onClose: () => void;
}

const EXT_COLORS: Record<string, string> = {
  ts: 'text-blue-400', tsx: 'text-blue-400', js: 'text-yellow-400', jsx: 'text-yellow-400',
  go: 'text-cyan-400', py: 'text-green-400', rs: 'text-orange-400', java: 'text-red-400',
  md: 'text-gray-400', json: 'text-yellow-300', yaml: 'text-pink-400', yml: 'text-pink-400',
  css: 'text-purple-400', scss: 'text-purple-400', html: 'text-orange-300',
  sh: 'text-green-300', bash: 'text-green-300', sql: 'text-blue-300',
  png: 'text-emerald-400', jpg: 'text-emerald-400', jpeg: 'text-emerald-400',
  gif: 'text-emerald-400', svg: 'text-emerald-400', webp: 'text-emerald-400',
};

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']);

function getFileExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function FileTypeIcon({ entry }: { entry: FileEntry }) {
  if (entry.is_dir) {
    return (
      <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h6l2 2h10v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      </svg>
    );
  }
  const ext = getFileExt(entry.name);
  const color = EXT_COLORS[ext] || 'text-sky-400';
  return (
    <svg className={`w-3.5 h-3.5 ${color} flex-shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 3v6h6" />
    </svg>
  );
}

const GIT_STATUS_COLORS: Record<string, string> = {
  M: 'text-yellow-400', A: 'text-green-400', D: 'text-red-400',
  '?': 'text-gray-400', R: 'text-blue-400', U: 'text-red-500',
};

function joinPath(base: string, name: string): string {
  const cleanName = name.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!cleanName) return base;
  return base === '.' ? cleanName : `${base}/${cleanName}`;
}

function parentPath(p: string): string {
  if (p === '.' || !p) return '.';
  const idx = p.lastIndexOf('/');
  return idx <= 0 ? '.' : p.slice(0, idx);
}

function formatModTime(modTime: string): string {
  const dt = new Date(modTime);
  if (Number.isNaN(dt.getTime())) return modTime;
  return dt.toLocaleString();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function pathSegments(p: string): { name: string; path: string }[] {
  if (p === '.') return [];
  const parts = p.split('/');
  return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }));
}

export function FileManagerPanel({ sessionId, canWrite, isOpen, onClose }: FileManagerPanelProps) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [, setCwd] = useState('');
  const [path, setPath] = useState('.');
  const [showHidden, setShowHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPath, setEditorPath] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [editorMtime, setEditorMtime] = useState<number | undefined>(undefined);
  const [editorSaving, setEditorSaving] = useState(false);

  // Preview state
  const [previewEntry, setPreviewEntry] = useState<FileEntry | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  // Git state
  const [gitStatusMap, setGitStatusMap] = useState<Record<string, string>>({});
  const [gitBranch, setGitBranch] = useState('');
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [diffContent, setDiffContent] = useState('');
  const [diffPath, setDiffPath] = useState('');
  const [diffOpen, setDiffOpen] = useState(false);
  const [showGitChanges, setShowGitChanges] = useState(false);

  const uploadInputRef = useRef<HTMLInputElement>(null);

  const canGoUp = useMemo(() => path !== '.', [path]);

  const refresh = useCallback(async () => {
    if (!sessionId || !isOpen) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.listSessionFiles(sessionId, path, showHidden);
      setEntries(result.entries);
      setCwd(result.cwd);
      setPath(result.path || '.');
    } catch (err) {
      if (path !== '.') {
        setPath('.');
      } else {
        setError(err instanceof Error ? err.message : t('files_error_generic'));
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId, isOpen, path, showHidden, t]);

  const refreshGitStatus = useCallback(async () => {
    if (!sessionId || !isOpen) return;
    try {
      const res = await api.getSessionGitStatus(sessionId);
      setIsGitRepo(res.is_repo);
      setGitBranch(res.branch || '');
      const map: Record<string, string> = {};
      for (const e of res.entries) map[e.path] = e.status;
      setGitStatusMap(map);
    } catch {
      setIsGitRepo(false);
    }
  }, [sessionId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
    void refreshGitStatus();
  }, [isOpen, refresh, refreshGitStatus]);

  useEffect(() => {
    if (!isOpen) return;
    setPath('.');
    setEntries([]);
    setError('');
    setPreviewEntry(null);
  }, [sessionId, isOpen]);

  const handleOpenDir = useCallback((entry: FileEntry) => {
    if (!entry.is_dir) return;
    setPreviewEntry(null);
    setPath(entry.path);
  }, []);

  const handleGoUp = useCallback(() => {
    if (!canGoUp) return;
    setPreviewEntry(null);
    setPath((prev) => parentPath(prev));
  }, [canGoUp]);

  const handlePreview = useCallback(async (entry: FileEntry) => {
    if (!sessionId || entry.is_dir) return;
    if (previewEntry?.path === entry.path) {
      setPreviewEntry(null);
      return;
    }
    setPreviewEntry(entry);
    setPreviewContent('');
    setPreviewImageUrl('');
    setPreviewLoading(true);
    const ext = getFileExt(entry.name);
    try {
      if (IMAGE_EXTS.has(ext)) {
        const blob = await api.downloadSessionFile(sessionId, entry.path);
        setPreviewImageUrl(URL.createObjectURL(blob));
      } else {
        const data = await api.getSessionFileContent(sessionId, entry.path);
        setPreviewContent(data.content);
      }
    } catch {
      setPreviewContent(t('files_preview_binary'));
    } finally {
      setPreviewLoading(false);
    }
  }, [sessionId, previewEntry, t]);

  const handleShowDiff = useCallback(async (entryPath: string) => {
    if (!sessionId) return;
    setDiffPath(entryPath);
    setDiffContent('');
    setDiffOpen(true);
    try {
      const res = await api.getSessionGitDiff(sessionId, entryPath);
      setDiffContent(res.diff || t('git_no_changes'));
    } catch {
      setDiffContent('Failed to load diff');
    }
  }, [sessionId, t]);

  const handleCreateFile = useCallback(async () => {
    if (!sessionId || !canWrite) return;
    const name = prompt(t('files_new_file_prompt'));
    if (!name) return;
    const filePath = joinPath(path, name);

    try {
      await api.saveSessionFileContent(sessionId, filePath, '');
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('files_error_generic'));
    }
  }, [sessionId, canWrite, path, refresh, t]);

  const handleCreateDir = useCallback(async () => {
    if (!sessionId || !canWrite) return;
    const name = prompt(t('files_new_dir_prompt'));
    if (!name) return;
    const dirPath = joinPath(path, name);

    try {
      await api.createSessionDir(sessionId, dirPath);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('files_error_generic'));
    }
  }, [sessionId, canWrite, path, refresh, t]);

  const handleRename = useCallback(async (entry: FileEntry) => {
    if (!sessionId || !canWrite) return;
    const name = prompt(t('files_rename_prompt'), entry.name);
    if (!name || name === entry.name) return;

    const toPath = joinPath(path, name);
    try {
      await api.moveSessionFile(sessionId, entry.path, toPath);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('files_error_generic'));
    }
  }, [sessionId, canWrite, path, refresh, t]);

  const handleDelete = useCallback(async (entry: FileEntry) => {
    if (!sessionId || !canWrite) return;
    const confirmed = confirm(
      (entry.is_dir ? t('files_delete_dir_confirm') : t('files_delete_confirm')).replace('{name}', entry.name),
    );
    if (!confirmed) return;

    let recursive = false;
    if (entry.is_dir) {
      recursive = confirm(t('files_delete_recursive_confirm'));
    }

    try {
      await api.deleteSessionFile(sessionId, entry.path, { recursive });
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('files_error_generic');
      if (entry.is_dir && !recursive && message.toLowerCase().includes('not empty')) {
        const retryRecursive = confirm(t('files_delete_recursive_retry'));
        if (retryRecursive) {
          try {
            await api.deleteSessionFile(sessionId, entry.path, { recursive: true });
            await refresh();
            return;
          } catch (retryErr) {
            alert(retryErr instanceof Error ? retryErr.message : t('files_error_generic'));
            return;
          }
        }
      }
      alert(message);
    }
  }, [sessionId, canWrite, refresh, t]);

  const handleOpenEditor = useCallback(async (entry: FileEntry) => {
    if (!sessionId || entry.is_dir) return;
    try {
      const data = await api.getSessionFileContent(sessionId, entry.path);
      setEditorPath(data.path);
      setEditorContent(data.content);
      setEditorMtime(data.mtime_ms);
      setEditorOpen(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : t('files_error_generic'));
    }
  }, [sessionId, t]);

  const handleSaveEditor = useCallback(async () => {
    if (!sessionId || !editorPath || !canWrite || editorSaving) return;
    setEditorSaving(true);
    try {
      await api.saveSessionFileContent(sessionId, editorPath, editorContent, editorMtime);
      setEditorOpen(false);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('files_error_generic');
      if (message.toLowerCase().includes('changed')) {
        const overwrite = confirm(t('files_conflict_overwrite_confirm'));
        if (overwrite) {
          try {
            await api.saveSessionFileContent(sessionId, editorPath, editorContent);
            setEditorOpen(false);
            await refresh();
            return;
          } catch (overwriteErr) {
            alert(overwriteErr instanceof Error ? overwriteErr.message : t('files_error_generic'));
            return;
          }
        }

        const reloadLatest = confirm(t('files_conflict_reload_confirm'));
        if (reloadLatest) {
          try {
            const latest = await api.getSessionFileContent(sessionId, editorPath);
            setEditorContent(latest.content);
            setEditorMtime(latest.mtime_ms);
            return;
          } catch (reloadErr) {
            alert(reloadErr instanceof Error ? reloadErr.message : t('files_error_generic'));
            return;
          }
        }
      }
      alert(message);
    } finally {
      setEditorSaving(false);
    }
  }, [sessionId, editorPath, canWrite, editorSaving, editorContent, editorMtime, refresh, t]);

  const handleDownload = useCallback(async (entry: FileEntry) => {
    if (!sessionId || entry.is_dir) return;
    try {
      const blob = await api.downloadSessionFile(sessionId, entry.path);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = entry.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : t('files_error_generic'));
    }
  }, [sessionId, t]);

  const handleUploadClick = useCallback(() => {
    if (!canWrite) return;
    uploadInputRef.current?.click();
  }, [canWrite]);

  const handleUploadChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!sessionId || !canWrite) return;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      await api.uploadSessionFile(sessionId, path, file);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('files_error_generic'));
    }
  }, [sessionId, canWrite, path, refresh, t]);

  if (!isOpen || !sessionId) {
    return null;
  }

  return (
    <>
      <div className="w-[380px] border-l border-theme-border/50 bg-surface/95 backdrop-blur-sm flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-3 py-2 border-b border-theme-border/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">{t('files_title')}</span>
            {isGitRepo && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                {gitBranch}
              </span>
            )}
            {!canWrite && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                {t('files_read_only')}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 rounded bg-surface-highlight/50 text-text-secondary hover:text-text-primary hover:bg-surface-highlight"
          >
            {t('cancel')}
          </button>
        </div>

        {/* Breadcrumb + toolbar */}
        <div className="px-3 py-2 border-b border-theme-border/50 space-y-1.5">
          <div className="flex items-center gap-1 text-[11px] text-text-secondary overflow-x-auto">
            <button onClick={() => { setPath('.'); setPreviewEntry(null); }} className="hover:text-text-primary shrink-0">~</button>
            {pathSegments(path).map((seg) => (
              <React.Fragment key={seg.path}>
                <span className="shrink-0">/</span>
                <button onClick={() => { setPath(seg.path); setPreviewEntry(null); }} className="hover:text-text-primary truncate max-w-[100px]">{seg.name}</button>
              </React.Fragment>
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={handleGoUp} disabled={!canGoUp} className="text-xs px-2 py-1 rounded bg-surface-highlight/50 text-text-secondary hover:text-text-primary hover:bg-surface-highlight disabled:opacity-40 disabled:cursor-not-allowed">{t('files_up')}</button>
            <button onClick={() => { void refresh(); void refreshGitStatus(); }} className="text-xs px-2 py-1 rounded bg-surface-highlight/50 text-text-secondary hover:text-text-primary hover:bg-surface-highlight">{t('files_refresh')}</button>
            {isGitRepo && Object.keys(gitStatusMap).length > 0 && (
              <button
                onClick={() => setShowGitChanges(v => !v)}
                className={`text-xs px-2 py-1 rounded ${showGitChanges ? 'bg-purple-500/30 text-purple-300' : 'bg-surface-highlight/50 text-text-secondary hover:text-text-primary hover:bg-surface-highlight'}`}
              >
                {t('git_changes')} ({Object.keys(gitStatusMap).length})
              </button>
            )}
            <label className="text-[11px] text-text-secondary flex items-center gap-1 cursor-pointer select-none">
              <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
              {t('files_show_hidden')}
            </label>
          </div>
          {canWrite && (
            <div className="flex items-center gap-1.5">
              <button onClick={handleCreateFile} className="text-xs px-2 py-1 rounded bg-surface-highlight/50 text-text-secondary hover:text-text-primary hover:bg-surface-highlight">{t('files_new_file')}</button>
              <button onClick={handleCreateDir} className="text-xs px-2 py-1 rounded bg-surface-highlight/50 text-text-secondary hover:text-text-primary hover:bg-surface-highlight">{t('files_new_dir')}</button>
              <button onClick={handleUploadClick} className="text-xs px-2 py-1 rounded bg-surface-highlight/50 text-text-secondary hover:text-text-primary hover:bg-surface-highlight">{t('files_upload')}</button>
              <input ref={uploadInputRef} type="file" className="hidden" onChange={handleUploadChange} />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {showGitChanges ? (
            Object.entries(gitStatusMap).map(([filePath, status]) => (
              <div key={filePath} className="rounded border border-theme-border/40 px-2 py-1.5 bg-surface-highlight/20 hover:bg-surface-highlight/40 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-text-primary truncate flex items-center gap-1.5 min-w-0">
                    <span className={`text-[9px] font-mono font-bold shrink-0 ${GIT_STATUS_COLORS[status] || 'text-gray-400'}`}>
                      {status === '?' ? 'U' : status}
                    </span>
                    <span className="truncate">{filePath}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => void handleShowDiff(filePath)} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30">{t('git_diff')}</button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <>
              {loading && (
                <div className="text-xs text-text-secondary px-2 py-1">{t('loading')}</div>
              )}
              {!loading && error && (
                <div className="text-xs text-error px-2 py-1">{error}</div>
              )}
              {!loading && !error && entries.length === 0 && (
                <div className="text-xs text-text-secondary px-2 py-1">{t('files_empty')}</div>
              )}

          {!loading && !error && entries.map((entry) => {
            const gitStatus = gitStatusMap[entry.path];
            const isPreviewActive = previewEntry?.path === entry.path;
            return (
              <React.Fragment key={entry.path}>
                <div className={`rounded border px-2 py-1.5 transition-colors ${isPreviewActive ? 'border-accent/50 bg-accent/5' : 'border-theme-border/40 bg-surface-highlight/20 hover:bg-surface-highlight/40'}`}>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => (entry.is_dir ? handleOpenDir(entry) : void handlePreview(entry))}
                      className="text-left min-w-0 flex-1"
                    >
                      <div className="text-xs text-text-primary truncate flex items-center gap-1.5">
                        <FileTypeIcon entry={entry} />
                        <span className="truncate">{entry.name}</span>
                        {gitStatus && (
                          <span className={`text-[9px] font-mono ${GIT_STATUS_COLORS[gitStatus] || 'text-gray-400'}`}>
                            {gitStatus === '?' ? 'U' : gitStatus}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-text-secondary truncate">
                        {entry.is_dir ? t('files_dir_label') : formatSize(entry.size)}
                        {' · '}{formatModTime(entry.mod_time)}
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      {!entry.is_dir && (
                        <button onClick={() => void handleOpenEditor(entry)} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-highlight/60 text-text-secondary hover:text-text-primary">{t('files_edit')}</button>
                      )}
                      {!entry.is_dir && gitStatus && (
                        <button onClick={() => void handleShowDiff(entry.path)} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30">{t('git_diff')}</button>
                      )}
                      {!entry.is_dir && (
                        <button onClick={() => void handleDownload(entry)} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-highlight/60 text-text-secondary hover:text-text-primary">{t('files_download')}</button>
                      )}
                      {canWrite && (
                        <button onClick={() => void handleRename(entry)} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-highlight/60 text-text-secondary hover:text-text-primary">{t('files_rename')}</button>
                      )}
                      {canWrite && (
                        <button
                          onClick={() => void handleDelete(entry)}
                          className={`text-[10px] px-1.5 py-0.5 rounded ${entry.is_dir ? 'bg-orange-500/20 text-orange-300 hover:bg-orange-500/30' : 'bg-error/20 text-error hover:bg-error/30'}`}
                        >
                          {entry.is_dir ? t('files_delete_dir') : t('files_delete')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {isPreviewActive && (
                  <div className="rounded border border-accent/30 bg-gray-900/50 p-2 text-xs">
                    {previewLoading && <div className="text-text-secondary">{t('loading')}</div>}
                    {!previewLoading && previewImageUrl && (
                      <img src={previewImageUrl} alt={entry.name} className="max-w-full max-h-48 rounded" />
                    )}
                    {!previewLoading && !previewImageUrl && previewContent && (
                      <pre className="text-gray-300 whitespace-pre-wrap break-all max-h-48 overflow-y-auto font-mono text-[11px]">{previewContent.slice(0, 5000)}</pre>
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}
            </>
          )}
        </div>
      </div>

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-3xl mx-4 bg-surface border border-theme-border rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-theme-border/50 flex items-center justify-between">
              <div className="text-sm text-text-primary truncate pr-4">
                {t('files_editor_title')}: {editorPath}
              </div>
              {!canWrite && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                  {t('files_read_only')}
                </span>
              )}
            </div>
            <div className="p-4">
              <textarea
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
                readOnly={!canWrite}
                rows={18}
                className="w-full px-3 py-2 bg-gray-900/70 border border-gray-700 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-accent resize-y"
              />
            </div>
            <div className="px-4 py-3 border-t border-theme-border/50 flex items-center justify-end gap-2">
              <button
                onClick={() => setEditorOpen(false)}
                className="px-3 py-1.5 text-xs rounded bg-surface-highlight/60 text-text-secondary hover:text-text-primary hover:bg-surface-highlight"
              >
                {t('cancel')}
              </button>
              {canWrite && (
                <button
                  onClick={() => void handleSaveEditor()}
                  disabled={editorSaving}
                  className="px-3 py-1.5 text-xs rounded bg-accent/80 text-white hover:bg-accent disabled:opacity-50"
                >
                  {editorSaving ? `${t('save')}...` : t('save')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {diffOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-3xl mx-4 bg-surface border border-theme-border rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-theme-border/50 flex items-center justify-between">
              <div className="text-sm text-text-primary truncate pr-4">
                {t('git_diff')}: {diffPath}
              </div>
              <button
                onClick={() => setDiffOpen(false)}
                className="px-3 py-1.5 text-xs rounded bg-surface-highlight/60 text-text-secondary hover:text-text-primary hover:bg-surface-highlight"
              >
                {t('files_close_preview')}
              </button>
            </div>
            <div className="p-4 max-h-[70vh] overflow-y-auto">
              {!diffContent ? (
                <div className="text-xs text-text-secondary">{t('loading')}</div>
              ) : (
                <pre className="text-[11px] font-mono whitespace-pre-wrap break-all text-gray-300">{
                  diffContent.split('\n').map((line, i) => {
                    let cls = '';
                    if (line.startsWith('+') && !line.startsWith('+++')) cls = 'text-green-400';
                    else if (line.startsWith('-') && !line.startsWith('---')) cls = 'text-red-400';
                    else if (line.startsWith('@@')) cls = 'text-cyan-400';
                    return <div key={i} className={cls}>{line}</div>;
                  })
                }</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
