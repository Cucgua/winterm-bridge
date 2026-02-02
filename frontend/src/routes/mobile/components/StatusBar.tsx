import { ConnectionIndicator, ConnectionStatus } from './ConnectionIndicator';
import { useI18n } from '../../../shared/i18n';
import { AIStatusTag } from '../../../shared/components/AIStatusBadge';
import { useAIStore } from '../../../shared/stores/aiStore';

interface StatusBarProps {
  status: ConnectionStatus;
  sessionId?: string;
  sessionTitle?: string;
  showLogs?: boolean;
  onReconnect: () => void;
  onLogout: () => void;
  onBackToSessions: () => void;
  onToggleLogs?: () => void;
}

export function StatusBar({ status, sessionId, sessionTitle, showLogs, onReconnect, onLogout, onBackToSessions, onToggleLogs }: StatusBarProps) {
  const { t } = useI18n();
  const aiEnabled = useAIStore((state) => state.aiEnabled);
  const summary = useAIStore((state) => sessionId ? state.summaries[sessionId] : null);

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
        <span className="text-white text-sm font-medium truncate max-w-[120px]">
          {sessionTitle || t('app_name')}
        </span>
        {/* AI Status Tag */}
        {aiEnabled && summary && (
          <AIStatusTag tag={summary.tag} description={summary.description} />
        )}
        {isDisconnected && (
          <button
            onClick={onReconnect}
            className="text-blue-400 text-xs px-2 py-0.5 bg-blue-500/10 rounded active:bg-blue-500/20"
          >
            {t('reconnect')}
          </button>
        )}
      </div>

      {/* Right: Logs + Logout buttons */}
      <div className="flex items-center">
        {/* Workflow logs button */}
        {aiEnabled && onToggleLogs && (
          <button
            onClick={onToggleLogs}
            className={`p-2 rounded-lg transition-colors ${
              showLogs
                ? 'text-purple-400 bg-purple-600/20'
                : 'text-gray-400 active:bg-gray-700'
            }`}
            title={t('auto_logs_title')}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
        )}
        {/* Logout button */}
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
    </div>
  );
}
