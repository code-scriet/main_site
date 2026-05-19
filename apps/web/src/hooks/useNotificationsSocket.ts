// useNotificationsSocket — keeps the bell icon + notif menu in sync with server pushes.
// On `notification:broadcast`, `invitation:received`, `certificate:issued`, `quiz:starting`
// from the `/notifications` namespace, invalidates the React Query notification keys so
// the badge + dropdown refreshes before the next poll tick. Server bursts are debounced
// client-side to avoid a notification refetch stampede.

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/utils';

const NOTIFICATION_REFRESH_DEBOUNCE_MS = 2_000;

function getSocketUrl() {
  return getApiBaseUrl().replace(/\/api\/?$/, '');
}

export function useNotificationsSocket() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token) return;

    const socket = io(`${getSocketUrl()}/notifications`, {
      auth: { token },
      withCredentials: true,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 8000,
    });
    socketRef.current = socket;

    const refreshNow = () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications', 'preview'] });
    };
    const refresh = () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        refreshNow();
      }, NOTIFICATION_REFRESH_DEBOUNCE_MS);
    };

    socket.on('notification:broadcast', refresh);
    socket.on('invitation:received', refresh);
    socket.on('certificate:issued', refresh);
    socket.on('quiz:starting', refresh);

    return () => {
      socket.off('notification:broadcast');
      socket.off('invitation:received');
      socket.off('certificate:issued');
      socket.off('quiz:starting');
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, qc]);
}
