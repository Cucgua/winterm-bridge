import { ConnectionIndicator, ConnectionStatus } from './ConnectionIndicator';
import { useI18n } from '../../../shared/i18n';

interface StatusBarProps {
  status: ConnectionStatus;
  sessionTitle?: string;
  onReconnect: () => void;
  onLogout: () => void;
  onBackToSessions: () => void;
}

export function StatusBar({ status, sessionTitle, onReconnect, onLogout, onBackToSessions }: StatusBarProps) {
  const { t } = useI18n();

  const isDisconnected = status === 'disconnected';

  return (
    <div
      className={`h-11 flex items-center justify-between px-2 shrink-0 transition-colors duration-200 ${
        isDisconnected ? 'bg-red-900/20' : 'bg-gray-900/80 backdrop-blur'
      }`}
    >
      {/* Left: Back button */}
      <button
        onClick={onBackToSessions}
        className="p-2 text-gray-400 active:bg-gray-700 rounded-lg transition-colors"
        title={t('session_back')}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Center: Session info */}
      <div className="flex-1 flex items-center justify-center gap-2 min-w-0 px-2">
        <ConnectionIndicator status={status} />
        <span className="text-white text-sm font-medium truncate max-w-[160px]">
          {sessionTitle || t('app_name')}
        </span>
        {isDisconnected && (
          <button
            onClick={onReconnect}
            className="text-blue-400 text-xs px-2 py-0.5 bg-blue-500/10 rounded active:bg-blue-500/20"
          >
            {t('reconnect')}
          </button>
        )}
      </div>

      {/* Right: Logout button */}
      <button
        onClick={onLogout}
        className="p-2 text-gray-400 active:bg-gray-700 rounded-lg transition-colors"
        title={t('logout')}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      </button>
    </div>
  );
}
