import { ConnectionIndicator, ConnectionStatus } from './ConnectionIndicator';

interface StatusBarProps {
  status: ConnectionStatus;
  onReconnect: () => void;
  onLogout: () => void;
}

export function StatusBar({ status, onReconnect, onLogout }: StatusBarProps) {
  const statusText = {
    connecting: 'Connecting...',
    connected: 'Connected',
    disconnected: 'Disconnected',
  };

  const isDisconnected = status === 'disconnected';

  return (
    <div
      className={`h-10 flex items-center justify-between px-3 shrink-0 transition-colors duration-200 ${
        isDisconnected ? 'bg-red-900/20' : 'bg-gray-900/80 backdrop-blur'
      }`}
    >
      <div className="flex items-center gap-2">
        <ConnectionIndicator status={status} />
        <span className="text-gray-300 text-sm">{statusText[status]}</span>
        {isDisconnected && (
          <button
            onClick={onReconnect}
            className="text-blue-400 text-sm ml-2 active:text-blue-300"
          >
            Reconnect
          </button>
        )}
      </div>
      <button
        onClick={onLogout}
        className="text-gray-400 text-sm px-2 py-1 active:bg-gray-700 rounded transition-colors"
      >
        Logout
      </button>
    </div>
  );
}
