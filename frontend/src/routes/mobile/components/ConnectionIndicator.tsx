export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface ConnectionIndicatorProps {
  status: ConnectionStatus;
}

export function ConnectionIndicator({ status }: ConnectionIndicatorProps) {
  const statusConfig = {
    connecting: {
      color: 'bg-yellow-500',
      animate: 'animate-pulse',
    },
    connected: {
      color: 'bg-green-500',
      animate: '',
    },
    disconnected: {
      color: 'bg-red-500 ring-1 ring-red-400',
      animate: '',
    },
  };

  const config = statusConfig[status];

  return (
    <div
      className={`w-2 h-2 rounded-full ${config.color} ${config.animate}`}
      aria-label={`Connection status: ${status}`}
    />
  );
}
