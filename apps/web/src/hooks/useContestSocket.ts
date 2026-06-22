// Contest realtime client for the admin monitor (Phase G). Subscribes to the /competition
// namespace (which lives on the idle playground execute-server, Phase H) and forwards each
// live event's PAYLOAD to a typed handler so the monitor can update its live log + patch
// rows locally — no main-API refetch per event (the heavy work stays off the main server).
// The merged participant snapshot is reconciled by a slow REST poll only. Handlers are read
// through a ref so the socket connects once per round; `onConnectedChange` lets the monitor
// show a live/offline indicator and fast-poll only when the relay is down.

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import type { CompetitionViolationKind } from '@/lib/api';

// The /competition relay runs on the playground execute-server (Phase H). The web admin
// monitor connects there. Origin resolution, most→least authoritative:
//   1. `settings.playgroundApiUrl` — served at RUNTIME by the API from its PLAYGROUND_API_URL
//      env, so a single API env var turns the relay on with no web rebuild.
//   2. `VITE_PLAYGROUND_API_URL` — build-time fallback (legacy / static deploys).
//   3. dev localhost.
// Unset everywhere ⇒ no socket; the monitor's REST polling is the fallback (feature still works).
function relayOrigin(settingsUrl?: string | null): string | null {
  const fromSettings = settingsUrl?.trim();
  if (fromSettings) return fromSettings.replace(/\/+$/, '');
  const configured = (import.meta.env.VITE_PLAYGROUND_API_URL as string | undefined)?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return import.meta.env.DEV ? 'http://localhost:5002' : null;
}

export interface ContestViolationEvent { userId: string; userName?: string; kind: CompetitionViolationKind; detail?: string | null; violationCount?: number; at?: number }
export interface ContestSubmissionEvent { userName: string; problemId: string; verdict: string; score: number; at?: number }
export interface ContestParticipantEvent { userId: string; locked: boolean }
export interface ContestFirstSolveEvent { problemId: string; userName: string }
export interface ContestStatusEvent { status: string }
export interface ContestClarificationEvent { id: string; message: string; createdAt: string }

export interface ContestAdminSocketHandlers {
  onViolation?: (e: ContestViolationEvent) => void;
  onSubmission?: (e: ContestSubmissionEvent) => void;
  onParticipant?: (e: ContestParticipantEvent) => void;
  onFirstSolve?: (e: ContestFirstSolveEvent) => void;
  onLeaderboard?: () => void;
  onStatus?: (e: ContestStatusEvent) => void;
  onClarification?: (c: ContestClarificationEvent) => void;
  /** Relay connected/disconnected — drives the live indicator + poll cadence. */
  onConnectedChange?: (connected: boolean) => void;
}

export function useContestAdminSocket(roundId: string, enabled: boolean, handlers: ContestAdminSocketHandlers): void {
  const { token } = useAuth();
  const { settings } = useSettings();
  const relayUrl = settings?.playgroundApiUrl ?? null;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled || !roundId || !token) return;
    const origin = relayOrigin(relayUrl);
    if (!origin) return; // relay not configured in this environment → REST polling stays
    const socket: Socket = io(`${origin}/competition`, {
      transports: ['websocket'],
      withCredentials: true,
      auth: { token },
    });
    socket.on('connect', () => { socket.emit('join', { roundId }); handlersRef.current.onConnectedChange?.(true); });
    socket.on('disconnect', () => handlersRef.current.onConnectedChange?.(false));
    socket.io.on('reconnect', () => handlersRef.current.onConnectedChange?.(true));
    socket.on('contest:submission', (e: ContestSubmissionEvent) => handlersRef.current.onSubmission?.(e));
    socket.on('contest:violation', (e: ContestViolationEvent) => handlersRef.current.onViolation?.(e));
    socket.on('contest:participant', (e: ContestParticipantEvent) => handlersRef.current.onParticipant?.(e));
    socket.on('contest:firstSolve', (e: ContestFirstSolveEvent) => handlersRef.current.onFirstSolve?.(e));
    socket.on('contest:leaderboard', () => handlersRef.current.onLeaderboard?.());
    socket.on('contest:status', (e: ContestStatusEvent) => handlersRef.current.onStatus?.(e));
    socket.on('contest:clarification', (c: ContestClarificationEvent) => handlersRef.current.onClarification?.(c));
    return () => {
      handlersRef.current.onConnectedChange?.(false);
      socket.emit('leave', { roundId });
      socket.disconnect();
    };
    // `relayUrl` MUST stay in the deps: settings load async, so on first render it's null
    // (relay skipped → REST polling). When the runtime `playgroundApiUrl` arrives this re-runs
    // and finally opens the socket — without it the monitor would never go realtime in prod,
    // where the build-time VITE_PLAYGROUND_API_URL is intentionally unset.
  }, [roundId, enabled, token, relayUrl]);
}
