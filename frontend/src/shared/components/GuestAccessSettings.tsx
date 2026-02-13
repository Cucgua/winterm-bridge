import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, GuestPinGrant, SessionInfo } from '../core/api';
import { useI18n } from '../i18n';
import { copyToClipboard } from '../utils/clipboard';

interface GuestAccessSettingsProps {
  sessions: SessionInfo[];
  isVisible: boolean;
}

export const GuestAccessSettings: React.FC<GuestAccessSettingsProps> = ({ sessions, isVisible }) => {
  const { t } = useI18n();
  const [grants, setGrants] = useState<GuestPinGrant[]>([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revealedPins, setRevealedPins] = useState<Record<string, string>>({});
  const [lastCreatedPin, setLastCreatedPin] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        const aName = (a.title || '').toLowerCase();
        const bName = (b.title || '').toLowerCase();
        if (aName !== bName) return aName.localeCompare(bName);
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }),
    [sessions]
  );

  const sessionNameMap = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach((session) => {
      const fallback = `Session ${session.id.slice(0, 8)}`;
      map.set(session.id, session.title || fallback);
    });
    return map;
  }, [sessions]);

  useEffect(() => {
    setSelectedSessionIds((prev) =>
      prev.filter((id) => sessions.some((session) => session.id === id))
    );
  }, [sessions]);

  const loadGrants = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const { grants: data } = await api.listGuestPins();
      setGrants(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('guest_access_error_generic'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isVisible) return;
    loadGrants();
  }, [isVisible, loadGrants]);

  const allSelected =
    sortedSessions.length > 0 && selectedSessionIds.length === sortedSessions.length;

  const toggleSelectSession = (sessionId: string) => {
    setSelectedSessionIds((prev) => {
      if (prev.includes(sessionId)) {
        return prev.filter((id) => id !== sessionId);
      }
      return [...prev, sessionId];
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedSessionIds([]);
      return;
    }
    setSelectedSessionIds(sortedSessions.map((session) => session.id));
  };

  const handleCreateGrant = async () => {
    if (selectedSessionIds.length === 0 || isCreating) return;

    setIsCreating(true);
    setError('');
    setCopied(false);
    try {
      const { grant } = await api.createGuestPin({ session_ids: selectedSessionIds });
      const pin = grant.pin || '';
      if (pin) {
        setLastCreatedPin(pin);
        setRevealedPins((prev) => ({ ...prev, [grant.id]: pin }));
      }
      setSelectedSessionIds([]);
      await loadGrants();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('guest_access_error_generic'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyLastPin = async () => {
    if (!lastCreatedPin) return;
    try {
      await copyToClipboard(lastCreatedPin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleRevoke = async (grantId: string) => {
    if (!confirm(t('guest_access_revoke_confirm'))) return;

    setRevokingId(grantId);
    setError('');
    try {
      await api.revokeGuestPin(grantId);
      setGrants((prev) => prev.map((grant) => (grant.id === grantId ? { ...grant, active: false } : grant)));
      setRevealedPins((prev) => {
        const next = { ...prev };
        delete next[grantId];
        return next;
      });
      await loadGrants();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('guest_access_error_generic'));
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-800/50 p-4 rounded-xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium text-white">{t('guest_access_title')}</div>
            <div className="text-sm text-gray-400">{t('guest_access_desc')}</div>
          </div>
          <button
            onClick={loadGrants}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs text-gray-300 hover:text-white bg-gray-700/60 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {t('guest_access_refresh')}
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm text-white">{t('guest_access_select_sessions')}</div>
            <button
              onClick={toggleSelectAll}
              disabled={sortedSessions.length === 0}
              className="text-xs text-purple-400 hover:text-purple-300 disabled:text-gray-500 transition-colors"
            >
              {allSelected ? t('guest_access_clear_selection') : t('guest_access_select_all')}
            </button>
          </div>

          <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/40 p-2 space-y-1.5">
            {sortedSessions.length === 0 ? (
              <div className="text-xs text-gray-500 px-2 py-2">{t('guest_access_no_sessions')}</div>
            ) : (
              sortedSessions.map((session) => {
                const checked = selectedSessionIds.includes(session.id);
                return (
                  <label
                    key={session.id}
                    className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-gray-800/70 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelectSession(session.id)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-200 truncate">
                        {session.title || `Session ${session.id.slice(0, 8)}`}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{session.id}</div>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <button
          onClick={handleCreateGrant}
          disabled={selectedSessionIds.length === 0 || isCreating}
          className="w-full px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-gray-600 disabled:to-gray-600 text-white rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
        >
          {isCreating && <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {isCreating ? t('guest_access_generating') : t('guest_access_generate')}
        </button>

        {lastCreatedPin && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-900/20 p-3">
            <div className="text-xs text-emerald-300 mb-1">{t('guest_access_new_pin')}</div>
            <div className="flex items-center justify-between gap-3">
              <code className="text-base text-emerald-100 tracking-wide">{lastCreatedPin}</code>
              <button
                onClick={handleCopyLastPin}
                className="px-3 py-1.5 text-xs bg-emerald-700/40 hover:bg-emerald-700/60 text-emerald-100 rounded-md transition-colors"
              >
                {copied ? t('guest_access_copied') : t('guest_access_copy_pin')}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="text-sm px-3 py-2 rounded-lg bg-red-900/40 text-red-300 border border-red-700/40">
            {error}
          </div>
        )}
      </div>

      <div className="bg-gray-800/50 p-4 rounded-xl space-y-3">
        <div className="font-medium text-white">{t('guest_access_list_title')}</div>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full" />
          </div>
        ) : grants.length === 0 ? (
          <div className="text-sm text-gray-500">{t('guest_access_list_empty')}</div>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {grants.map((grant) => {
              const displayPin = revealedPins[grant.id] || grant.pin || grant.masked_pin || '****';
              const sessionNames = grant.session_ids.map((id) => sessionNameMap.get(id) || `Session ${id.slice(0, 8)}`);

              return (
                <div key={grant.id} className="rounded-lg border border-gray-700 bg-gray-900/40 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-gray-400">{t('guest_access_pin_label')}</div>
                      <code className="text-sm text-white break-all">{displayPin}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          grant.active ? 'bg-emerald-900/40 text-emerald-300' : 'bg-gray-700 text-gray-300'
                        }`}
                      >
                        {grant.active ? t('guest_access_status_active') : t('guest_access_status_revoked')}
                      </span>
                      <button
                        onClick={() => handleRevoke(grant.id)}
                        disabled={!grant.active || revokingId === grant.id}
                        className="px-2.5 py-1.5 text-xs bg-red-700/70 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-md transition-colors"
                      >
                        {revokingId === grant.id ? '...' : t('guest_access_revoke')}
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-gray-400">
                    {t('guest_access_created_at')} {new Date(grant.created_at).toLocaleString()}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {sessionNames.map((name) => (
                      <span key={`${grant.id}-${name}`} className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
