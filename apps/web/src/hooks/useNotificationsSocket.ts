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

    // Live cache invalidation: the server emits `live:invalidate` with a scope on
    // mutations, so affected views refresh immediately — no manual reload. We
    // invalidate only the matching React Query keys (cheap) and also dispatch a
    // window 'cs-live' event for surfaces that don't use React Query (the admin
    // hiring board).
    const SCOPE_KEYS: Record<string, string[][]> = {
      hiring: [['my-hiring'], ['my-hiring-messages'], ['notifications'], ['notifications', 'preview']],
      slots: [['interview-my-booking'], ['interview-slots-available'], ['interview-updates']],
      announcements: [['announcements'], ['interview-updates'], ['notifications'], ['notifications', 'preview']],
      settings: [['settings']],
    };
    const onLive = (payload: { scope?: string }) => {
      const scope = payload?.scope;
      const keys = scope ? SCOPE_KEYS[scope] : undefined;
      if (keys) for (const qk of keys) qc.invalidateQueries({ queryKey: qk });
      try {
        window.dispatchEvent(new CustomEvent('cs-live', { detail: scope }));
      } catch {
        /* CustomEvent unsupported — the poll/fallback still keeps things fresh */
      }
    };
    socket.on('live:invalidate', onLive);

    return () => {
      socket.off('notification:broadcast');
      socket.off('invitation:received');
      socket.off('certificate:issued');
      socket.off('quiz:starting');
      socket.off('live:invalidate');
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, qc]);
}
