import { useState, useEffect, useCallback } from 'react';
import { socket } from '../../../shared/core/socket';
import { api } from '../../../shared/core/api';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

interface UseConnectionStatusResult {
  status: ConnectionStatus;
  error: string;
  reconnect: (sessionId: string) => Promise<void>;
}

export function useConnectionStatus(): UseConnectionStatusResult {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubOpen = socket.onOpen(() => {
      setStatus('connected');
      setError('');
    });

    const unsubClose = socket.onClose(() => {
      setStatus('disconnected');
    });

    const unsubError = socket.onError((errorMsg) => {
      setError(errorMsg);
      setStatus('disconnected');
    });

    return () => {
      unsubOpen();
      unsubClose();
      unsubError();
    };
  }, []);

  const reconnect = useCallback(async (sessionId: string) => {
    setStatus('connecting');
    setError('');

    try {
      const { ws_url } = await api.attachSession(sessionId);
      socket.connectWithToken(ws_url, sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reconnection failed');
      setStatus('disconnected');
    }
  }, []);

  return { status, error, reconnect };
}
