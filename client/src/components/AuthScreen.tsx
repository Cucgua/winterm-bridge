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
      setError(t('auth_error_name_url_required'));
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
      setError(t('auth_error_no_server_selected'));
      return;
    }
    if (pin.length < 4) {
      setError(t('auth_error_pin_too_short'));
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
        <h1 className="text-xl font-bold text-text-primary/95 text-center">
          {t('app_name') || 'WinTerm Bridge'}
        </h1>

        {mode === 'add' ? (
          <div className="space-y-3">
            <input
              className="w-full rounded-lg border border-theme-border/10 bg-surface px-3 py-2 text-text-primary/95 outline-none transition-colors placeholder:text-text-secondary focus:border-accent"
              placeholder={t('auth_server_name_placeholder')}
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
            <input
              className="w-full rounded-lg border border-theme-border/10 bg-surface px-3 py-2 text-text-primary/95 outline-none transition-colors placeholder:text-text-secondary focus:border-accent"
              placeholder={t('server_url_placeholder')}
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
            <button
              className="w-full rounded-lg bg-accent py-2 font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              onClick={handleAddServer}
              disabled={!name.trim() || !url.trim()}
            >
              {t('server_add')}
            </button>
            {servers.length > 0 && (
              <button
                className="w-full py-1 text-sm text-text-secondary/60 hover:text-text-primary/95"
                onClick={() => setMode('select')}
              >
                {t('auth_use_existing_server')}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Server selector */}
            <div className="space-y-1">
              <label className="text-xs text-text-secondary/60">{t('auth_server_label')}</label>
              <select
                className="w-full rounded-lg border border-theme-border/10 bg-surface px-3 py-2 text-text-primary/95 outline-none transition-colors focus:border-accent"
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
              <label className="text-xs text-text-secondary/60">{t('auth_pin_label')}</label>
              <input
                className="w-full rounded-lg border border-theme-border/10 bg-surface px-3 py-2 font-mono tracking-widest text-text-primary/95 outline-none transition-colors placeholder:text-text-secondary focus:border-accent"
                type="password"
                placeholder={t('auth_pin_placeholder')}
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
              className="w-full rounded-lg bg-accent py-2 font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              onClick={handleAuth}
              disabled={loading || pin.length < 4}
            >
              {loading ? t('server_connecting') : t('connect')}
            </button>

            <button
              className="w-full py-1 text-sm text-text-secondary/60 hover:text-text-primary/95"
              onClick={() => setMode('add')}
            >
              + {t('auth_add_another_server')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
