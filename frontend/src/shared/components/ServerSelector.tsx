import { useState } from 'react';
import { useServerStore, ServerEntry } from '../stores/serverStore';
import { useI18n } from '../i18n';

interface ServerSelectorProps {
  collapsed?: boolean;
  onSwitch: (server: ServerEntry) => void;
}

export function ServerSelector({ collapsed, onSwitch }: ServerSelectorProps) {
  const { t } = useI18n();
  const servers = useServerStore(s => s.servers);
  const activeServerId = useServerStore(s => s.activeServerId);
  const addServer = useServerStore(s => s.addServer);
  const removeServer = useServerStore(s => s.removeServer);
  const updateServer = useServerStore(s => s.updateServer);
  const setActiveServer = useServerStore(s => s.setActiveServer);

  const [showDropdown, setShowDropdown] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');

  const activeServer = servers.find(s => s.id === activeServerId) || servers[0];

  const handleAdd = () => {
    setEditId(null);
    setFormName('');
    setFormUrl('');
    setShowForm(true);
    setShowDropdown(false);
  };

  const handleEdit = (s: ServerEntry) => {
    setEditId(s.id);
    setFormName(s.name);
    setFormUrl(s.url);
    setShowForm(true);
  };

  const handleSave = () => {
    const name = formName.trim();
    const url = formUrl.trim();
    if (!name || !url) return;

    if (editId) {
      updateServer(editId, { name, url });
    } else {
      addServer(name, url);
    }
    setShowForm(false);
  };

  const handleSelect = (server: ServerEntry) => {
    if (server.id === activeServerId) {
      setShowDropdown(false);
      return;
    }
    setActiveServer(server.id);
    setShowDropdown(false);
    onSwitch(server);
  };

  const handleRemove = (id: string, name: string) => {
    if (!confirm(t('server_remove_confirm').replace('{name}', name))) return;
    const wasActive = id === activeServerId;
    removeServer(id);
    if (wasActive) {
      onSwitch(servers.find(s => s.id === 'local') || servers[0]);
    }
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface-highlight/50 hover:bg-surface-highlight text-text-secondary hover:text-text-primary transition-colors relative"
        title={activeServer.name}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
        </svg>
        {servers.length > 1 && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-accent text-white text-[9px] rounded-full flex items-center justify-center">
            {servers.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="relative">
      {/* Current server button */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-surface-highlight/50 hover:bg-surface-highlight text-sm transition-colors"
      >
        <svg className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
        </svg>
        <span className="truncate text-text-primary">{activeServer.name}</span>
        <svg className="w-3 h-3 text-text-secondary ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-surface border border-theme-border rounded-lg shadow-xl overflow-hidden">
            {servers.map(s => (
              <div
                key={s.id}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm transition-colors group ${
                  s.id === activeServerId ? 'bg-accent/10 text-accent' : 'hover:bg-surface-highlight text-text-primary'
                }`}
                onClick={() => handleSelect(s)}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.token ? 'bg-success' : 'bg-gray-500'}`} />
                <span className="truncate flex-1">{s.name}</span>
                {s.id !== 'local' && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEdit(s); }}
                      className="p-0.5 text-text-secondary hover:text-text-primary"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemove(s.id, s.name); }}
                      className="p-0.5 text-text-secondary hover:text-error"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
            <button
              onClick={handleAdd}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-highlight transition-colors border-t border-theme-border/50"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('server_add')}
            </button>
          </div>
        </>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-theme-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-5">
            <h3 className="text-base font-semibold text-text-primary mb-4">
              {editId ? t('server_edit') : t('server_add')}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">{t('server_name')}</label>
                <input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder={t('server_name_placeholder')}
                  className="w-full px-3 py-2 bg-surface-highlight/50 border border-theme-border rounded-lg text-text-primary text-sm placeholder-text-secondary/50 focus:outline-none focus:border-accent"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">{t('server_url')}</label>
                <input
                  value={formUrl}
                  onChange={e => setFormUrl(e.target.value)}
                  placeholder={t('server_url_placeholder')}
                  className="w-full px-3 py-2 bg-surface-highlight/50 border border-theme-border rounded-lg text-text-primary text-sm placeholder-text-secondary/50 focus:outline-none focus:border-accent"
                  onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary bg-surface-highlight/50 hover:bg-surface-highlight rounded-lg transition-all"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={!formName.trim() || !formUrl.trim()}
                className="px-3 py-1.5 text-sm text-white bg-accent hover:bg-accent/80 rounded-lg transition-all disabled:opacity-50"
              >
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
