import { useEffect, useState, useCallback } from 'react';
import { api, FileEntry, ListFilesResponse } from '../core/api';
import { useServerStore } from '../stores/serverStore';

interface Props {
  sessionId: string;
  onClose: () => void;
}

export function FileManager({ sessionId, onClose }: Props) {
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
      setError(e instanceof Error ? e.message : 'Failed to load files');
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
      setError(e instanceof Error ? e.message : 'Failed to read file');
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
      const msg = e instanceof Error ? e.message : 'Failed to save';
      // Handle mtime conflict
      if (msg.includes('changed') || msg.includes('modified')) {
        setEditError('File was modified externally. Overwrite?');
      } else {
        setEditError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry: FileEntry) => {
    if (!confirm(`Delete ${entry.name}?`)) return;
    try {
      await api.deleteSessionFile(sessionId, entry.path, { recursive: entry.is_dir });
      loadFiles(currentPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
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
    <div className="h-full flex flex-col bg-surface border-l border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <h2 className="text-sm font-bold text-text-primary/95">Files</h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-text-secondary/60 cursor-pointer">
            <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} />
            hidden
          </label>
          <button className="text-xs text-text-secondary/60 hover:text-text-primary/95" onClick={() => loadFiles(currentPath)} title="Refresh">↻</button>
          <button className="text-text-secondary/60 hover:text-text-primary/95" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-white/10 shrink-0 overflow-x-auto">
        <button
          className="text-xs text-text-secondary/60 hover:text-text-primary/95 px-1"
          onClick={goUp}
          disabled={currentPath === '.' || currentPath === '/'}
        >
          ↑
        </button>
        <span className="text-xs text-text-secondary/60 truncate">{cwd}/{currentPath === '.' ? '' : currentPath}</span>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 text-xs text-error bg-surface border-b border-white/10">
          {error}
          <button className="ml-2 underline" onClick={() => setError('')}>dismiss</button>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-auto">
        {loading && <p className="text-sm text-text-secondary/60 text-center py-4">Loading...</p>}
        {!loading && entries.length === 0 && (
          <p className="text-sm text-text-secondary/60 text-center py-4">Empty directory</p>
        )}
        {!loading && entries.map(entry => (
          <div
            key={entry.path}
            className="flex items-center justify-between px-4 py-1.5 hover:bg-white/5 cursor-pointer group"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditingFile(null)}>
          <div className="bg-surface border border-white/10 rounded-xl p-4 w-[700px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-text-primary/95 truncate">{editingFile.path}</span>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    className="px-3 py-1 bg-accent text-white rounded text-xs hover:opacity-90 disabled:opacity-50"
                    onClick={handleSaveFile}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                )}
                <button className="text-text-secondary/60 hover:text-text-primary/95 text-xs" onClick={() => setEditingFile(null)}>Close</button>
              </div>
            </div>
            {editError && <div className="text-xs text-error mb-2">{editError}</div>}
            <textarea
              className="flex-1 w-full bg-canvas border border-white/10 rounded-lg p-3 text-sm text-text-primary/95 font-mono resize-none focus:outline-none focus:border-accent"
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
