// Contest realtime client (Phase G) — subscribes the arena to the /competition socket
// namespace on the main API so live data (leaderboard, clarifications, first-solve
// balloons, round status) arrives by push, no reloads. Handlers are read through a ref
// so the socket connects once per round (not on every render).

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getPlaygroundStoredToken } from '@/lib/authToken';
import { getMainApiOrigin } from '@/lib/utils';
import type { ContestLeaderboardRow } from '@/lib/mainApi';

export interface ContestSocketHandlers {
  onLeaderboard?: (data: { frozen: boolean; penaltyModel?: 'BEST_SCORE' | 'ICPC'; results: ContestLeaderboardRow[] }) => void;
  onClarification?: (c: { id: string; message: string; createdAt: string }) => void;
  onFirstSolve?: (d: { problemId: string; userName: string }) => void;
  onStatus?: (status: string) => void;
  onProctor?: (d: { locked: boolean; lockReason: string | null }) => void;
}

export function useContestSocket(roundId: string, enabled: boolean, handlers: ContestSocketHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled || !roundId) return;
    const token = getPlaygroundStoredToken();
    const socket: Socket = io(`${getMainApiOrigin()}/competition`, {
      transports: ['websocket'],
      withCredentials: true,
      auth: token ? { token } : undefined,
    });
    socket.on('connect', () => socket.emit('join', { roundId }));
    socket.on('contest:leaderboard', (d) => handlersRef.current.onLeaderboard?.(d));
    socket.on('contest:clarification', (c) => handlersRef.current.onClarification?.(c));
    socket.on('contest:firstSolve', (d) => handlersRef.current.onFirstSolve?.(d));
    socket.on('contest:status', (d: { status: string }) => handlersRef.current.onStatus?.(d.status));
    socket.on('contest:proctor', (d) => handlersRef.current.onProctor?.(d));
    return () => {
      socket.emit('leave', { roundId });
      socket.disconnect();
    };
  }, [roundId, enabled]);
}
