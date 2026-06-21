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
import { buildDsaLeaderboard } from '../utils/contestScoring.js';

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

async function broadcastLeaderboardNow(roundId: string): Promise<void> {
  const io = getIO();
  if (!io) return;
  try {
    const round = await prisma.competitionRound.findUnique({
      where: { id: roundId },
      select: {
        id: true, roundType: true, status: true, startedAt: true, duration: true,
        penaltyModel: true, leaderboardFreezeMinutes: true,
        problems: { orderBy: { displayOrder: 'asc' }, select: { problemId: true, points: true, problem: { select: { title: true } } } },
      },
    });
    if (!round || round.roundType !== 'DSA') return;
    const submissions = await prisma.problemSubmission.findMany({
      where: { contextType: 'CONTEST', contextKey: round.id },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });
    const results = buildDsaLeaderboard(round.problems, submissions, round.startedAt ? round.startedAt.getTime() : null, round.penaltyModel, 100);

    // Admins always see the live board.
    io.of(COMPETITION_NS).to(roomAdmin(roundId)).emit('contest:leaderboard', { frozen: false, penaltyModel: round.penaltyModel, results });

    // Participants get a full freeze in the final N minutes.
    const remaining = round.startedAt ? Math.max(0, round.duration - Math.floor((Date.now() - round.startedAt.getTime()) / 1000)) : null;
    const freezeSec = (round.leaderboardFreezeMinutes ?? 0) * 60;
    const frozen = round.status === 'ACTIVE' && freezeSec > 0 && remaining !== null && remaining <= freezeSec;
    io.of(COMPETITION_NS).to(roomAll(roundId)).emit(
      'contest:leaderboard',
      frozen ? { frozen: true, penaltyModel: round.penaltyModel, results: [] } : { frozen: false, penaltyModel: round.penaltyModel, results },
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
