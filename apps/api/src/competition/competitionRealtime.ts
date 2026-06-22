// Contest realtime broadcaster + bounded in-memory store (Phase G). Pushes live deltas
// over the /competition Socket.io namespace so neither contestants nor admins ever need
// to reload: leaderboard updates, first-solve "balloons", admin submission/violation
// feeds, clarifications, proctor lock/unlock, and round-status (lobby → synced start).
//
// In-memory state is bounded by ACTIVE rounds (not user count) and evicted on finish —
// just a first-solve map (≤ #problems) + a throttle handle per round. The DB stays the
// source of truth; the store only avoids re-announcing first-solves and throttles the
// leaderboard recompute (1/sec per round, mirroring the quiz answer-count throttle).

import { prisma } from '../lib/prisma.js';
import { logger } from '../utils/logger.js';
import { getInternalApiSecret, getPlaygroundRelayBase } from '../utils/internalApi.js';
import { buildDsaLeaderboard, type DsaLeaderboardRow, type TeamLeaderboardOptions } from '../utils/contestScoring.js';

export const COMPETITION_NS = '/competition';
export const roomAll = (roundId: string) => `round:${roundId}`;
export const roomAdmin = (roundId: string) => `round:${roundId}:admin`;
export const roomUser = (roundId: string, userId: string) => `round:${roundId}:user:${userId}`;

// The /competition WebSocket lives on the (idle) playground server (Phase H). The main
// API computes everything and RELAYS ready-to-emit events to it over an internal HTTP
// POST. Fire-and-forget + best-effort: if the relay isn't configured or is down, clients
// fall back to REST polling — contest correctness never depends on the relay.
function relayEmit(room: string, event: string, payload: unknown): void {
  const base = getPlaygroundRelayBase();
  const secret = getInternalApiSecret();
  if (!base || !secret) return;
  void fetch(`${base}/internal/contest-emit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
    body: JSON.stringify({ room, event, payload }),
    signal: AbortSignal.timeout(4000),
  }).catch(() => undefined);
}

interface ContestRoom {
  firstSolved: Map<string, { userId: string; userName: string }>; // problemId → first AC
  hydratedFirstSolve: boolean;
  hydratingFirstSolve: Promise<void> | null; // in-flight hydration (coalesces concurrent ACs)
  lbThrottleTimer: NodeJS.Timeout | null;
  lbPending: boolean;
}

const rooms = new Map<string, ContestRoom>();

function getRoom(roundId: string): ContestRoom {
  let room = rooms.get(roundId);
  if (!room) {
    room = { firstSolved: new Map(), hydratedFirstSolve: false, hydratingFirstSolve: null, lbThrottleTimer: null, lbPending: false };
    rooms.set(roundId, room);
  }
  return room;
}

// Short promise-coalescing cache for the DSA leaderboard. computeContestLeaderboard is
// hit by the 1/sec broadcast AND every participant's REST poll AND the admin monitor — at
// the ~900-participant ceiling that is a burst of identical recompute+sort over N×M rows.
// A ~1s TTL collapses a burst (all concurrent pollers in the same second) into ONE DB
// computation, and caching the in-flight PROMISE (not just the value) prevents a stampede
// when the entry expires under load. Keyed by (roundId, limit) so the dominant
// participant traffic (limit 100) shares one entry. Bounded: cleared per round on
// finish/delete + lazy expiry. ≤1s staleness is invisible (the board updates on a 1s
// throttle anyway), and the post-submit broadcast bypasses the cache + RE-PRIMES it (see
// broadcastLeaderboardNow) so live pushes are always fresh.
const LEADERBOARD_CACHE_TTL_MS = 1000;
const leaderboardCache = new Map<string, { at: number; promise: Promise<ContestLeaderboardResult | null> }>();

function evictLeaderboardCache(roundId: string): void {
  const prefix = `${roundId}:`;
  for (const key of leaderboardCache.keys()) if (key.startsWith(prefix)) leaderboardCache.delete(key);
}

// Store a freshly-computed board so concurrent REST polls reuse it (called by the
// broadcast, which always computes fresh).
function primeLeaderboardCache(roundId: string, limit: number, value: ContestLeaderboardResult | null): void {
  leaderboardCache.set(`${roundId}:${limit}`, { at: Date.now(), promise: Promise.resolve(value) });
}

/** Drop the in-memory state for a round (on finish/lock/delete + shutdown). Bounded cleanup. */
export function evictContestRoom(roundId: string): void {
  const room = rooms.get(roundId);
  if (room?.lbThrottleTimer) clearTimeout(room.lbThrottleTimer);
  rooms.delete(roundId);
  evictLeaderboardCache(roundId);
}

export function clearAllContestRooms(): void {
  for (const room of rooms.values()) {
    if (room.lbThrottleTimer) clearTimeout(room.lbThrottleTimer);
  }
  rooms.clear();
  leaderboardCache.clear();
}

export interface ContestLeaderboardResult {
  roundType: string;
  status: string;
  startedMs: number | null;
  duration: number;
  penaltyModel: 'BEST_SCORE' | 'ICPC';
  leaderboardFreezeMinutes: number | null;
  /** userId → team (team events only) so callers can map a user to their team score. */
  teamByUser: Map<string, { teamId: string; teamName: string }> | null;
  results: DsaLeaderboardRow[];
}

// Single source of truth for the DSA leaderboard (live board, results, monitor, and the
// realtime broadcast all call this) — applies the round's team-aggregation for team
// events and per-user for solo. Returns [] results for non-DSA rounds.
//
// Cached read: coalesces concurrent callers within LEADERBOARD_CACHE_TTL_MS into one
// compute (see leaderboardCache). REST polls should use this; the live broadcast uses
// the uncached worker + re-primes so pushes are never stale.
export function computeContestLeaderboard(roundId: string, limit: number): Promise<ContestLeaderboardResult | null> {
  const key = `${roundId}:${limit}`;
  const now = Date.now();
  const cached = leaderboardCache.get(key);
  if (cached && now - cached.at < LEADERBOARD_CACHE_TTL_MS) return cached.promise;
  // Lazy bound: if the map has grown (rounds polled but never evicted), drop stale entries.
  if (leaderboardCache.size > 128) {
    for (const [k, v] of leaderboardCache) if (now - v.at >= LEADERBOARD_CACHE_TTL_MS) leaderboardCache.delete(k);
  }
  const promise = computeContestLeaderboardUncached(roundId, limit);
  leaderboardCache.set(key, { at: now, promise });
  // Never cache a rejection — drop the entry so the next caller retries.
  promise.catch(() => { if (leaderboardCache.get(key)?.promise === promise) leaderboardCache.delete(key); });
  return promise;
}

async function computeContestLeaderboardUncached(roundId: string, limit: number): Promise<ContestLeaderboardResult | null> {
  const round = await prisma.competitionRound.findUnique({
    where: { id: roundId },
    select: {
      id: true, eventId: true, roundType: true, status: true, startedAt: true, duration: true,
      penaltyModel: true, leaderboardFreezeMinutes: true, teamAggregation: true,
      event: { select: { teamRegistration: true } },
      problems: { orderBy: { displayOrder: 'asc' }, select: { problemId: true, points: true, problem: { select: { title: true } } } },
    },
  });
  if (!round) return null;
  const base = {
    status: round.status, startedMs: round.startedAt ? round.startedAt.getTime() : null,
    duration: round.duration, penaltyModel: round.penaltyModel, leaderboardFreezeMinutes: round.leaderboardFreezeMinutes,
  };
  if (round.roundType !== 'DSA') return { ...base, roundType: round.roundType, teamByUser: null, results: [] };

  // Project ONLY the columns buildDsaLeaderboard reads — never `code` (≤100KB/row),
  // `perTestVerdicts`/`compilerOutput` (JSON/Text blobs). This findMany spans N
  // participants × M problems and runs on every leaderboard poll, every throttled
  // broadcast, the admin monitor, /results, and the event-final; pulling the blobs
  // would balloon memory on the 512MB box during a busy contest (e.g. 300×5 rows ×
  // 100KB ≈ 150MB per call). Served by @@index([contextType, contextKey]).
  const submissions = await prisma.problemSubmission.findMany({
    where: { contextType: 'CONTEST', contextKey: round.id },
    select: {
      problemId: true, userId: true, score: true, verdict: true, runtimeMs: true,
      contestWrongAttempts: true, contestSolvedAt: true,
      user: { select: { id: true, name: true, avatar: true } },
    },
  });

  let teamByUser: Map<string, { teamId: string; teamName: string }> | null = null;
  let teamOptions: TeamLeaderboardOptions | undefined;
  if (round.event.teamRegistration) {
    const members = await prisma.eventTeamMember.findMany({
      where: { team: { eventId: round.eventId } },
      select: { userId: true, team: { select: { id: true, teamName: true } } },
    });
    teamByUser = new Map(members.map((m) => [m.userId, { teamId: m.team.id, teamName: m.team.teamName }]));
    teamOptions = { aggregation: round.teamAggregation, teamByUser };
  }

  const results = buildDsaLeaderboard(round.problems, submissions, base.startedMs, round.penaltyModel, limit, teamOptions);
  return { ...base, roundType: 'DSA', teamByUser, results };
}

/** True when participants should see a frozen (hidden) board right now. */
export function isLeaderboardFrozen(lb: { status: string; startedMs: number | null; duration: number; leaderboardFreezeMinutes: number | null }): boolean {
  const remaining = lb.startedMs !== null ? Math.max(0, lb.duration - Math.floor((Date.now() - lb.startedMs) / 1000)) : null;
  const freezeSec = (lb.leaderboardFreezeMinutes ?? 0) * 60;
  return lb.status === 'ACTIVE' && freezeSec > 0 && remaining !== null && remaining <= freezeSec;
}

async function broadcastLeaderboardNow(roundId: string): Promise<void> {
  try {
    // Compute FRESH (bypass the read cache): this fires right after a submit/rejudge
    // persisted, so a cache primed by a poll a few ms earlier would miss the new row.
    // Re-prime the cache with this fresh board so concurrent REST polls reuse it.
    const lb = await computeContestLeaderboardUncached(roundId, 100);
    primeLeaderboardCache(roundId, 100, lb);
    if (!lb || lb.roundType !== 'DSA') return;
    // Admins always see the live board; participants get a full freeze in the final N min.
    relayEmit(roomAdmin(roundId), 'contest:leaderboard', { frozen: false, penaltyModel: lb.penaltyModel, results: lb.results });
    const frozen = isLeaderboardFrozen(lb);
    relayEmit(
      roomAll(roundId),
      'contest:leaderboard',
      frozen ? { frozen: true, penaltyModel: lb.penaltyModel, results: [] } : { frozen: false, penaltyModel: lb.penaltyModel, results: lb.results },
    );
  } catch (error) {
    logger.error('Failed to broadcast contest leaderboard', { roundId, error: error instanceof Error ? error.message : String(error) });
  }
}

// Throttled to at most once per second per round (a burst of submits coalesces into one
// recompute+broadcast), mirroring the quiz answer-count throttle.
function scheduleLeaderboardBroadcast(roundId: string): void {
  const room = getRoom(roundId);
  if (room.lbThrottleTimer) { room.lbPending = true; return; }
  void broadcastLeaderboardNow(roundId);
  room.lbThrottleTimer = setTimeout(() => {
    room.lbThrottleTimer = null;
    if (room.lbPending) { room.lbPending = false; scheduleLeaderboardBroadcast(roundId); }
  }, 1000);
}

// Hydrate the first-solve map exactly once per room, coalescing concurrent first ACs onto
// one in-flight query. Setting hydratedFirstSolve BEFORE awaiting (the old code) let two
// simultaneous ACs both skip hydration and read a not-yet-populated map → a duplicate
// first-solve balloon. Now the second AC awaits the same promise and sees the populated map.
async function ensureFirstSolvedHydrated(roundId: string, room: ContestRoom): Promise<void> {
  if (room.hydratedFirstSolve) return;
  if (!room.hydratingFirstSolve) {
    room.hydratingFirstSolve = (async () => {
      const accepted = await prisma.problemSubmission.findMany({
        where: { contextType: 'CONTEST', contextKey: roundId, verdict: 'ACCEPTED' },
        select: { problemId: true, userId: true, contestSolvedAt: true, user: { select: { name: true } } },
        orderBy: { contestSolvedAt: 'asc' },
      });
      for (const a of accepted) {
        if (!room.firstSolved.has(a.problemId)) room.firstSolved.set(a.problemId, { userId: a.userId, userName: a.user.name });
      }
      room.hydratedFirstSolve = true;
    })().finally(() => { room.hydratingFirstSolve = null; });
  }
  await room.hydratingFirstSolve;
}

/** Called (best-effort) after a CONTEST submit is judged + persisted. */
export async function onContestSubmission(args: {
  roundId: string; userId: string; userName: string; problemId: string; verdict: string; score: number;
}): Promise<void> {
  try {
    relayEmit(roomAdmin(args.roundId), 'contest:submission', {
      userName: args.userName, problemId: args.problemId, verdict: args.verdict, score: args.score, at: Date.now(),
    });

    if (args.verdict === 'ACCEPTED') {
      const room = getRoom(args.roundId);
      await ensureFirstSolvedHydrated(args.roundId, room);
      if (!room.firstSolved.has(args.problemId)) {
        room.firstSolved.set(args.problemId, { userId: args.userId, userName: args.userName });
        const payload = { problemId: args.problemId, userName: args.userName };
        relayEmit(roomAll(args.roundId), 'contest:firstSolve', payload);
        relayEmit(roomAdmin(args.roundId), 'contest:firstSolve', payload);
      }
    }
    scheduleLeaderboardBroadcast(args.roundId);
  } catch (error) {
    logger.error('Failed to push contest submission', { roundId: args.roundId, error: error instanceof Error ? error.message : String(error) });
  }
}

export function emitClarification(roundId: string, clar: { id: string; message: string; createdAt: string }): void {
  relayEmit(roomAll(roundId), 'contest:clarification', clar);
  relayEmit(roomAdmin(roundId), 'contest:clarification', clar);
}

// Round-status push (lobby → synced start, lock, finish). Evicts the in-memory room once
// the round is no longer live so state never accumulates.
export function emitRoundStatus(roundId: string, status: string): void {
  relayEmit(roomAll(roundId), 'contest:status', { status });
  relayEmit(roomAdmin(roundId), 'contest:status', { status });
  if (status === 'FINISHED' || status === 'DRAFT') evictContestRoom(roundId);
}

// Round-config change (e.g. admin extends time) → clients refetch the round so the
// countdown + duration update live, without a status change.
export function emitRoundUpdate(roundId: string): void {
  relayEmit(roomAll(roundId), 'contest:round', {});
  relayEmit(roomAdmin(roundId), 'contest:round', {});
}

/** Recompute + push the leaderboard now (used after an admin rejudge). */
export function broadcastLeaderboard(roundId: string): void {
  void scheduleLeaderboardBroadcast(roundId);
}

export function emitProctor(roundId: string, userId: string, locked: boolean, lockReason: string | null): void {
  relayEmit(roomUser(roundId, userId), 'contest:proctor', { locked, lockReason });
  relayEmit(roomAdmin(roundId), 'contest:participant', { userId, locked });
}

export function emitViolation(
  roundId: string,
  userId: string,
  userName: string,
  kind: string,
  violationCount: number,
  detail: string | null = null,
): void {
  // userName + detail make the admin live-log row self-sufficient (renders a human-readable
  // label without a name lookup) — the relay is a dumb fan-out, so the payload carries it all.
  relayEmit(roomAdmin(roundId), 'contest:violation', { userId, userName, kind, detail, violationCount, at: Date.now() });
}
