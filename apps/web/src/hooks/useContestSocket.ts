// Contest realtime client for the admin monitor (Phase G). Subscribes to the
// /competition namespace and invokes a debounced callback on any live event so the
// monitor refreshes near-instantly without a manual reload (the server stays the source
// of truth for the merged participant view). Handlers are read through a ref so the
// socket connects once per round.

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@/context/AuthContext';

// The /competition relay runs on the playground execute-server (Phase H). The web admin
// monitor connects there. Unset in prod ⇒ no socket; the monitor's REST polling (8s) is
// the fallback, so the feature still works.
function relayOrigin(): string | null {
  const configured = (import.meta.env.VITE_PLAYGROUND_API_URL as string | undefined)?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return import.meta.env.DEV ? 'http://localhost:5002' : null;
}

export interface ContestAdminSocketHandlers {
  /** Any participant/submission/violation/status/leaderboard change — refresh the monitor. */
  onChange?: () => void;
  onClarification?: (c: { id: string; message: string; createdAt: string }) => void;
}

export function useContestAdminSocket(roundId: string, enabled: boolean, handlers: ContestAdminSocketHandlers): void {
  const { token } = useAuth();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled || !roundId || !token) return;
    const origin = relayOrigin();
    if (!origin) return; // relay not configured in this environment → REST polling stays
    const socket: Socket = io(`${origin}/competition`, {
      transports: ['websocket'],
      withCredentials: true,
      auth: { token },
    });
    const change = () => handlersRef.current.onChange?.();
    socket.on('connect', () => socket.emit('join', { roundId }));
    socket.on('contest:submission', change);
    socket.on('contest:violation', change);
    socket.on('contest:participant', change);
    socket.on('contest:leaderboard', change);
    socket.on('contest:status', change);
    socket.on('contest:clarification', (c) => handlersRef.current.onClarification?.(c));
    return () => {
      socket.emit('leave', { roundId });
      socket.disconnect();
    };
  }, [roundId, enabled, token]);
}
