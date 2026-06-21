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
import { getIO } from '../utils/socket.js';
import { logger } from '../utils/logger.js';
import { buildDsaLeaderboard, type DsaLeaderboardRow, type TeamLeaderboardOptions } from '../utils/contestScoring.js';

export const COMPETITION_NS = '/competition';
export const roomAll = (roundId: string) => `round:${roundId}`;
export const roomAdmin = (roundId: string) => `round:${roundId}:admin`;
export const roomUser = (roundId: string, userId: string) => `round:${roundId}:user:${userId}`;

interface ContestRoom {
  firstSolved: Map<string, { userId: string; userName: string }>; // problemId → first AC
  hydratedFirstSolve: boolean;
  lbThrottleTimer: NodeJS.Timeout | null;
  lbPending: boolean;
}

const rooms = new Map<string, ContestRoom>();

function getRoom(roundId: string): ContestRoom {
  let room = rooms.get(roundId);
  if (!room) {
    room = { firstSolved: new Map(), hydratedFirstSolve: false, lbThrottleTimer: null, lbPending: false };
    rooms.set(roundId, room);
  }
  return room;
}

/** Drop the in-memory state for a round (on finish/lock/delete + shutdown). Bounded cleanup. */
export function evictContestRoom(roundId: string): void {
  const room = rooms.get(roundId);
  if (room?.lbThrottleTimer) clearTimeout(room.lbThrottleTimer);
  rooms.delete(roundId);
}

export function clearAllContestRooms(): void {
  for (const room of rooms.values()) {
    if (room.lbThrottleTimer) clearTimeout(room.lbThrottleTimer);
  }
  rooms.clear();
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
export async function computeContestLeaderboard(roundId: string, limit: number): Promise<ContestLeaderboardResult | null> {
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

  const submissions = await prisma.problemSubmission.findMany({
    where: { contextType: 'CONTEST', contextKey: round.id },
    include: { user: { select: { id: true, name: true, avatar: true } } },
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
  const io = getIO();
  if (!io) return;
  try {
    const lb = await computeContestLeaderboard(roundId, 100);
    if (!lb || lb.roundType !== 'DSA') return;
    // Admins always see the live board; participants get a full freeze in the final N min.
    io.of(COMPETITION_NS).to(roomAdmin(roundId)).emit('contest:leaderboard', { frozen: false, penaltyModel: lb.penaltyModel, results: lb.results });
    const frozen = isLeaderboardFrozen(lb);
    io.of(COMPETITION_NS).to(roomAll(roundId)).emit(
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

async function hydrateFirstSolved(roundId: string, room: ContestRoom): Promise<void> {
  room.hydratedFirstSolve = true;
  const accepted = await prisma.problemSubmission.findMany({
    where: { contextType: 'CONTEST', contextKey: roundId, verdict: 'ACCEPTED' },
    select: { problemId: true, userId: true, contestSolvedAt: true, user: { select: { name: true } } },
    orderBy: { contestSolvedAt: 'asc' },
  });
  for (const a of accepted) {
    if (!room.firstSolved.has(a.problemId)) room.firstSolved.set(a.problemId, { userId: a.userId, userName: a.user.name });
  }
}

/** Called (best-effort) after a CONTEST submit is judged + persisted. */
export async function onContestSubmission(args: {
  roundId: string; userId: string; userName: string; problemId: string; verdict: string; score: number;
}): Promise<void> {
  const io = getIO();
  if (!io) return;
  try {
    io.of(COMPETITION_NS).to(roomAdmin(args.roundId)).emit('contest:submission', {
      userName: args.userName, problemId: args.problemId, verdict: args.verdict, score: args.score, at: Date.now(),
    });

    if (args.verdict === 'ACCEPTED') {
      const room = getRoom(args.roundId);
      if (!room.hydratedFirstSolve) await hydrateFirstSolved(args.roundId, room);
      if (!room.firstSolved.has(args.problemId)) {
        room.firstSolved.set(args.problemId, { userId: args.userId, userName: args.userName });
        const payload = { problemId: args.problemId, userName: args.userName };
        io.of(COMPETITION_NS).to(roomAll(args.roundId)).emit('contest:firstSolve', payload);
        io.of(COMPETITION_NS).to(roomAdmin(args.roundId)).emit('contest:firstSolve', payload);
      }
    }
    scheduleLeaderboardBroadcast(args.roundId);
  } catch (error) {
    logger.error('Failed to push contest submission', { roundId: args.roundId, error: error instanceof Error ? error.message : String(error) });
  }
}

export function emitClarification(roundId: string, clar: { id: string; message: string; createdAt: string }): void {
  const io = getIO();
  if (!io) return;
  io.of(COMPETITION_NS).to(roomAll(roundId)).emit('contest:clarification', clar);
  io.of(COMPETITION_NS).to(roomAdmin(roundId)).emit('contest:clarification', clar);
}

// Round-status push (lobby → synced start, lock, finish). Evicts the in-memory room once
// the round is no longer live so state never accumulates.
export function emitRoundStatus(roundId: string, status: string): void {
  const io = getIO();
  if (io) {
    io.of(COMPETITION_NS).to(roomAll(roundId)).emit('contest:status', { status });
    io.of(COMPETITION_NS).to(roomAdmin(roundId)).emit('contest:status', { status });
  }
  if (status === 'FINISHED' || status === 'DRAFT') evictContestRoom(roundId);
}

// Round-config change (e.g. admin extends time) → clients refetch the round so the
// countdown + duration update live, without a status change.
export function emitRoundUpdate(roundId: string): void {
  const io = getIO();
  if (!io) return;
  io.of(COMPETITION_NS).to(roomAll(roundId)).emit('contest:round', {});
  io.of(COMPETITION_NS).to(roomAdmin(roundId)).emit('contest:round', {});
}

/** Recompute + push the leaderboard now (used after an admin rejudge). */
export function broadcastLeaderboard(roundId: string): void {
  void scheduleLeaderboardBroadcast(roundId);
}

export function emitProctor(roundId: string, userId: string, locked: boolean, lockReason: string | null): void {
  const io = getIO();
  if (!io) return;
  io.of(COMPETITION_NS).to(roomUser(roundId, userId)).emit('contest:proctor', { locked, lockReason });
  io.of(COMPETITION_NS).to(roomAdmin(roundId)).emit('contest:participant', { userId, locked });
}

export function emitViolation(roundId: string, userId: string, kind: string, violationCount: number): void {
  const io = getIO();
  if (!io) return;
  io.of(COMPETITION_NS).to(roomAdmin(roundId)).emit('contest:violation', { userId, kind, violationCount, at: Date.now() });
}
