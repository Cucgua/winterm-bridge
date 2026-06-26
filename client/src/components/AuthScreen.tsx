import { useState } from 'react';
import { api, AuthResponse } from '../core/api';
import { socket } from '../core/socket';
import { useServerStore } from '../stores/serverStore';
import { useI18n } from '../i18n';

interface Props {
  onAuthenticated: (role: 'admin' | 'guest') => void;
}

export function AuthScreen({ onAuthenticated }: Props) {
  const { t } = useI18n();
  const { servers, activeServerId, addServer, setActiveServer, setToken } = useServerStore();
  const [mode, setMode] = useState<'select' | 'add'>(servers.length === 0 ? 'add' : 'select');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const activeServer = servers.find(s => s.id === activeServerId);

  const handleAddServer = () => {
    if (!name.trim() || !url.trim()) {
      setError('Name and URL are required');
      return;
    }
    const id = addServer(name.trim(), url.trim());
    setActiveServer(id);
    setMode('select');
    setName('');
    setUrl('');
    setError('');
  };

  const handleAuth = async () => {
    if (!activeServer) {
      setError('No server selected');
      return;
    }
    if (pin.length < 4) {
      setError('PIN too short');
      return;
    }

    setLoading(true);
    setError('');
    try {
      // Set the API base URL to the active server
      api.baseUrl = activeServer.url;
      socket.remoteBaseUrl = activeServer.url;
      const res: AuthResponse = await api.authenticate(pin);
      setToken(activeServer.id, res.token, res.role);
      onAuthenticated(res.role);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`${msg}\n(URL: ${activeServer.url}/api/auth)`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-canvas">
      <div className="w-full max-w-sm space-y-4 p-6">
        <h1 className="text-xl font-bold text-text-primary text-center">
          {t('app_name') || 'WinTerm Bridge'}
        </h1>

        {mode === 'add' ? (
          <div className="space-y-3">
            <input
              className="w-full px-3 py-2 bg-surface border border-theme-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
              placeholder="Server name (e.g. My WSL)"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
            <input
              className="w-full px-3 py-2 bg-surface border border-theme-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
              placeholder="http://192.168.1.50:8080"
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
            <button
              className="w-full py-2 bg-accent text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
              onClick={handleAddServer}
              disabled={!name.trim() || !url.trim()}
            >
              Add Server
            </button>
            {servers.length > 0 && (
              <button
                className="w-full py-1 text-sm text-text-secondary hover:text-text-primary"
                onClick={() => setMode('select')}
              >
                Use existing server
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Server selector */}
            <div className="space-y-1">
              <label className="text-xs text-text-secondary">Server</label>
              <select
                className="w-full px-3 py-2 bg-surface border border-theme-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                value={activeServerId || ''}
                onChange={e => setActiveServer(e.target.value)}
              >
                {servers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.url})
                  </option>
                ))}
              </select>
            </div>

            {/* PIN input */}
            <div className="space-y-1">
              <label className="text-xs text-text-secondary">PIN</label>
              <input
                className="w-full px-3 py-2 bg-surface border border-theme-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent font-mono tracking-widest"
                type="password"
                placeholder="Enter PIN"
                value={pin}
                onChange={e => setPin(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && handleAuth()}
                autoFocus
              />
            </div>

            {error && (
              <p className="text-sm text-error">{error}</p>
            )}

            <button
              className="w-full py-2 bg-accent text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
              onClick={handleAuth}
              disabled={loading || pin.length < 4}
            >
              {loading ? 'Connecting...' : 'Connect'}
            </button>

            <button
              className="w-full py-1 text-sm text-text-secondary hover:text-text-primary"
              onClick={() => setMode('add')}
            >
              + Add another server
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
