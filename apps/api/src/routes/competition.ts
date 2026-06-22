import { Router, Response } from 'express';
import type { Request } from '../lib/http.js';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma, withRetry } from '../lib/prisma.js';
import { authMiddleware, optionalAuthMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole, hasPermission } from '../middleware/role.js';
import { ApiResponse, ErrorCodes } from '../utils/response.js';
import { sanitizeText } from '../utils/sanitize.js';
import { auditLog } from '../utils/audit.js';
import { logger } from '../utils/logger.js';
import { getCachedSettings } from '../utils/settingsCache.js';
import { uuidParamGuard } from '../utils/idParams.js';
import { computeRanksFromScores } from '../utils/competitionRanks.js';
import { normalizeWeights } from '../utils/contestScoring.js';
import { incActiveRounds, decActiveRounds, setActiveRoundCount } from '../competition/contestMode.js';
import { emitRoundStatus, emitClarification, emitProctor, emitViolation, evictContestRoom, computeContestLeaderboard, isLeaderboardFrozen, emitRoundUpdate, broadcastLeaderboard } from '../competition/competitionRealtime.js';
import { enqueueRejudgeJob } from '../utils/rejudgeJobs.js';
import { getInternalApiSecret, getPlaygroundRelayBase } from '../utils/internalApi.js';
import { getProblemTests } from '../utils/problemsCore.js';
import { findPlagiarismPairs, type PlagiarismInput, type PlagiarismPair } from '../competition/plagiarism.js';

const competitionRouter = Router();
const activeTimers = new Map<string, NodeJS.Timeout>();

// Reject malformed ids before they hit Prisma — every competition path param
// is a uuid PK. Mirrors the router.param guards in users.ts / quizRouter.ts.
competitionRouter.param('roundId', uuidParamGuard('round ID'));
competitionRouter.param('eventId', uuidParamGuard('event ID'));
competitionRouter.param('submissionId', uuidParamGuard('submission ID'));
competitionRouter.param('userId', uuidParamGuard('user ID'));
competitionRouter.param('flagId', uuidParamGuard('flag ID'));

// Instant-lock violation kinds. A reflexive Ctrl-V/-C or an OS/trackpad-driven fullscreen
// exit fires these with no prior on-screen grace (unlike tab-away, which only trips after
// AWAY_LOCK_MS continuously hidden — a deliberate departure). Locking on the very first one
// would catch a genuinely reflexive slip, so a single warning is allowed: the first instant
// violation warns, the next locks. Every violation is still logged + counted (the schema's
// violationCount); only the lock decision is softened. Tab-away still locks on its first
// trip. (Copy / cut / paste all map to COPY_PASTE; dev-tools / print / right-click report
// as OTHER and are logged-but-not-auto-locked — see the proctor/violation handler.)
const INSTANT_VIOLATION_KINDS = ['COPY_PASTE', 'FULLSCREEN_EXIT'] as const;
const INSTANT_VIOLATION_BUDGET = 1; // 1 warning, then the next instant violation locks
const isInstantViolation = (kind: string): boolean => (INSTANT_VIOLATION_KINDS as readonly string[]).includes(kind);

// Feature gate: the `competitionEnabled` setting hides the UI but, prior to
// this gate, the API still served reads, saves, submits and admin actions.
// Mirror the problemsRouter pattern: admins always have access (so they can
// configure the feature with the flag still off), everyone else gets a 404.
competitionRouter.use(optionalAuthMiddleware);
competitionRouter.use(async (req, res, next) => {
  try {
    const user = getAuthUser(req);
    if (user && hasPermission(user.role, 'ADMIN')) return next();
    const settings = await getCachedSettings();
    if (settings?.competitionEnabled !== true) {
      return ApiResponse.notFound(res, 'Competition is not available');
    }
    return next();
  } catch {
    return next();
  }
});

const MAX_CODE_BYTES = 100_000;
const saveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = getAuthUser(req)?.id;
    return userId ? `competition-save:${userId}` : `competition-save:ip:${req.ip || 'unknown'}`;
  },
  message: { success: false, error: { message: 'Too many save requests. Please wait a few seconds.' } },
});

const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = getAuthUser(req)?.id;
    return userId ? `competition-submit:${userId}` : `competition-submit:ip:${req.ip || 'unknown'}`;
  },
  message: { success: false, error: { message: 'Too many submit attempts. Please wait.' } },
});

// Contest-config fields shared by create + update (Phase B). finalWeight is the round's
// raw weight in the event-final aggregation; difficultyWeights are optional EASY/MED/HARD
// presets the admin UI uses to seed per-problem weights (the raw weight still lives on
// each problem's `points`).
const contestConfigShape = {
  finalWeight: z.number().min(0).max(1000).optional(),
  proctored: z.boolean().optional(),
  penaltyModel: z.enum(['BEST_SCORE', 'ICPC']).optional(),
  teamAggregation: z.enum(['BEST_PER_PROBLEM', 'AVERAGE', 'BEST_MEMBER']).optional(),
  leaderboardFreezeMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  difficultyWeights: z.object({
    EASY: z.number().min(0).max(1000),
    MEDIUM: z.number().min(0).max(1000),
    HARD: z.number().min(0).max(1000),
  }).partial().nullable().optional(),
};

const createRoundSchema = z.object({
  eventId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  duration: z.number().int().min(300).max(7200),
  roundType: z.enum(['IMAGE_TARGET', 'DSA']).optional(),
  participantScope: z.enum(['ALL', 'SELECTED_TEAMS']).optional(),
  leadersOnly: z.boolean().optional(),
  allowedTeamIds: z.array(z.string().uuid()).max(500).optional(),
  targetImageUrl: z.string().url().optional(),
  problemIds: z.array(z.string().uuid()).max(50).optional(),
  problems: z.array(z.object({
    problemId: z.string().uuid(),
    points: z.number().int().min(1).max(1000).optional(),
    displayOrder: z.number().int().min(0).optional(),
  })).max(50).optional(),
  ...contestConfigShape,
});

const updateRoundSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  duration: z.number().int().min(300).max(7200).optional(),
  roundType: z.enum(['IMAGE_TARGET', 'DSA']).optional(),
  participantScope: z.enum(['ALL', 'SELECTED_TEAMS']).optional(),
  leadersOnly: z.boolean().optional(),
  allowedTeamIds: z.array(z.string().uuid()).max(500).optional(),
  targetImageUrl: z.string().url().nullable().optional(),
  problemIds: z.array(z.string().uuid()).max(50).optional(),
  problems: z.array(z.object({
    problemId: z.string().uuid(),
    points: z.number().int().min(1).max(1000).optional(),
    displayOrder: z.number().int().min(0).optional(),
  })).max(50).optional(),
  ...contestConfigShape,
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required',
});

const saveSchema = z.object({
  code: z.string().max(MAX_CODE_BYTES),
});

const submitSchema = z.object({
  code: z.string().max(MAX_CODE_BYTES),
});

const scoreSchema = z.object({
  score: z.number().min(0).max(100).optional(),
  rank: z.number().int().min(1).optional(),
  adminNotes: z.string().max(2000).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required',
});

function computeRemainingSeconds(round: { duration: number; startedAt: Date | null }, nowMs: number): number | null {
  if (!round.startedAt) return null;
  const elapsedSeconds = (nowMs - round.startedAt.getTime()) / 1000;
  return Math.max(0, Math.floor(round.duration - elapsedSeconds));
}

async function getEventAccess(eventId: string, userId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, createdBy: true, title: true, teamRegistration: true },
  });
  if (!event) return null;
  return {
    ...event,
    isOwner: event.createdBy === userId,
  };
}

function normalizeTeamIds(teamIds?: string[]): string[] {
  if (!Array.isArray(teamIds) || teamIds.length === 0) return [];
  return Array.from(new Set(teamIds));
}

function normalizeRoundProblems(input: {
  problemIds?: string[];
  problems?: Array<{ problemId: string; points?: number; displayOrder?: number }>;
}): Array<{ problemId: string; points: number; displayOrder: number }> {
  const raw = input.problems?.length
    ? input.problems
    : (input.problemIds || []).map((problemId, index) => ({ problemId, displayOrder: index, points: 100 }));

  const seen = new Set<string>();
  return raw
    .filter((item) => {
      if (seen.has(item.problemId)) return false;
      seen.add(item.problemId);
      return true;
    })
    .map((item, index) => ({
      problemId: item.problemId,
      points: item.points ?? 100,
      displayOrder: item.displayOrder ?? index,
    }));
}

async function getMyTeamInEvent(eventId: string, userId: string) {
  const membership = await prisma.eventTeamMember.findFirst({
    where: {
      userId,
      team: { eventId },
    },
    select: {
      team: {
        select: {
          id: true,
          teamName: true,
          leaderId: true,
          members: { select: { id: true } },
        },
      },
    },
  });
  if (!membership) return null;
  return {
    id: membership.team.id,
    teamName: membership.team.teamName,
    memberCount: membership.team.members.length,
    leaderId: membership.team.leaderId,
    isLeader: membership.team.leaderId === userId,
  };
}

async function ensureRegisteredForRound(roundId: string, userId: string) {
  const round = await prisma.competitionRound.findUnique({
    where: { id: roundId },
    select: {
      id: true,
      eventId: true,
      title: true,
      description: true,
      duration: true,
      status: true,
      roundType: true,
      startedAt: true,
      lockedAt: true,
      createdAt: true,
      updatedAt: true,
      targetImageUrl: true,
      participantScope: true,
      leadersOnly: true,
      allowedTeamIds: true,
      proctored: true,
      penaltyModel: true,
      leaderboardFreezeMinutes: true,
      finalWeight: true,
      problems: {
        orderBy: { displayOrder: 'asc' },
        include: {
          problem: {
            select: {
              id: true,
              slug: true,
              title: true,
              difficulty: true,
              allowedLanguages: true,
              isPublished: true,
            },
          },
        },
      },
      event: {
        select: {
          teamRegistration: true,
        },
      },
    },
  });

  if (!round) {
    throw { status: 404, code: ErrorCodes.NOT_FOUND, message: 'Competition round not found' };
  }

  const registration = await prisma.eventRegistration.findUnique({
    where: {
      userId_eventId: {
        userId,
        eventId: round.eventId,
      },
    },
    select: { id: true },
  });

  if (!registration) {
    throw {
      status: 403,
      code: ErrorCodes.FORBIDDEN,
      message: 'You must register for this event to participate.',
    };
  }

  return round;
}

function getRoundParticipationError(
  round: Awaited<ReturnType<typeof ensureRegisteredForRound>>,
  myTeam: Awaited<ReturnType<typeof getMyTeamInEvent>>,
): string | null {
  if (!round.event.teamRegistration) return null;
  if (!myTeam) return 'You must join a team for this competition event.';
  if (round.participantScope === 'SELECTED_TEAMS' && !round.allowedTeamIds.includes(myTeam.id)) {
    return 'Your team is not selected for this round.';
  }
  if (round.leadersOnly && !myTeam.isLeader) {
    return 'Only the team leader can access this round.';
  }
  return null;
}

async function autoLockRound(roundId: string): Promise<boolean> {
  try {
    // Returns whether THIS call performed the ACTIVE→LOCKED transition (false on a race
    // where another path already locked it) so we decrement the priority counter exactly
    // once per real transition.
    const didLock = await prisma.$transaction(async (tx) => {
      const round = await tx.competitionRound.findUnique({
        where: { id: roundId },
        select: { id: true, status: true, participantScope: true, leadersOnly: true, allowedTeamIds: true },
      });
      if (!round || round.status !== 'ACTIVE') return false;

      await tx.competitionRound.update({
        where: { id: roundId },
        data: { status: 'LOCKED', lockedAt: new Date() },
      });

      const autoSaves = await tx.competitionAutoSave.findMany({
        where: { roundId },
        orderBy: { savedAt: 'desc' },
      });

      if (autoSaves.length > 0) {
        const userIds = autoSaves.map((item) => item.userId);
        const teamIds = autoSaves
          .map((item) => item.teamId)
          .filter((id): id is string => Boolean(id));
        const uniqueTeamIds = Array.from(new Set(teamIds));

        const [existingByUser, existingByTeam, leadersByTeam] = await Promise.all([
          tx.competitionSubmission.findMany({
            where: {
              roundId,
              userId: { in: userIds },
            },
            select: { userId: true },
          }),
          teamIds.length > 0
            ? tx.competitionSubmission.findMany({
                where: {
                  roundId,
                  teamId: { in: teamIds },
                },
                select: { teamId: true },
              })
            : Promise.resolve([] as Array<{ teamId: string | null }>),
          round.leadersOnly && uniqueTeamIds.length > 0
            ? tx.eventTeam.findMany({
                where: { id: { in: uniqueTeamIds } },
                select: { id: true, leaderId: true },
              })
            : Promise.resolve([] as Array<{ id: string; leaderId: string }>),
        ]);

        const existingUserSet = new Set(existingByUser.map((item) => item.userId));
        const existingTeamSet = new Set(
          existingByTeam
            .map((item) => item.teamId)
            .filter((teamId): teamId is string => Boolean(teamId)),
        );
        const leaderByTeamId = new Map(leadersByTeam.map((team) => [team.id, team.leaderId]));
        const seenTeamSet = new Set<string>();
        const createOps: Prisma.PrismaPromise<unknown>[] = [];

        for (const save of autoSaves) {
          if (round.participantScope === 'SELECTED_TEAMS') {
            if (!save.teamId || !round.allowedTeamIds.includes(save.teamId)) continue;
          }
          if (round.leadersOnly) {
            if (!save.teamId || leaderByTeamId.get(save.teamId) !== save.userId) continue;
          }
          if (existingUserSet.has(save.userId)) continue;

          if (save.teamId) {
            if (existingTeamSet.has(save.teamId) || seenTeamSet.has(save.teamId)) {
              continue;
            }
            seenTeamSet.add(save.teamId);
          }

          createOps.push(
            tx.competitionSubmission.create({
              data: {
                roundId,
                teamId: save.teamId,
                userId: save.userId,
                code: save.code,
                isAutoSubmit: true,
              },
            }),
          );
        }

        if (createOps.length > 0) await Promise.all(createOps);
      }

      await tx.competitionAutoSave.deleteMany({ where: { roundId } });
      return true;
    });

    const timer = activeTimers.get(roundId);
    if (timer) clearTimeout(timer);
    activeTimers.delete(roundId);

    // ACTIVE → LOCKED: leave contest priority mode + push the status so arenas flip to
    // the read-only/locked view without a reload. Only on a real transition (not a race
    // where another path already locked it).
    if (didLock) {
      decActiveRounds();
      emitRoundStatus(roundId, 'LOCKED');
    }

    logger.info('Competition round auto-locked', { roundId, didLock });
    return true;
  } catch (error) {
    logger.error('Failed to auto-lock competition round', {
      roundId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function scheduleRoundLock(roundId: string, durationSeconds: number): void {
  const existing = activeTimers.get(roundId);
  if (existing) clearTimeout(existing);
  const timeout = setTimeout(async () => {
    // Always release the map slot even if autoLockRound throws or rejects.
    // autoLockRound's own success path also clears the entry; the redundant
    // delete is a safe no-op on a missing key.
    try {
      await autoLockRound(roundId);
    } finally {
      activeTimers.delete(roundId);
    }
  }, durationSeconds * 1000);
  activeTimers.set(roundId, timeout);
}

export async function recoverActiveRounds(): Promise<void> {
  const rounds = await prisma.competitionRound.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, startedAt: true, duration: true },
  });

  const nowMs = Date.now();
  for (const round of rounds) {
    if (!round.startedAt) continue;
    const remaining = computeRemainingSeconds(round, nowMs);
    if (remaining === null || remaining <= 0) {
      await autoLockRound(round.id);
      continue;
    }
    scheduleRoundLock(round.id, remaining);
    logger.info('Recovered competition timer', { roundId: round.id, remainingSeconds: remaining });
  }

  // Seed the contest-priority counter to the rounds still ACTIVE after recovery (some
  // expired ones were just auto-locked above). Absolute set, so it's correct regardless
  // of the dec() calls autoLockRound made during the loop.
  setActiveRoundCount(await prisma.competitionRound.count({ where: { status: 'ACTIVE' } }));
}

// Standard competition ranking (1224) from scores: highest score = rank 1, equal
// scores share a rank, earlier submission sorts first for display. Single source of
// truth for both the finish (initial publish) path AND re-scoring an already-FINISHED
// round — without the latter, a corrected score would leave `rank` stale (results +
// exports read `rank`, so a stale rank silently misorders the podium).
async function recomputeRoundRanks(
  tx: Prisma.TransactionClient,
  roundId: string,
): Promise<number> {
  const submissions = await tx.competitionSubmission.findMany({
    where: { roundId },
    select: { id: true, score: true },
    orderBy: [
      // `score` is nullable; Postgres sorts NULLs FIRST on DESC, which would rank an
      // unscored row #1. `nulls: 'last'` keeps any unscored row at the bottom. (Finish
      // already guards all-scored, and a FINISHED re-score never reintroduces a null —
      // this just makes the query own the ordering the unit test documents.)
      { score: { sort: 'desc', nulls: 'last' } },
      { submittedAt: 'asc' },
    ],
  });
  if (submissions.length === 0) return 0;

  // Pure 1224 ranking lives in utils (unit-tested); this layer owns the query + write.
  const ranked = computeRanksFromScores(submissions);
  const ids = ranked.map((row) => row.id);
  const ranks = ranked.map((row) => row.rank);

  // One set-based UPDATE zips ids[]↔ranks[] via unnest (mirrors the raise-cap
  // optimization) instead of N per-row updates inside the txn. `rank` has no @map;
  // updated_at (@updatedAt) has no DB default, so raw SQL supplies it.
  await tx.$executeRaw`
    UPDATE competition_submissions AS cs
    SET rank = v.rank, updated_at = now()
    FROM unnest(${ids}::text[], ${ranks}::int[]) AS v(id, rank)
    WHERE cs.id = v.id;
  `;
  return submissions.length;
}

competitionRouter.post('/', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req)!;
    const parsed = createRoundSchema.safeParse(req.body);
    if (!parsed.success) {
      return ApiResponse.error(res, {
        code: ErrorCodes.VALIDATION_ERROR,
        message: parsed.error.errors[0]?.message || 'Invalid payload',
        status: 400,
      });
    }

    const event = await getEventAccess(parsed.data.eventId, admin.id);
    if (!event) {
      return ApiResponse.notFound(res, 'Event not found');
    }

    const requestedScope = parsed.data.participantScope || 'ALL';
    const leadersOnly = event.teamRegistration ? Boolean(parsed.data.leadersOnly) : false;
    let allowedTeamIds = normalizeTeamIds(parsed.data.allowedTeamIds);
    if (!event.teamRegistration && requestedScope === 'SELECTED_TEAMS') {
      return ApiResponse.badRequest(res, 'Selected teams mode is only available for team events.');
    }
    if (!event.teamRegistration && parsed.data.leadersOnly) {
      return ApiResponse.badRequest(res, 'Leader-only mode is only available for team events.');
    }
    if (requestedScope === 'SELECTED_TEAMS') {
      if (allowedTeamIds.length === 0) {
        return ApiResponse.badRequest(res, 'Select at least one team for selected teams mode.');
      }
      const teams = await prisma.eventTeam.findMany({
        where: {
          eventId: event.id,
          id: { in: allowedTeamIds },
        },
        select: { id: true },
      });
      if (teams.length !== allowedTeamIds.length) {
        return ApiResponse.badRequest(res, 'One or more selected teams are invalid for this event.');
      }
    } else {
      allowedTeamIds = [];
    }

    const roundType = parsed.data.roundType || 'IMAGE_TARGET';
    const linkedProblems = normalizeRoundProblems(parsed.data);
    if (roundType === 'DSA') {
      if (linkedProblems.length === 0) {
        return ApiResponse.badRequest(res, 'Select at least one problem for a DSA round.');
      }
      const existingProblems = await prisma.problem.findMany({
        where: { id: { in: linkedProblems.map((item) => item.problemId) } },
        select: { id: true },
      });
      if (existingProblems.length !== linkedProblems.length) {
        return ApiResponse.badRequest(res, 'One or more selected problems do not exist.');
      }
    }

    const round = await withRetry(() => prisma.competitionRound.create({
      data: {
        eventId: parsed.data.eventId,
        title: sanitizeText(parsed.data.title).trim(),
        description: parsed.data.description ? sanitizeText(parsed.data.description).trim() : null,
        duration: parsed.data.duration,
        roundType,
        participantScope: requestedScope,
        leadersOnly,
        allowedTeamIds,
        targetImageUrl: roundType === 'DSA' ? null : (parsed.data.targetImageUrl || null),
        status: 'DRAFT',
        ...(parsed.data.finalWeight !== undefined ? { finalWeight: parsed.data.finalWeight } : {}),
        ...(parsed.data.proctored !== undefined ? { proctored: parsed.data.proctored } : {}),
        ...(parsed.data.penaltyModel !== undefined ? { penaltyModel: parsed.data.penaltyModel } : {}),
        ...(parsed.data.teamAggregation !== undefined ? { teamAggregation: parsed.data.teamAggregation } : {}),
        ...(parsed.data.leaderboardFreezeMinutes !== undefined ? { leaderboardFreezeMinutes: parsed.data.leaderboardFreezeMinutes } : {}),
        ...(parsed.data.difficultyWeights !== undefined ? { difficultyWeights: parsed.data.difficultyWeights ?? Prisma.DbNull } : {}),
        ...(roundType === 'DSA' ? {
          problems: {
            create: linkedProblems.map((item) => ({
              problemId: item.problemId,
              points: item.points,
              displayOrder: item.displayOrder,
            })),
          },
        } : {}),
      },
      include: {
        problems: { include: { problem: true }, orderBy: { displayOrder: 'asc' } },
      },
    }));

    await auditLog(admin.id, 'COMPETITION_ROUND_CREATED', 'CompetitionRound', round.id, {
      eventId: round.eventId,
      title: round.title,
    });

    return ApiResponse.created(res, { round });
  } catch (error) {
    logger.error('Failed to create competition round', {
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to create competition round');
  }
});

competitionRouter.get('/event/:eventId', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const { eventId } = req.params;
    const canViewTeamSelection = user ? hasPermission(user.role, 'ADMIN') : false;
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, teamRegistration: true },
    });
    if (!event) return ApiResponse.notFound(res, 'Event not found');

    const rounds = await withRetry(() => prisma.competitionRound.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { submissions: true } },
        problems: {
          orderBy: { displayOrder: 'asc' },
          include: {
            problem: {
              select: { id: true, slug: true, title: true, difficulty: true, allowedLanguages: true, isPublished: true },
            },
          },
        },
      },
    }));

    let submittedRounds = new Set<string>();
    let isRegistered = false;
    let myTeam: Awaited<ReturnType<typeof getMyTeamInEvent>> = null;
    if (user) {
      const [registration, team] = await Promise.all([
        prisma.eventRegistration.findUnique({
          where: {
            userId_eventId: {
              userId: user.id,
              eventId,
            },
          },
          select: { id: true },
        }),
        getMyTeamInEvent(eventId, user.id),
      ]);
      isRegistered = Boolean(registration);
      myTeam = team;
      const mySubmissionByRound = rounds.length > 0
        ? await prisma.competitionSubmission.findMany({
            where: {
              roundId: { in: rounds.map((r) => r.id) },
              OR: [
                { userId: user.id },
                ...(team ? [{ teamId: team.id }] : []),
              ],
            },
            select: { roundId: true },
          })
        : [];
      submittedRounds = new Set(mySubmissionByRound.map((row) => row.roundId));
    }

    const nowMs = Date.now();
    const data = rounds.map((round) => ({
      id: round.id,
      eventId: round.eventId,
      title: round.title,
      description: round.description ?? undefined,
      duration: round.duration,
      status: round.status,
      roundType: round.roundType,
      participantScope: round.participantScope,
      leadersOnly: round.leadersOnly,
      allowedTeamIds: canViewTeamSelection ? round.allowedTeamIds : undefined,
      finalWeight: round.finalWeight,
      proctored: round.proctored,
      penaltyModel: round.penaltyModel,
      teamAggregation: round.teamAggregation,
      leaderboardFreezeMinutes: round.leaderboardFreezeMinutes,
      difficultyWeights: canViewTeamSelection ? round.difficultyWeights : undefined,
      startedAt: round.startedAt?.toISOString(),
      lockedAt: round.lockedAt?.toISOString(),
      problems: round.problems.map((link) => ({
        id: link.problem.id,
        slug: link.problem.slug,
        title: link.problem.title,
        difficulty: link.problem.difficulty,
        allowedLanguages: link.problem.allowedLanguages,
        isPublished: link.problem.isPublished,
        points: link.points,
        displayOrder: link.displayOrder,
      })),
      remainingSeconds: round.status === 'ACTIVE' ? computeRemainingSeconds(round, nowMs) : null,
      submissionCount: round._count.submissions,
      hasSubmitted: user ? submittedRounds.has(round.id) : undefined,
      isEligible: user
        ? (
            isRegistered
            && (
              !event.teamRegistration
              || (
                myTeam !== null
                && (
                  round.participantScope !== 'SELECTED_TEAMS'
                  || round.allowedTeamIds.includes(myTeam.id)
                )
                && (!round.leadersOnly || myTeam.isLeader)
              )
            )
          )
        : undefined,
      eligibilityReason: user
        ? (
            !isRegistered
              ? 'Register for this event to participate.'
              : (
                  event.teamRegistration
                    ? (
                        !myTeam
                          ? 'Join a team to participate.'
                          : (
                              round.participantScope === 'SELECTED_TEAMS' && !round.allowedTeamIds.includes(myTeam.id)
                                ? 'Your team is not selected for this round.'
                                : (round.leadersOnly && !myTeam.isLeader)
                                  ? 'Only the team leader can access this round.'
                                : undefined
                            )
                      )
                    : undefined
                )
          )
        : undefined,
      createdAt: round.createdAt.toISOString(),
      updatedAt: round.updatedAt.toISOString(),
    }));

    return ApiResponse.success(res, { rounds: data });
  } catch (error) {
    logger.error('Failed to list competition rounds by event', {
      eventId: req.params.eventId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to list rounds');
  }
});

// DSA contest rounds score via the Problems judge (ProblemSubmission), not
// CompetitionSubmission — so the IMAGE_TARGET results-summary query returns nothing for
// them. Compute their standings here in the SAME shape (rank/score + team/member or solo
// + attendance) so DSA contest WINNERS are certifiable through the existing
// EventCertificateWizard, exactly like image-target rounds.
type ResultsSummarySubmission = {
  submissionId: string; rank: number | null; score: number | null; submittedAt: string;
  teamId?: string; teamName?: string;
  members?: Array<{ userId: string; name: string; email: string; attended: boolean }>;
  userId?: string; userName?: string; userEmail?: string; attended?: boolean;
};

async function buildDsaRoundSummary(
  roundId: string,
  event: { id: string; teamRegistration: boolean },
): Promise<ResultsSummarySubmission[]> {
  const lb = await computeContestLeaderboard(roundId, 100000);
  const rows = lb?.results ?? [];
  if (rows.length === 0) return [];
  // DSA has no single submission instant, and the cert wizard re-ranks candidates by
  // (score desc, then submittedAt asc). Encoding the round's AUTHORITATIVE rank as the
  // timestamp makes that re-rank reproduce the contest order exactly — including the
  // ICPC penalty / completion tie-breaks already baked into `rank` (score is monotonic
  // with rank in both penalty models, so the score-primary sort never fights it). The
  // field is internal-only (never displayed), so a synthetic epoch is safe.
  const rankStamp = (rank: number | null): string => new Date((rank ?? rows.length + 1) * 1000).toISOString();

  if (event.teamRegistration) {
    // Team leaderboard rows are keyed by teamId (row.userId == teamId). Enrich with the
    // full member list + per-member attendance so the wizard can gate + issue per member.
    const teams = await prisma.eventTeam.findMany({
      where: { id: { in: rows.map((r) => r.userId) } },
      select: {
        id: true, teamName: true,
        members: {
          orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
          select: {
            user: { select: { id: true, name: true, email: true } },
            registration: { select: { attended: true } },
          },
        },
      },
    });
    const teamById = new Map(teams.map((t) => [t.id, t]));
    return rows.map((row) => {
      const team = teamById.get(row.userId);
      return {
        submissionId: `dsa:${roundId}:${row.userId}`,
        rank: row.rank,
        score: row.totalScore,
        submittedAt: rankStamp(row.rank),
        teamId: row.userId,
        teamName: team?.teamName ?? row.userName,
        members: (team?.members ?? []).map((m) => ({
          userId: m.user.id, name: m.user.name, email: m.user.email, attended: m.registration.attended,
        })),
      };
    });
  }

  // Solo leaderboard rows are keyed by userId. Enrich with email + attendance.
  const userIds = rows.map((r) => r.userId);
  const [users, regs] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
    prisma.eventRegistration.findMany({ where: { eventId: event.id, userId: { in: userIds } }, select: { userId: true, attended: true } }),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const attendedByUser = new Map(regs.map((r) => [r.userId, r.attended]));
  return rows.map((row) => {
    const u = userById.get(row.userId);
    return {
      submissionId: `dsa:${roundId}:${row.userId}`,
      rank: row.rank,
      score: row.totalScore,
      submittedAt: rankStamp(row.rank),
      userId: row.userId,
      userName: u?.name ?? row.userName,
      userEmail: u?.email ?? '',
      attended: attendedByUser.get(row.userId) ?? false,
    };
  });
}

competitionRouter.get('/event/:eventId/results-summary', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        teamRegistration: true,
      },
    });

    if (!event) {
      return ApiResponse.notFound(res, 'Event not found');
    }

    const rounds = await withRetry(() => prisma.competitionRound.findMany({
      where: {
        eventId,
        status: 'FINISHED',
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        title: true,
        roundType: true,
        submissions: {
          orderBy: [
            { rank: 'asc' },
            { score: 'desc' },
            { submittedAt: 'asc' },
          ],
          select: {
            id: true,
            rank: true,
            score: true,
            submittedAt: true,
            teamId: true,
            team: {
              select: {
                id: true,
                teamName: true,
                members: {
                  orderBy: [
                    { role: 'asc' },
                    { joinedAt: 'asc' },
                  ],
                  select: {
                    userId: true,
                    user: {
                      select: {
                        id: true,
                        name: true,
                        email: true,
                      },
                    },
                    registration: {
                      select: {
                        attended: true,
                      },
                    },
                  },
                },
              },
            },
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    }));

    const individualUserIds = Array.from(new Set(
      rounds.flatMap((round) => round.submissions)
        .filter((submission) => !submission.teamId)
        .map((submission) => submission.user.id),
    ));

    const individualAttendance = individualUserIds.length
      ? await prisma.eventRegistration.findMany({
          where: {
            eventId,
            userId: { in: individualUserIds },
          },
          select: {
            userId: true,
            attended: true,
          },
        })
      : [];

    const attendanceByUserId = new Map(
      individualAttendance.map((registration) => [registration.userId, registration.attended]),
    );

    // Build per-round summaries. DSA rounds compute standings from the Problems judge
    // (buildDsaRoundSummary); image-target rounds map their CompetitionSubmission rows.
    // Sequential (not Promise.all) to respect the frozen Prisma pool — bounded by round count.
    const roundSummaries: Array<{ roundId: string; title: string; roundType: string; submissions: ResultsSummarySubmission[] }> = [];
    for (const round of rounds) {
      if (round.roundType === 'DSA') {
        roundSummaries.push({ roundId: round.id, title: round.title, roundType: round.roundType, submissions: await buildDsaRoundSummary(round.id, event) });
        continue;
      }
      roundSummaries.push({
        roundId: round.id,
        roundType: round.roundType,
        title: round.title,
        submissions: round.submissions.map((submission) => {
          if (event.teamRegistration && submission.team) {
            return {
              submissionId: submission.id,
              rank: submission.rank,
              score: submission.score,
              submittedAt: submission.submittedAt.toISOString(),
              teamId: submission.team.id,
              teamName: submission.team.teamName,
              members: submission.team.members.map((member) => ({
                userId: member.user.id,
                name: member.user.name,
                email: member.user.email,
                attended: member.registration.attended,
              })),
            };
          }

          return {
            submissionId: submission.id,
            rank: submission.rank,
            score: submission.score,
            submittedAt: submission.submittedAt.toISOString(),
            userId: submission.user.id,
            userName: submission.user.name,
            userEmail: submission.user.email,
            attended: attendanceByUserId.get(submission.user.id) ?? false,
          };
        }),
      });
    }

    return ApiResponse.success(res, { rounds: roundSummaries });
  } catch (error) {
    logger.error('Failed to fetch competition results summary', {
      eventId: req.params.eventId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to fetch competition results summary');
  }
});

// ─── Event-final standings (Phase F) ─────────────────────────────────────────
// Combine an event's FINISHED rounds by their normalized finalWeight into one capped
// 0–100 standing per entrant (team for team events, user for solo), with a per-round
// breakdown. Admins always see the draft; the public sees it once published.

type FinalEntrant = { id: string; name: string; isTeam: boolean; perRound: Map<string, number>; final: number };

// Per-round entrant→score(0–100). DSA uses the team-aware leaderboard; IMAGE_TARGET uses
// the admin-scored CompetitionSubmission rows (keyed by team for team events, else user).
async function getRoundStandings(round: { id: string; roundType: string }, teamRegistration: boolean): Promise<Map<string, { name: string; score: number; isTeam: boolean }>> {
  const out = new Map<string, { name: string; score: number; isTeam: boolean }>();
  if (round.roundType === 'DSA') {
    const lb = await computeContestLeaderboard(round.id, 100000);
    for (const row of lb?.results ?? []) {
      out.set(row.userId, { name: row.userName, score: row.totalScore, isTeam: Boolean(row.isTeam) });
    }
    return out;
  }
  const subs = await prisma.competitionSubmission.findMany({
    where: { roundId: round.id },
    select: { score: true, userId: true, user: { select: { name: true } }, team: { select: { id: true, teamName: true } } },
  });
  for (const s of subs) {
    if (teamRegistration && s.team) out.set(s.team.id, { name: s.team.teamName, score: s.score ?? 0, isTeam: true });
    else out.set(s.userId, { name: s.user.name, score: s.score ?? 0, isTeam: false });
  }
  return out;
}

async function computeEventFinal(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, teamRegistration: true, competitionFinalPublishedAt: true },
  });
  if (!event) return null;
  const rounds = await prisma.competitionRound.findMany({
    where: { eventId, status: 'FINISHED' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, title: true, roundType: true, finalWeight: true },
  });
  const normWeights = normalizeWeights(rounds.map((r) => r.finalWeight));
  const weightByRound = new Map(rounds.map((r, i) => [r.id, normWeights[i]]));

  const entrants = new Map<string, FinalEntrant>();
  for (const round of rounds) {
    const standings = await getRoundStandings(round, event.teamRegistration);
    const w = weightByRound.get(round.id) ?? 0;
    for (const [id, row] of standings) {
      const e = entrants.get(id) ?? { id, name: row.name, isTeam: row.isTeam, perRound: new Map(), final: 0 };
      e.name = row.name; // freshest display name
      e.perRound.set(round.id, row.score);
      e.final += row.score * w;
      entrants.set(id, e);
    }
  }

  const ranked = Array.from(entrants.values())
    .map((e) => ({ ...e, final: Math.round(Math.min(100, e.final) * 100) / 100 }))
    .sort((a, b) => b.final - a.final);
  let currentRank = 1;
  const standings = ranked.map((e, i) => {
    if (i > 0 && e.final !== ranked[i - 1].final) currentRank = i + 1;
    return {
      rank: currentRank,
      entrantId: e.id,
      name: e.name,
      isTeam: e.isTeam,
      final: e.final,
      perRound: rounds.map((r) => ({ roundId: r.id, title: r.title, score: e.perRound.get(r.id) ?? null })),
    };
  });

  return {
    event: { id: event.id, title: event.title, teamRegistration: event.teamRegistration, publishedAt: event.competitionFinalPublishedAt?.toISOString() ?? null },
    rounds: rounds.map((r, i) => ({ id: r.id, title: r.title, weight: normWeights[i] })),
    standings,
  };
}

competitionRouter.get('/event/:eventId/final', async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const isAdmin = Boolean(user && hasPermission(user.role, 'ADMIN'));
    const final = await computeEventFinal(req.params.eventId);
    if (!final) return ApiResponse.notFound(res, 'Event not found');
    if (!isAdmin && !final.event.publishedAt) {
      return ApiResponse.forbidden(res, 'Final standings are not published yet');
    }
    return ApiResponse.success(res, final);
  } catch (error) {
    return mapRoundError(res, error, 'Failed to compute event final');
  }
});

competitionRouter.post('/event/:eventId/publish-final', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req)!;
    const event = await prisma.event.findUnique({ where: { id: req.params.eventId }, select: { id: true } });
    if (!event) return ApiResponse.notFound(res, 'Event not found');
    const publish = req.body?.publish !== false; // default true; pass { publish:false } to unpublish
    await prisma.event.update({
      where: { id: event.id },
      data: { competitionFinalPublishedAt: publish ? new Date() : null },
    });
    await auditLog(admin.id, publish ? 'COMPETITION_FINAL_PUBLISHED' : 'COMPETITION_FINAL_UNPUBLISHED', 'Event', event.id, {});
    return ApiResponse.success(res, { published: publish });
  } catch (error) {
    return mapRoundError(res, error, 'Failed to publish event final');
  }
});

competitionRouter.get('/:roundId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req)!;
    const { roundId } = req.params;
    const serverTime = new Date();

    let round = await ensureRegisteredForRound(roundId, user.id);

    if (round.status === 'ACTIVE') {
      const remaining = computeRemainingSeconds(round, serverTime.getTime());
      if (remaining !== null && remaining <= 0) {
        const locked = await autoLockRound(roundId);
        if (!locked) {
          return ApiResponse.internal(res, 'Failed to lock expired round');
        }
        round = await ensureRegisteredForRound(roundId, user.id);
      }
    }

    const myTeam = await getMyTeamInEvent(round.eventId, user.id);
    const participationError = getRoundParticipationError(round, myTeam);
    if (participationError) {
      return ApiResponse.forbidden(res, participationError);
    }
    // These four lookups are mutually independent once myTeam is resolved —
    // one parallel stage instead of four sequential round-trips on a page the
    // solve UI polls while a round is live.
    const isAdmin = hasPermission(user.role, 'ADMIN');
    const [hasSubmittedByUser, hasSubmittedByTeam, myProblemSubmissions, pendingCapRequests] = await Promise.all([
      prisma.competitionSubmission.findUnique({
        where: {
          roundId_userId: { roundId, userId: user.id },
        },
        select: { id: true },
      }),
      myTeam
        ? prisma.competitionSubmission.findUnique({
            where: {
              roundId_teamId: { roundId, teamId: myTeam.id },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
      round.roundType === 'DSA'
        ? prisma.problemSubmission.findMany({
            where: {
              userId: user.id,
              contextType: 'CONTEST',
              contextKey: round.id,
            },
            select: { problemId: true, score: true, verdict: true, updatedAt: true },
          })
        : Promise.resolve([]),
      isAdmin && round.roundType === 'DSA'
        ? prisma.problemSubmissionCounter.count({
            where: { contextType: 'CONTEST', contextKey: round.id, pendingRequest: true },
          })
        : Promise.resolve(0),
    ]);

    return ApiResponse.success(res, {
      id: round.id,
      eventId: round.eventId,
      title: round.title,
      description: round.description ?? undefined,
      duration: round.duration,
      status: round.status,
      roundType: round.roundType,
      participantScope: round.participantScope,
      leadersOnly: round.leadersOnly,
      allowedTeamIds: round.allowedTeamIds,
      proctored: round.proctored,
      penaltyModel: round.penaltyModel,
      leaderboardFreezeMinutes: round.leaderboardFreezeMinutes,
      startedAt: round.startedAt?.toISOString(),
      lockedAt: round.lockedAt?.toISOString(),
      problems: round.problems.map((link) => ({
        id: link.problem.id,
        slug: link.problem.slug,
        title: link.problem.title,
        difficulty: link.problem.difficulty,
        allowedLanguages: link.problem.allowedLanguages,
        points: link.points,
        displayOrder: link.displayOrder,
        submission: myProblemSubmissions.find((submission) => submission.problemId === link.problemId) ?? null,
      })),
      serverTime: serverTime.toISOString(),
      remainingSeconds: round.status === 'ACTIVE' ? computeRemainingSeconds(round, serverTime.getTime()) : 0,
      hasSubmitted: round.roundType === 'DSA' ? myProblemSubmissions.length > 0 : Boolean(hasSubmittedByUser || hasSubmittedByTeam),
      myTeam,
      pendingCapRequests,
      createdAt: round.createdAt.toISOString(),
      updatedAt: round.updatedAt.toISOString(),
    });
  } catch (error) {
    const err = error as { status?: number; code?: string; message?: string };
    if (err.status && err.code && err.message) {
      return ApiResponse.error(res, {
        code: err.code,
        message: err.message,
        status: err.status,
      });
    }
    logger.error('Failed to fetch round status', {
      roundId: req.params.roundId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to fetch round');
  }
});

competitionRouter.patch('/:roundId/start', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req)!;
    const round = await prisma.competitionRound.findUnique({
      where: { id: req.params.roundId },
      select: {
        id: true, status: true, duration: true, eventId: true, title: true, roundType: true,
        problems: { select: { problem: { select: { title: true, hiddenTests: true } } } },
      },
    });

    if (!round) return ApiResponse.notFound(res, 'Round not found');
    if (round.status !== 'DRAFT') {
      return ApiResponse.badRequest(res, 'Only draft rounds can be started');
    }

    // A DSA round scores CONTEST submissions on PRIVATE (hidden) tests only — sample
    // tests carry 0 weight. A linked problem with no hidden tests therefore scores every
    // contestant 0 with no error during the live round (they'd see passing samples but a 0
    // score, and an all-zero board). Block the start until each problem has hidden tests,
    // when there's still time to fix it, rather than failing silently mid-contest.
    if (round.roundType === 'DSA') {
      const noHidden = round.problems
        .filter((link) => getProblemTests({ sampleTests: [], hiddenTests: link.problem.hiddenTests }).hiddenTests.length === 0)
        .map((link) => link.problem.title);
      if (noHidden.length > 0) {
        return ApiResponse.badRequest(
          res,
          `Cannot start: these problems have no hidden tests, so they would score every contestant 0 — ${noHidden.join(', ')}. Add hidden tests before starting.`,
        );
      }
    }

    const startedAt = new Date();
    // Atomic DRAFT → ACTIVE: the read-above status check is TOCTOU-racy (two concurrent
    // start clicks could both pass it), and a non-conditional update would let BOTH
    // increment the contest-priority counter — leaving it stuck > 0 so non-essential
    // background work stays paused until a restart. The conditional updateMany makes
    // exactly one caller the winner; the loser sees count === 0 and bails. Mirrors the
    // atomic-attendance / quiz start-guard pattern.
    //
    // Deliberately NOT wrapped in withRetry: a retry-after-commit would re-run the
    // conditional update, find status already ACTIVE → count 0, and we'd skip arming the
    // timer/counter while the row is in fact ACTIVE (a round that never auto-locks). A
    // single attempt is all-or-nothing — a transient error throws → 500, the row stays
    // DRAFT, the admin retries. (The findUnique above is likewise un-retried.)
    const claim = await prisma.competitionRound.updateMany({
      where: { id: round.id, status: 'DRAFT' },
      data: { status: 'ACTIVE', startedAt, lockedAt: null },
    });
    if (claim.count === 0) {
      // Lost the race (a concurrent click won and already armed everything) or no longer
      // DRAFT — either way there's nothing for this request to start.
      return ApiResponse.badRequest(res, 'Only draft rounds can be started');
    }
    const updated = await prisma.competitionRound.findUniqueOrThrow({ where: { id: round.id } });

    scheduleRoundLock(round.id, round.duration);
    // DRAFT → ACTIVE: enter contest priority mode + push synced start to the lobby.
    // Only the winner of the atomic claim above reaches here, so this increments once.
    incActiveRounds();
    emitRoundStatus(round.id, 'ACTIVE');

    await auditLog(admin.id, 'COMPETITION_ROUND_STARTED', 'CompetitionRound', round.id, {
      title: round.title,
      eventId: round.eventId,
      duration: round.duration,
    });

    return ApiResponse.success(res, {
      round: {
        ...updated,
        startedAt: updated.startedAt?.toISOString(),
        lockedAt: updated.lockedAt?.toISOString(),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to start competition round', {
      roundId: req.params.roundId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to start round');
  }
});

competitionRouter.patch('/:roundId/lock', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req)!;
    const round = await prisma.competitionRound.findUnique({
      where: { id: req.params.roundId },
      select: { id: true, status: true, eventId: true, title: true },
    });

    if (!round) return ApiResponse.notFound(res, 'Round not found');
    if (round.status !== 'ACTIVE') {
      return ApiResponse.badRequest(res, 'Only active rounds can be locked');
    }

    const timer = activeTimers.get(round.id);
    if (timer) clearTimeout(timer);
    activeTimers.delete(round.id);

    const locked = await autoLockRound(round.id);
    if (!locked) {
      return ApiResponse.internal(res, 'Failed to lock round');
    }

    await auditLog(admin.id, 'COMPETITION_ROUND_LOCKED', 'CompetitionRound', round.id, {
      title: round.title,
      eventId: round.eventId,
    });

    return ApiResponse.success(res, { message: 'Round locked successfully' });
  } catch (error) {
    logger.error('Failed to lock competition round', {
      roundId: req.params.roundId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to lock round');
  }
});

competitionRouter.patch('/:roundId/judging', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req)!;
    const round = await prisma.competitionRound.findUnique({
      where: { id: req.params.roundId },
      select: { id: true, status: true, eventId: true, title: true },
    });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
    if (round.status !== 'LOCKED') {
      return ApiResponse.badRequest(res, 'Only locked rounds can enter judging');
    }

    const updated = await prisma.competitionRound.update({
      where: { id: round.id },
      data: { status: 'JUDGING' },
    });
    emitRoundStatus(round.id, 'JUDGING');

    await auditLog(admin.id, 'COMPETITION_ROUND_JUDGING', 'CompetitionRound', round.id, {
      title: round.title,
      eventId: round.eventId,
    });

    return ApiResponse.success(res, {
      round: {
        ...updated,
        startedAt: updated.startedAt?.toISOString(),
        lockedAt: updated.lockedAt?.toISOString(),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to move competition round to judging', {
      roundId: req.params.roundId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to update round status');
  }
});

competitionRouter.patch('/:roundId/finish', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req)!;
    const round = await prisma.competitionRound.findUnique({
      where: { id: req.params.roundId },
      select: { id: true, status: true, roundType: true, eventId: true, title: true },
    });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
    if (round.roundType === 'DSA') {
      if (!['LOCKED', 'JUDGING'].includes(round.status)) {
        return ApiResponse.badRequest(res, 'Only locked or judging DSA rounds can be finished');
      }
      const updated = await prisma.$transaction(async (tx) => {
        // The contest is over: release every participant lock so nobody is left stuck and
        // the monitor reads 0 locked ("everything zero"). The arena already gates solving
        // on ACTIVE, so this only clears proctor state.
        await tx.competitionParticipantState.updateMany({
          where: { roundId: round.id, locked: true },
          data: { locked: false, lockReason: null, unlockedAt: new Date() },
        });
        return tx.competitionRound.update({
          where: { id: round.id },
          data: { status: 'FINISHED' },
        });
      });
      emitRoundStatus(round.id, 'FINISHED');
      await auditLog(admin.id, 'COMPETITION_ROUND_FINISHED', 'CompetitionRound', round.id, {
        title: round.title,
        eventId: round.eventId,
        roundType: round.roundType,
      });
      return ApiResponse.success(res, {
        round: {
          ...updated,
          startedAt: updated.startedAt?.toISOString(),
          lockedAt: updated.lockedAt?.toISOString(),
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      });
    }
    if (round.status !== 'JUDGING') {
      return ApiResponse.badRequest(res, 'Only judging rounds can be finished');
    }

    // All submissions must have a score before publishing
    const missingScore = await prisma.competitionSubmission.findFirst({
      where: { roundId: round.id, score: null },
      select: { id: true },
    });
    if (missingScore) {
      return ApiResponse.badRequest(res, 'All submissions must have a score before publishing results');
    }

    // Auto-compute ranks from scores (standard 1224) and flip to FINISHED atomically.
    let rankedCount = 0;
    const updated = await prisma.$transaction(async (tx) => {
      rankedCount = await recomputeRoundRanks(tx, round.id);
      // Release every participant lock once the contest ends (see DSA branch).
      await tx.competitionParticipantState.updateMany({
        where: { roundId: round.id, locked: true },
        data: { locked: false, lockReason: null, unlockedAt: new Date() },
      });
      return tx.competitionRound.update({
        where: { id: round.id },
        data: { status: 'FINISHED' },
      });
    });
    emitRoundStatus(round.id, 'FINISHED');

    await auditLog(admin.id, 'COMPETITION_ROUND_FINISHED', 'CompetitionRound', round.id, {
      title: round.title,
      eventId: round.eventId,
      rankedCount,
    });

    return ApiResponse.success(res, {
      round: {
        ...updated,
        startedAt: updated.startedAt?.toISOString(),
        lockedAt: updated.lockedAt?.toISOString(),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to finish competition round', {
      roundId: req.params.roundId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to publish results');
  }
});

competitionRouter.post('/:roundId/save', authMiddleware, saveLimiter, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req)!;
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) {
      return ApiResponse.error(res, {
        code: ErrorCodes.VALIDATION_ERROR,
        message: parsed.error.errors[0]?.message || 'Invalid payload',
        status: 400,
      });
    }

    const round = await ensureRegisteredForRound(req.params.roundId, user.id);
    const isLockedFallback = round.status === 'LOCKED';
    if ((round.status !== 'ACTIVE' && !isLockedFallback) || !round.startedAt) {
      return ApiResponse.badRequest(res, 'This round is not accepting saves right now.');
    }

    const serverNow = new Date();
    if (!isLockedFallback) {
      const remaining = computeRemainingSeconds(round, serverNow.getTime()) ?? 0;
      if (remaining <= 0) {
        return ApiResponse.badRequest(res, 'This round is no longer accepting submissions.');
      }
    } else {
      const lockAgeMs = round.lockedAt
        ? serverNow.getTime() - round.lockedAt.getTime()
        : Number.MAX_SAFE_INTEGER;
      if (lockAgeMs > 2 * 60 * 1000) {
        return ApiResponse.badRequest(res, 'Round lock finalization window has passed.');
      }
    }

    const myTeam = await getMyTeamInEvent(round.eventId, user.id);
    const participationError = getRoundParticipationError(round, myTeam);
    if (participationError) {
      return ApiResponse.forbidden(res, participationError);
    }
    if (await isParticipantLocked(round.id, user.id)) {
      return ApiResponse.forbidden(res, 'You are locked by the proctor. Contact an invigilator to unlock.');
    }
    if (round.roundType === 'DSA') {
      return ApiResponse.badRequest(res, 'DSA rounds use problem drafts in the browser instead of competition autosave.');
    }

    const alreadySubmittedByUser = await prisma.competitionSubmission.findUnique({
      where: {
        roundId_userId: {
          roundId: round.id,
          userId: user.id,
        },
      },
      select: { id: true },
    });
    if (alreadySubmittedByUser) {
      return ApiResponse.conflict(res, 'You have already submitted. Auto-save is disabled.');
    }
    if (myTeam) {
      const alreadySubmittedByTeam = await prisma.competitionSubmission.findUnique({
        where: {
          roundId_teamId: {
            roundId: round.id,
            teamId: myTeam.id,
          },
        },
        select: { id: true },
      });
      if (alreadySubmittedByTeam) {
        return ApiResponse.conflict(res, 'Your team has already submitted. Auto-save is disabled.');
      }
    }

    const payloadCode = parsed.data.code;

    if (isLockedFallback) {
      const submission = await prisma.competitionSubmission.create({
        data: {
          roundId: round.id,
          teamId: myTeam?.id || null,
          userId: user.id,
          code: payloadCode,
          isAutoSubmit: true,
        },
        select: { id: true, submittedAt: true },
      });

      await prisma.competitionAutoSave.deleteMany({
        where: {
          roundId: round.id,
          userId: user.id,
        },
      });

      return ApiResponse.success(res, {
        submitted: true,
        submission: {
          id: submission.id,
          submittedAt: submission.submittedAt.toISOString(),
        },
        serverTime: serverNow.toISOString(),
      });
    }

    const autoSave = await prisma.competitionAutoSave.upsert({
      where: {
        roundId_userId: { roundId: round.id, userId: user.id },
      },
      create: {
        roundId: round.id,
        userId: user.id,
        teamId: myTeam?.id || null,
        code: payloadCode,
      },
      update: {
        code: payloadCode,
        savedAt: serverNow,
      },
      select: {
        savedAt: true,
      },
    });

    return ApiResponse.success(res, {
      savedAt: autoSave.savedAt.toISOString(),
      serverTime: serverNow.toISOString(),
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return ApiResponse.conflict(res, 'Submission already exists for this team or user.');
    }
    const err = error as { status?: number; code?: string; message?: string };
    if (err.status && err.code && err.message) {
      return ApiResponse.error(res, {
        code: err.code,
        message: err.message,
        status: err.status,
      });
    }
    logger.error('Failed to auto-save competition code', {
      roundId: req.params.roundId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to save code');
  }
});

competitionRouter.post('/:roundId/submit', authMiddleware, submitLimiter, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req)!;
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      return ApiResponse.error(res, {
        code: ErrorCodes.VALIDATION_ERROR,
        message: parsed.error.errors[0]?.message || 'Invalid payload',
        status: 400,
      });
    }

    const round = await ensureRegisteredForRound(req.params.roundId, user.id);
    if (round.status !== 'ACTIVE' || !round.startedAt) {
      return ApiResponse.badRequest(res, 'This round is no longer accepting submissions.');
    }

    const remaining = computeRemainingSeconds(round, Date.now()) ?? 0;
    if (remaining <= 0) {
      return ApiResponse.badRequest(res, 'This round is no longer accepting submissions.');
    }

    const myTeam = await getMyTeamInEvent(round.eventId, user.id);
    const participationError = getRoundParticipationError(round, myTeam);
    if (participationError) {
      return ApiResponse.forbidden(res, participationError);
    }
    if (await isParticipantLocked(round.id, user.id)) {
      return ApiResponse.forbidden(res, 'You are locked by the proctor. Contact an invigilator to unlock.');
    }

    if (round.roundType === 'DSA') {
      // DSA solves are judged via the Problems pipeline (`/api/problems/:id/submit`,
      // CONTEST context) from the playground shell — mirrors `/save`'s DSA rejection.
      return ApiResponse.badRequest(res, 'DSA rounds submit through the problem judge, not competition submit.');
    }

    if (myTeam) {
      const teamSubmitted = await prisma.competitionSubmission.findUnique({
        where: {
          roundId_teamId: {
            roundId: round.id,
            teamId: myTeam.id,
          },
        },
        select: { id: true },
      });
      if (teamSubmitted) {
        return ApiResponse.conflict(res, 'Your team has already submitted.');
      }
    }

    const userSubmitted = await prisma.competitionSubmission.findUnique({
      where: {
        roundId_userId: {
          roundId: round.id,
          userId: user.id,
        },
      },
      select: { id: true },
    });
    if (userSubmitted) {
      return ApiResponse.conflict(res, 'You have already submitted.');
    }

    const submission = await prisma.competitionSubmission.create({
      data: {
        roundId: round.id,
        teamId: myTeam?.id || null,
        userId: user.id,
        code: parsed.data.code,
        isAutoSubmit: false,
      },
      select: { id: true, submittedAt: true },
    });

    await prisma.competitionAutoSave.deleteMany({
      where: { roundId: round.id, userId: user.id },
    });

    return ApiResponse.success(res, {
      submission: {
        id: submission.id,
        submittedAt: submission.submittedAt.toISOString(),
      },
      message: 'Submitted successfully',
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return ApiResponse.conflict(res, 'Submission already exists for this team or user.');
    }
    const err = error as { status?: number; code?: string; message?: string };
    if (err.status && err.code && err.message) {
      return ApiResponse.error(res, {
        code: err.code,
        message: err.message,
        status: err.status,
      });
    }

    logger.error('Failed to submit competition code', {
      roundId: req.params.roundId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to submit code');
  }
});

competitionRouter.get('/:roundId/my-submission', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req)!;
    const round = await ensureRegisteredForRound(req.params.roundId, user.id);
    const myTeam = await getMyTeamInEvent(round.eventId, user.id);
    const participationError = getRoundParticipationError(round, myTeam);
    if (participationError) {
      return ApiResponse.forbidden(res, participationError);
    }

    if (round.roundType === 'DSA') {
      const submissions = await prisma.problemSubmission.findMany({
        where: {
          userId: user.id,
          contextType: 'CONTEST',
          contextKey: round.id,
        },
        orderBy: { updatedAt: 'desc' },
      });
      return ApiResponse.success(res, {
        submission: null,
        autoSave: null,
        problemSubmissions: submissions.map((submission) => ({
          ...submission,
          submittedAt: submission.submittedAt.toISOString(),
          updatedAt: submission.updatedAt.toISOString(),
        })),
      });
    }

    const submission = await prisma.competitionSubmission.findUnique({
      where: {
        roundId_userId: {
          roundId: round.id,
          userId: user.id,
        },
      },
      select: {
        id: true,
        code: true,
        submittedAt: true,
        isAutoSubmit: true,
        score: true,
        rank: true,
        adminNotes: true,
      },
    });

    if (submission) {
      return ApiResponse.success(res, {
        submission: {
          ...submission,
          submittedAt: submission.submittedAt.toISOString(),
        },
        autoSave: null,
      });
    }

    if (myTeam) {
      const teamSubmission = await prisma.competitionSubmission.findUnique({
        where: {
          roundId_teamId: {
            roundId: round.id,
            teamId: myTeam.id,
          },
        },
        select: {
          id: true,
          code: true,
          submittedAt: true,
          isAutoSubmit: true,
          score: true,
          rank: true,
          adminNotes: true,
        },
      });

      if (teamSubmission) {
        return ApiResponse.success(res, {
          submission: {
            ...teamSubmission,
            submittedAt: teamSubmission.submittedAt.toISOString(),
          },
          autoSave: null,
        });
      }
    }

    const autoSave = await prisma.competitionAutoSave.findUnique({
      where: {
        roundId_userId: {
          roundId: round.id,
          userId: user.id,
        },
      },
      select: {
        code: true,
        savedAt: true,
      },
    });

    return ApiResponse.success(res, {
      submission: null,
      autoSave: autoSave
        ? { code: autoSave.code, savedAt: autoSave.savedAt.toISOString() }
        : null,
    });
  } catch (error) {
    const err = error as { status?: number; code?: string; message?: string };
    if (err.status && err.code && err.message) {
      return ApiResponse.error(res, {
        code: err.code,
        message: err.message,
        status: err.status,
      });
    }
    logger.error('Failed to fetch own competition submission', {
      roundId: req.params.roundId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to fetch submission');
  }
});

competitionRouter.get('/:roundId/submissions', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const round = await prisma.competitionRound.findUnique({
      where: { id: req.params.roundId },
      select: {
        id: true,
        title: true,
        status: true,
        roundType: true,
        targetImageUrl: true,
        participantScope: true,
        leadersOnly: true,
        allowedTeamIds: true,
        event: {
          select: {
            id: true,
            title: true,
            teamRegistration: true,
          },
        },
        problems: {
          orderBy: { displayOrder: 'asc' },
          include: { problem: { select: { id: true, title: true, slug: true, difficulty: true } } },
        },
      },
    });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
    if (!['ACTIVE', 'LOCKED', 'JUDGING', 'FINISHED'].includes(round.status)) {
      return ApiResponse.forbidden(res, 'Submissions are available once the round is started');
    }

    if (round.roundType === 'DSA') {
      const submissions = await prisma.problemSubmission.findMany({
        where: { contextType: 'CONTEST', contextKey: round.id },
        orderBy: { updatedAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true, avatar: true } }, problem: { select: { id: true, title: true } } },
      });
      return ApiResponse.success(res, {
        round: {
          id: round.id,
          title: round.title,
          eventId: round.event.id,
          eventTitle: round.event.title,
          status: round.status,
          roundType: round.roundType,
          participantScope: round.participantScope,
          leadersOnly: round.leadersOnly,
          allowedTeamIds: round.allowedTeamIds,
          targetImageUrl: round.targetImageUrl,
          problems: round.problems.map((link) => ({
            id: link.problem.id,
            title: link.problem.title,
            slug: link.problem.slug,
            difficulty: link.problem.difficulty,
            points: link.points,
            displayOrder: link.displayOrder,
          })),
        },
        submissions: submissions.map((submission) => ({
          id: submission.id,
          problemId: submission.problemId,
          problemTitle: submission.problem.title,
          userId: submission.userId,
          userName: submission.user.name,
          userEmail: submission.user.email,
          userAvatar: submission.user.avatar,
          code: submission.code,
          language: submission.language,
          verdict: submission.verdict,
          score: submission.score,
          passedCount: submission.passedCount,
          totalCount: submission.totalCount,
          runtimeMs: submission.runtimeMs,
          perTestVerdicts: submission.perTestVerdicts,
          submittedAt: submission.submittedAt.toISOString(),
          updatedAt: submission.updatedAt.toISOString(),
          manualOverride: submission.manualOverride,
          overrideNotes: submission.overrideNotes,
        })),
        missingTeams: [],
      });
    }

    const submissions = await prisma.competitionSubmission.findMany({
      where: { roundId: round.id },
      include: {
        team: { select: { id: true, teamName: true } },
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
      orderBy: { submittedAt: 'asc' },
    });

    const submittedTeamIds = new Set(
      submissions
        .map((submission) => submission.teamId)
        .filter((teamId): teamId is string => Boolean(teamId)),
    );
    const missingTeamIds =
      round.participantScope === 'SELECTED_TEAMS'
        ? round.allowedTeamIds.filter((teamId) => !submittedTeamIds.has(teamId))
        : null;

    const missingTeams = round.event.teamRegistration
      ? await prisma.eventTeam.findMany({
          where: {
            eventId: round.event.id,
            ...(missingTeamIds
              ? { id: { in: missingTeamIds } }
              : { id: { notIn: Array.from(submittedTeamIds) } }),
          },
          select: {
            id: true,
            teamName: true,
            members: {
              select: {
                user: {
                  select: { name: true },
                },
              },
            },
          },
          orderBy: { teamName: 'asc' },
        })
      : [];

    return ApiResponse.success(res, {
      round: {
        id: round.id,
        title: round.title,
        eventId: round.event.id,
        eventTitle: round.event.title,
        status: round.status,
        participantScope: round.participantScope,
        leadersOnly: round.leadersOnly,
        allowedTeamIds: round.allowedTeamIds,
        targetImageUrl: round.targetImageUrl,
      },
      submissions: submissions.map((submission) => ({
        id: submission.id,
        roundId: submission.roundId,
        teamId: submission.teamId || undefined,
        teamName: submission.team?.teamName || null,
        userId: submission.userId,
        userName: submission.user.name,
        userEmail: submission.user.email,
        userAvatar: submission.user.avatar,
        code: submission.code,
        submittedAt: submission.submittedAt.toISOString(),
        isAutoSubmit: submission.isAutoSubmit,
        score: submission.score,
        rank: submission.rank,
        adminNotes: submission.adminNotes,
      })),
      missingTeams: missingTeams.map((team) => ({
        id: team.id,
        teamName: team.teamName,
        members: team.members.map((member) => member.user.name),
      })),
    });
  } catch (error) {
    logger.error('Failed to fetch competition submissions', {
      roundId: req.params.roundId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to fetch submissions');
  }
});

competitionRouter.patch('/:roundId/score/:submissionId', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req)!;
    const parsed = scoreSchema.safeParse(req.body);
    if (!parsed.success) {
      return ApiResponse.error(res, {
        code: ErrorCodes.VALIDATION_ERROR,
        message: parsed.error.errors[0]?.message || 'Invalid payload',
        status: 400,
      });
    }

    const round = await prisma.competitionRound.findUnique({
      where: { id: req.params.roundId },
      select: { id: true, status: true, eventId: true, title: true },
    });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
    // Scoring is allowed once the round is no longer live (LOCKED onward) — admins often
    // start scoring right after locking, before formally moving to "judging".
    if (!['LOCKED', 'JUDGING', 'FINISHED'].includes(round.status)) {
      return ApiResponse.badRequest(res, 'Lock the round before scoring submissions');
    }

    const existingSubmission = await prisma.competitionSubmission.findUnique({
      where: { id: req.params.submissionId },
      select: { id: true, roundId: true },
    });
    if (!existingSubmission || existingSubmission.roundId !== round.id) {
      return ApiResponse.notFound(res, 'Submission not found in this round');
    }

    // Rank uniqueness check removed — ranks are auto-computed from scores on publish.
    // Manual rank override is still accepted but not enforced as unique.

    // Correcting a score on an already-FINISHED round must re-derive the whole board's
    // ranks from scores (same as publish), or `rank` drifts out of sync with `score`.
    // A pure rank override (explicit `rank` in the payload) is honored as-is and skips
    // the recompute, preserving the manual-override escape hatch.
    const shouldRecomputeRanks =
      round.status === 'FINISHED'
      && parsed.data.score !== undefined
      && parsed.data.rank === undefined;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.competitionSubmission.update({
        where: { id: req.params.submissionId },
        data: {
          ...(parsed.data.score !== undefined ? { score: parsed.data.score } : {}),
          ...(parsed.data.rank !== undefined ? { rank: parsed.data.rank } : {}),
          ...(parsed.data.adminNotes !== undefined ? { adminNotes: sanitizeText(parsed.data.adminNotes) } : {}),
        },
      });
      if (shouldRecomputeRanks) {
        await recomputeRoundRanks(tx, round.id);
      }
      return tx.competitionSubmission.findUniqueOrThrow({
        where: { id: req.params.submissionId },
        include: {
          team: { select: { teamName: true } },
          user: { select: { name: true } },
        },
      });
    });

    await auditLog(admin.id, 'COMPETITION_SUBMISSION_SCORED', 'CompetitionSubmission', updated.id, {
      roundId: round.id,
      score: parsed.data.score,
      rank: parsed.data.rank,
    });

    return ApiResponse.success(res, {
      submission: {
        id: updated.id,
        teamName: updated.team?.teamName || null,
        userName: updated.user.name,
        score: updated.score,
        rank: updated.rank,
        adminNotes: updated.adminNotes,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to score competition submission', {
      roundId: req.params.roundId,
      submissionId: req.params.submissionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to save score');
  }
});

competitionRouter.get('/:roundId/results/export', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { format = 'xlsx' } = req.query;
    const round = await prisma.competitionRound.findUnique({
      where: { id: req.params.roundId },
      select: {
        id: true,
        title: true,
        status: true,
        roundType: true,
        event: {
          select: { title: true },
        },
        problems: {
          orderBy: { displayOrder: 'asc' },
          include: { problem: { select: { id: true, title: true } } },
        },
      },
    });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
    if (round.status !== 'FINISHED') {
      return ApiResponse.badRequest(res, 'Results can only be exported after publishing.');
    }

    if (round.roundType === 'DSA') {
      const submissions = await prisma.problemSubmission.findMany({
        where: { contextType: 'CONTEST', contextKey: round.id },
        // Export only needs these columns — project out `code`/`perTestVerdicts` so a
        // large round's export doesn't pull N×M code blobs into memory.
        select: {
          problemId: true, verdict: true, score: true, runtimeMs: true, updatedAt: true,
          user: { select: { name: true, email: true } },
          problem: { select: { title: true } },
        },
        orderBy: [{ score: 'desc' }, { updatedAt: 'asc' }],
      });
      const problemPoints = new Map(round.problems.map((link) => [link.problemId, link.points]));
      const rows = submissions.map((submission) => [
        submission.user.name,
        submission.user.email,
        submission.problem.title,
        submission.verdict,
        String(submission.score),
        String(Math.round(submission.score * ((problemPoints.get(submission.problemId) ?? 100) / 100))),
        String(submission.runtimeMs ?? ''),
        submission.updatedAt.toISOString(),
      ]);
      const safeRoundTitle = round.title.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60) || 'round';
      const safeEventTitle = round.event.title.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60) || 'event';
      if (format === 'csv') {
        const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
        const csv = [['User', 'Email', 'Problem', 'Verdict', 'Score', 'Weighted Score', 'Runtime Ms', 'Updated At'], ...rows]
          .map((row) => row.map((cell) => escapeCell(cell)).join(','))
          .join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${safeEventTitle}-${safeRoundTitle}-dsa-results.csv"`);
        return res.status(200).send(csv);
      }
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.default.Workbook();
      const worksheet = workbook.addWorksheet('DSA Results');
      worksheet.columns = [
        { header: 'User', key: 'user', width: 28 },
        { header: 'Email', key: 'email', width: 32 },
        { header: 'Problem', key: 'problem', width: 32 },
        { header: 'Verdict', key: 'verdict', width: 20 },
        { header: 'Score', key: 'score', width: 12 },
        { header: 'Weighted Score', key: 'weightedScore', width: 16 },
        { header: 'Runtime Ms', key: 'runtimeMs', width: 12 },
        { header: 'Updated At', key: 'updatedAt', width: 28 },
      ];
      rows.forEach((row) => worksheet.addRow({
        user: row[0],
        email: row[1],
        problem: row[2],
        verdict: row[3],
        score: row[4],
        weightedScore: row[5],
        runtimeMs: row[6],
        updatedAt: row[7],
      }));
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${safeEventTitle}-${safeRoundTitle}-dsa-results.xlsx"`);
      await workbook.xlsx.write(res);
      return res.end();
    }

    const submissions = await prisma.competitionSubmission.findMany({
      where: { roundId: round.id },
      include: {
        team: {
          select: {
            teamName: true,
            members: {
              include: { user: { select: { name: true } } },
            },
          },
        },
        user: {
          select: { name: true },
        },
      },
    });

    const sorted = [...submissions].sort((a, b) => {
      const aRank = a.rank ?? Number.MAX_SAFE_INTEGER;
      const bRank = b.rank ?? Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      const aScore = a.score ?? Number.NEGATIVE_INFINITY;
      const bScore = b.score ?? Number.NEGATIVE_INFINITY;
      if (aScore !== bScore) return bScore - aScore;
      return a.submittedAt.getTime() - b.submittedAt.getTime();
    });

    const rows = sorted.map((submission) => {
      const members = submission.team
        ? submission.team.members.map((member) => member.user.name).join(', ')
        : submission.user.name;
      return [
        String(submission.rank ?? ''),
        submission.team?.teamName || submission.user.name,
        submission.score !== null ? String(submission.score) : '',
        members,
        submission.submittedAt.toISOString(),
        submission.isAutoSubmit ? 'AUTO' : 'MANUAL',
      ];
    });

    const safeRoundTitle = round.title.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60) || 'round';
    const safeEventTitle = round.event.title.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60) || 'event';

    if (format === 'csv') {
      const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
      const header = ['Rank', 'Team', 'Score', 'Members', 'Submitted At', 'Submission Mode'];
      const csv = [header, ...rows]
        .map((row) => row.map((cell) => escapeCell(cell)).join(','))
        .join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeEventTitle}-${safeRoundTitle}-results.csv"`);
      return res.status(200).send(csv);
    }

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.default.Workbook();
    workbook.creator = 'code.scriet';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Results');
    worksheet.columns = [
      { header: 'Rank', key: 'rank', width: 10 },
      { header: 'Team', key: 'team', width: 28 },
      { header: 'Score', key: 'score', width: 12 },
      { header: 'Members', key: 'members', width: 42 },
      { header: 'Submitted At', key: 'submittedAt', width: 28 },
      { header: 'Submission Mode', key: 'submissionMode', width: 18 },
    ];

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF7C3AED' },
    };
    worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 24;

    rows.forEach((row) => {
      worksheet.addRow({
        rank: row[0] || '-',
        team: row[1] || '-',
        score: row[2] || '-',
        members: row[3] || '-',
        submittedAt: row[4],
        submissionMode: row[5],
      });
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 1) return;
      row.alignment = { vertical: 'middle', wrapText: true };
      row.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: rowNumber % 2 === 0 ? 'FFF5F3FF' : 'FFFFFFFF' },
      };
    });

    const infoSheet = workbook.addWorksheet('Round Info');
    infoSheet.addRow(['Event', round.event.title]);
    infoSheet.addRow(['Round', round.title]);
    infoSheet.addRow(['Status', round.status]);
    infoSheet.addRow(['Total Submissions', String(sorted.length)]);
    infoSheet.addRow(['Exported At', new Date().toISOString()]);
    infoSheet.getColumn(1).width = 20;
    infoSheet.getColumn(1).font = { bold: true };
    infoSheet.getColumn(2).width = 46;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeEventTitle}-${safeRoundTitle}-results.xlsx"`);
    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    logger.error('Failed to export competition results', {
      roundId: req.params.roundId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to export results');
  }
});

competitionRouter.get('/:roundId/results', async (req: Request, res: Response) => {
  try {
    const round = await prisma.competitionRound.findUnique({
      where: { id: req.params.roundId },
      select: {
        id: true,
        title: true,
        status: true,
        roundType: true,
        startedAt: true,
        penaltyModel: true,
        event: {
          select: { id: true, title: true },
        },
        problems: {
          orderBy: { displayOrder: 'asc' },
          include: { problem: { select: { id: true, title: true, slug: true } } },
        },
      },
    });

    if (!round) return ApiResponse.notFound(res, 'Round not found');
    if (round.status !== 'FINISHED') {
      return ApiResponse.forbidden(res, 'Results are not published yet');
    }

    if (round.roundType === 'DSA') {
      // Team-aware standings (per the round's teamAggregation for team events).
      const lb = await computeContestLeaderboard(round.id, 10);
      const results = lb?.results ?? [];

      return ApiResponse.success(res, {
        round: {
          id: round.id,
          title: round.title,
          eventId: round.event.id,
          eventTitle: round.event.title,
          roundType: round.roundType,
          penaltyModel: round.penaltyModel,
          problems: round.problems.map((link) => ({
            id: link.problem.id,
            slug: link.problem.slug,
            title: link.problem.title,
            points: link.points,
            displayOrder: link.displayOrder,
          })),
        },
        results,
      });
    }

    const submissions = await prisma.competitionSubmission.findMany({
      where: { roundId: round.id },
      include: {
        team: {
          select: {
            id: true,
            teamName: true,
            members: {
              include: { user: { select: { id: true, name: true } } },
            },
          },
        },
        user: { select: { id: true, name: true } },
      },
    });
    const sorted = [...submissions].sort((a, b) => {
      const aRank = a.rank ?? Number.MAX_SAFE_INTEGER;
      const bRank = b.rank ?? Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      const aScore = a.score ?? Number.NEGATIVE_INFINITY;
      const bScore = b.score ?? Number.NEGATIVE_INFINITY;
      if (aScore !== bScore) return bScore - aScore;
      return a.submittedAt.getTime() - b.submittedAt.getTime();
    });

    return ApiResponse.success(res, {
      round: {
        id: round.id,
        title: round.title,
        eventId: round.event.id,
        eventTitle: round.event.title,
      },
      results: sorted.map((submission) => ({
        id: submission.id,
        rank: submission.rank,
        teamName: submission.team?.teamName || submission.user.name,
        members: submission.team
          ? submission.team.members.map((member) => member.user.name)
          : [submission.user.name],
        score: submission.score,
        submittedAt: submission.submittedAt.toISOString(),
        elapsedSeconds: round.startedAt
          ? Math.max(0, Math.floor((submission.submittedAt.getTime() - round.startedAt.getTime()) / 1000))
          : null,
        isAutoSubmit: submission.isAutoSubmit,
        userName: submission.user.name,
      })),
    });
  } catch (error) {
    logger.error('Failed to fetch public competition results', {
      roundId: req.params.roundId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to fetch results');
  }
});

competitionRouter.post('/:roundId/publish-as-practice', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req)!;
    const round = await prisma.competitionRound.findUnique({
      where: { id: req.params.roundId },
      include: { problems: true },
    });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
    if (round.roundType !== 'DSA') return ApiResponse.badRequest(res, 'Only DSA rounds can be published as practice');
    if (round.status !== 'FINISHED') return ApiResponse.badRequest(res, 'Round must be finished before publishing problems');

    await prisma.problem.updateMany({
      where: { id: { in: round.problems.map((link) => link.problemId) } },
      data: { isPublished: true },
    });
    await auditLog(admin.id, 'COMPETITION_DSA_PUBLISHED_AS_PRACTICE', 'CompetitionRound', round.id, {
      problemIds: round.problems.map((link) => link.problemId),
    });
    return ApiResponse.success(res, { success: true });
  } catch (error) {
    logger.error('Failed to publish contest problems as practice', {
      roundId: req.params.roundId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to publish problems');
  }
});

competitionRouter.post('/:roundId/raise-cap', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req)!;
    const parsed = z.object({
      userId: z.string().uuid().optional(),
      problemId: z.string().uuid().optional(),
      newCap: z.number().int().min(1).max(100),
    }).safeParse(req.body);
    if (!parsed.success) return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid cap payload');

    const round = await prisma.competitionRound.findUnique({
      where: { id: req.params.roundId },
      include: {
        problems: true,
        event: {
          select: {
            registrations: { select: { userId: true } },
          },
        },
      },
    });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
    if (round.roundType !== 'DSA') return ApiResponse.badRequest(res, 'Cap overrides apply to DSA rounds only');

    const problemIds = parsed.data.problemId
      ? [parsed.data.problemId]
      : round.problems.map((link) => link.problemId);
    const userIds = parsed.data.userId
      ? [parsed.data.userId]
      : Array.from(new Set(round.event.registrations.map((registration) => registration.userId)));

    // One set-based statement replaces users×problems individual upserts in a
    // single transaction (event-wide raise on a 200-user, 4-problem round was
    // 800 statements on one pooled connection). CROSS JOIN of the two unnested
    // arrays generates every (user, problem) pair; existing counters only get
    // cap_override updated (count untouched), new ones insert at count 0 —
    // identical to the old upsert. id (client-side uuid) and updated_at
    // (@updatedAt) have no DB defaults, so raw SQL supplies both.
    await prisma.$executeRaw`
      INSERT INTO problem_submission_counters (id, user_id, problem_id, context_type, context_key, count, cap_override, updated_at)
      SELECT gen_random_uuid()::text, u.user_id, p.problem_id, 'CONTEST'::"ProblemContextType", ${round.id}, 0, ${parsed.data.newCap}, now()
      FROM unnest(${userIds}::text[]) AS u(user_id)
      CROSS JOIN unnest(${problemIds}::text[]) AS p(problem_id)
      ON CONFLICT (user_id, problem_id, context_type, context_key)
      DO UPDATE SET cap_override = EXCLUDED.cap_override, updated_at = now();
    `;
    await auditLog(admin.id, 'COMPETITION_DSA_CAP_RAISED', 'CompetitionRound', round.id, parsed.data);
    return ApiResponse.success(res, { success: true, affectedUsers: userIds.length, affectedProblems: problemIds.length });
  } catch (error) {
    logger.error('Failed to raise DSA submit cap', {
      roundId: req.params.roundId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to raise cap');
  }
});

competitionRouter.put('/:roundId', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req)!;
    const parsed = updateRoundSchema.safeParse(req.body);
    if (!parsed.success) {
      return ApiResponse.error(res, {
        code: ErrorCodes.VALIDATION_ERROR,
        message: parsed.error.errors[0]?.message || 'Invalid payload',
        status: 400,
      });
    }

    const round = await prisma.competitionRound.findUnique({
      where: { id: req.params.roundId },
      select: {
        id: true,
        status: true,
        roundType: true,
        eventId: true,
        title: true,
        participantScope: true,
        leadersOnly: true,
        allowedTeamIds: true,
        event: {
          select: {
            teamRegistration: true,
          },
        },
      },
    });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
    if (round.status === 'ACTIVE') {
      return ApiResponse.badRequest(res, 'Cannot edit an active round. Lock it first.');
    }

    if (!round.event.teamRegistration && parsed.data.participantScope === 'SELECTED_TEAMS') {
      return ApiResponse.badRequest(res, 'Selected teams mode is only available for team events.');
    }
    if (!round.event.teamRegistration && parsed.data.leadersOnly === true) {
      return ApiResponse.badRequest(res, 'Leader-only mode is only available for team events.');
    }
    if (
      parsed.data.allowedTeamIds !== undefined
      && parsed.data.participantScope === undefined
      && round.participantScope === 'ALL'
    ) {
      return ApiResponse.badRequest(
        res,
        'Set participant scope to selected teams before choosing teams.',
      );
    }

    const requestedScope = parsed.data.participantScope ?? round.participantScope;
    const nextLeadersOnly = round.event.teamRegistration ? (parsed.data.leadersOnly ?? round.leadersOnly) : false;
    const nextRoundType = parsed.data.roundType ?? round.roundType;
    let nextAllowedTeamIds = round.allowedTeamIds;
    if (!round.event.teamRegistration || requestedScope === 'ALL') {
      nextAllowedTeamIds = [];
    } else {
      const candidateTeamIds = normalizeTeamIds(
        parsed.data.allowedTeamIds !== undefined
          ? parsed.data.allowedTeamIds
          : round.allowedTeamIds,
      );
      if (candidateTeamIds.length === 0) {
        return ApiResponse.badRequest(res, 'Select at least one team for selected teams mode.');
      }
      const validTeams = await prisma.eventTeam.findMany({
        where: {
          eventId: round.eventId,
          id: { in: candidateTeamIds },
        },
        select: { id: true },
      });
      if (validTeams.length !== candidateTeamIds.length) {
        return ApiResponse.badRequest(res, 'One or more selected teams are invalid for this event.');
      }
      nextAllowedTeamIds = candidateTeamIds;
    }

    const problemPayloadProvided = parsed.data.problems !== undefined || parsed.data.problemIds !== undefined;
    const linkedProblems = normalizeRoundProblems(parsed.data);
    if (nextRoundType === 'DSA') {
      if (round.roundType !== 'DSA' && linkedProblems.length === 0) {
        return ApiResponse.badRequest(res, 'Select at least one problem when switching to DSA.');
      }
      if (problemPayloadProvided) {
        if (linkedProblems.length === 0) return ApiResponse.badRequest(res, 'Select at least one problem for a DSA round.');
        const existingProblems = await prisma.problem.findMany({
          where: { id: { in: linkedProblems.map((item) => item.problemId) } },
          select: { id: true },
        });
        if (existingProblems.length !== linkedProblems.length) {
          return ApiResponse.badRequest(res, 'One or more selected problems do not exist.');
        }
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.competitionRound.update({
        where: { id: round.id },
        data: {
          ...(parsed.data.title !== undefined ? { title: sanitizeText(parsed.data.title).trim() } : {}),
          ...(parsed.data.description !== undefined ? { description: sanitizeText(parsed.data.description).trim() || null } : {}),
          ...(parsed.data.duration !== undefined ? { duration: parsed.data.duration } : {}),
          roundType: nextRoundType,
          participantScope: (!round.event.teamRegistration || requestedScope === 'ALL') ? 'ALL' : 'SELECTED_TEAMS',
          leadersOnly: nextLeadersOnly,
          allowedTeamIds: nextAllowedTeamIds,
          targetImageUrl: nextRoundType === 'DSA'
            ? null
            : (parsed.data.targetImageUrl !== undefined ? parsed.data.targetImageUrl || null : undefined),
          ...(parsed.data.finalWeight !== undefined ? { finalWeight: parsed.data.finalWeight } : {}),
          ...(parsed.data.proctored !== undefined ? { proctored: parsed.data.proctored } : {}),
          ...(parsed.data.penaltyModel !== undefined ? { penaltyModel: parsed.data.penaltyModel } : {}),
          ...(parsed.data.teamAggregation !== undefined ? { teamAggregation: parsed.data.teamAggregation } : {}),
          ...(parsed.data.leaderboardFreezeMinutes !== undefined ? { leaderboardFreezeMinutes: parsed.data.leaderboardFreezeMinutes } : {}),
          ...(parsed.data.difficultyWeights !== undefined ? { difficultyWeights: parsed.data.difficultyWeights ?? Prisma.DbNull } : {}),
        },
      });
      if (nextRoundType === 'IMAGE_TARGET') {
        await tx.competitionRoundProblem.deleteMany({ where: { roundId: round.id } });
      } else if (problemPayloadProvided) {
        await tx.competitionRoundProblem.deleteMany({ where: { roundId: round.id } });
        await tx.competitionRoundProblem.createMany({
          data: linkedProblems.map((item) => ({
            roundId: round.id,
            problemId: item.problemId,
            points: item.points,
            displayOrder: item.displayOrder,
          })),
        });
      }
      return saved;
    });

    await auditLog(admin.id, 'COMPETITION_ROUND_UPDATED', 'CompetitionRound', updated.id, {
      eventId: updated.eventId,
      title: updated.title,
    });

    return ApiResponse.success(res, {
      round: {
        ...updated,
        startedAt: updated.startedAt?.toISOString(),
        lockedAt: updated.lockedAt?.toISOString(),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to update competition round', {
      roundId: req.params.roundId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to update round');
  }
});

competitionRouter.delete('/:roundId', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req)!;
    const round = await prisma.competitionRound.findUnique({
      where: { id: req.params.roundId },
      select: { id: true, status: true, eventId: true, title: true },
    });
    if (!round) return ApiResponse.notFound(res, 'Round not found');

    const timer = activeTimers.get(round.id);
    if (timer) clearTimeout(timer);
    activeTimers.delete(round.id);

    await prisma.competitionRound.delete({
      where: { id: round.id },
    });
    // Deleting a live round leaves priority mode + drops its in-memory realtime state.
    if (round.status === 'ACTIVE') decActiveRounds();
    evictContestRoom(round.id);

    await auditLog(admin.id, 'COMPETITION_ROUND_DELETED', 'CompetitionRound', round.id, {
      title: round.title,
      eventId: round.eventId,
    });

    return ApiResponse.success(res, { message: 'Round deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete competition round', {
      roundId: req.params.roundId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to delete round');
  }
});

// ─── Proctoring (Phase C) ───────────────────────────────────────────────────
// Server-enforced anti-cheat lock. The contestant's client force-submits its draft
// then reports the violation; for a proctored round this LOCKS the participant and the
// submit/run paths reject until an admin unlocks. Detection is client-reported (a
// deterrent, not airtight) — the lock itself is the server-side teeth.

const violationSchema = z.object({
  kind: z.enum(['BLUR', 'HIDDEN', 'CLICK_OUT', 'FULLSCREEN_EXIT', 'COPY_PASTE', 'OTHER']),
  detail: z.string().max(500).optional(),
});

// Server-side teeth of the proctor lock: the IMAGE_TARGET save/submit paths consult
// this (the DSA run/submit path checks the same row inside validateProblemContext).
async function isParticipantLocked(roundId: string, userId: string): Promise<boolean> {
  const state = await prisma.competitionParticipantState.findUnique({
    where: { roundId_userId: { roundId, userId } },
    select: { locked: true },
  });
  return Boolean(state?.locked);
}

function mapRoundError(res: Response, error: unknown, fallback: string): Response {
  const err = error as { status?: number; code?: string; message?: string };
  if (err.status && err.code && err.message) {
    return ApiResponse.error(res, { code: err.code, message: err.message, status: err.status });
  }
  logger.error(fallback, { error: error instanceof Error ? error.message : String(error) });
  return ApiResponse.internal(res, fallback);
}

competitionRouter.post('/:roundId/proctor/violation', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req)!;
    const parsed = violationSchema.safeParse(req.body);
    if (!parsed.success) {
      return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid violation');
    }
    const round = await ensureRegisteredForRound(req.params.roundId, user.id);
    // Lock only a proctored round that is still live/finalizing; a violation reported
    // after the round ends is logged but never locks (nothing left to protect).
    const roundLockable = round.proctored && (round.status === 'ACTIVE' || round.status === 'LOCKED');
    const instant = isInstantViolation(parsed.data.kind);
    const now = new Date();
    const reason = `Proctor: ${parsed.data.kind}`;

    // Log the violation + decide the lock atomically. Instant kinds (paste / fullscreen
    // exit) lock only once this participant's instant-violation tally — counted inside the
    // txn so it includes the row just written — passes the budget; tab-away locks at once.
    const { shouldLock, violationCount, instantRemaining } = await prisma.$transaction(async (tx) => {
      await tx.competitionViolation.create({
        data: { roundId: round.id, userId: user.id, kind: parsed.data.kind, detail: parsed.data.detail ? sanitizeText(parsed.data.detail) : null },
      });
      let lock = roundLockable;
      let remaining: number | null = null;
      if (roundLockable && instant) {
        const instantCount = await tx.competitionViolation.count({
          where: { roundId: round.id, userId: user.id, kind: { in: [...INSTANT_VIOLATION_KINDS] } },
        });
        lock = instantCount > INSTANT_VIOLATION_BUDGET;
        remaining = Math.max(0, INSTANT_VIOLATION_BUDGET + 1 - instantCount);
      }
      const state = await tx.competitionParticipantState.upsert({
        where: { roundId_userId: { roundId: round.id, userId: user.id } },
        create: {
          roundId: round.id, userId: user.id, violationCount: 1, lastViolationAt: now, lastSeenAt: now,
          locked: lock, lockReason: lock ? reason : null, lockedAt: lock ? now : null,
        },
        update: {
          violationCount: { increment: 1 }, lastViolationAt: now, lastSeenAt: now,
          ...(lock ? { locked: true, lockReason: reason, lockedAt: now } : {}),
        },
        select: { violationCount: true },
      });
      return { shouldLock: lock, violationCount: state.violationCount, instantRemaining: remaining };
    });

    // Push to the admin monitor live (violation feed + participant lock state); the lock
    // also rides to the participant so a parallel tab/device reflects it without reload.
    // userName + detail ride along so the monitor's live log can render a self-sufficient,
    // human-readable row ("Pasted code") without a name lookup.
    emitViolation(round.id, user.id, user.name, parsed.data.kind, violationCount, parsed.data.detail ?? null);
    if (shouldLock) emitProctor(round.id, user.id, true, reason);
    // `warning` marks an under-budget instant violation (counted, not locked) so the arena
    // can flash a "stop pasting / stay in fullscreen — N left" toast instead of locking.
    return ApiResponse.success(res, {
      locked: shouldLock,
      warning: !shouldLock && instant && roundLockable,
      remaining: instantRemaining,
    });
  } catch (error) {
    return mapRoundError(res, error, 'Failed to record violation');
  }
});

competitionRouter.post('/:roundId/proctor/heartbeat', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req)!;
    const round = await ensureRegisteredForRound(req.params.roundId, user.id);
    const now = new Date();
    const state = await prisma.competitionParticipantState.upsert({
      where: { roundId_userId: { roundId: round.id, userId: user.id } },
      create: { roundId: round.id, userId: user.id, lastSeenAt: now },
      update: { lastSeenAt: now },
      select: { locked: true, lockReason: true, violationCount: true },
    });
    // Heartbeat doubles as the arena's lock poll so an admin lock/unlock propagates.
    return ApiResponse.success(res, { locked: state.locked, lockReason: state.lockReason, violationCount: state.violationCount });
  } catch (error) {
    return mapRoundError(res, error, 'Failed to record heartbeat');
  }
});

competitionRouter.get('/:roundId/proctor/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req)!;
    const round = await ensureRegisteredForRound(req.params.roundId, user.id);
    const state = await prisma.competitionParticipantState.findUnique({
      where: { roundId_userId: { roundId: round.id, userId: user.id } },
      select: { locked: true, lockReason: true, violationCount: true, lastSeenAt: true },
    });
    return ApiResponse.success(res, {
      locked: state?.locked ?? false,
      lockReason: state?.lockReason ?? null,
      violationCount: state?.violationCount ?? 0,
      proctored: round.proctored,
    });
  } catch (error) {
    return mapRoundError(res, error, 'Failed to fetch proctor state');
  }
});

competitionRouter.post('/:roundId/proctor/unlock/:userId', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req)!;
    const round = await prisma.competitionRound.findUnique({ where: { id: req.params.roundId }, select: { id: true, status: true } });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
    // Nothing to unlock once the contest has ended — finish already cleared every lock.
    if (round.status === 'FINISHED') return ApiResponse.badRequest(res, 'This round has ended');
    const now = new Date();
    await prisma.competitionParticipantState.upsert({
      where: { roundId_userId: { roundId: round.id, userId: req.params.userId } },
      create: { roundId: round.id, userId: req.params.userId, locked: false, unlockedBy: admin.id, unlockedAt: now },
      update: { locked: false, lockReason: null, unlockedBy: admin.id, unlockedAt: now },
    });
    // Push the unlock so the participant's arena clears its locked overlay live.
    emitProctor(round.id, req.params.userId, false, null);
    await auditLog(admin.id, 'COMPETITION_PROCTOR_UNLOCK', 'CompetitionRound', round.id, { userId: req.params.userId });
    return ApiResponse.success(res, { unlocked: true });
  } catch (error) {
    return mapRoundError(res, error, 'Failed to unlock participant');
  }
});

// Admin manual lock — the mirror of unlock, so an invigilator can freeze a participant
// directly (not only via a proctor violation).
competitionRouter.post('/:roundId/proctor/lock/:userId', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req)!;
    const round = await prisma.competitionRound.findUnique({ where: { id: req.params.roundId }, select: { id: true, status: true } });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
    // Locking only protects a live round (ACTIVE) or its lock-finalization window (LOCKED).
    if (!['ACTIVE', 'LOCKED'].includes(round.status)) {
      return ApiResponse.badRequest(res, 'Participants can only be locked while the round is live');
    }
    const now = new Date();
    await prisma.competitionParticipantState.upsert({
      where: { roundId_userId: { roundId: round.id, userId: req.params.userId } },
      create: { roundId: round.id, userId: req.params.userId, locked: true, lockReason: 'Locked by admin', lockedAt: now },
      update: { locked: true, lockReason: 'Locked by admin', lockedAt: now },
    });
    emitProctor(round.id, req.params.userId, true, 'Locked by admin');
    await auditLog(admin.id, 'COMPETITION_PROCTOR_LOCK', 'CompetitionRound', round.id, { userId: req.params.userId });
    return ApiResponse.success(res, { locked: true });
  } catch (error) {
    return mapRoundError(res, error, 'Failed to lock participant');
  }
});

// Extend an ACTIVE round by N minutes: bump duration, re-arm the auto-lock timer, push
// the change so every arena's countdown extends live.
competitionRouter.patch('/:roundId/extend', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req)!;
    const parsed = z.object({ addMinutes: z.number().int().min(1).max(600) }).safeParse(req.body);
    if (!parsed.success) return ApiResponse.badRequest(res, 'addMinutes (1–600) is required');
    const round = await prisma.competitionRound.findUnique({
      where: { id: req.params.roundId },
      select: { id: true, status: true, duration: true, startedAt: true },
    });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
    if (round.status !== 'ACTIVE' || !round.startedAt) return ApiResponse.badRequest(res, 'Only an active round can be extended');

    const newDuration = round.duration + parsed.data.addMinutes * 60;
    await prisma.competitionRound.update({ where: { id: round.id }, data: { duration: newDuration } });
    const remaining = Math.max(1, computeRemainingSeconds({ duration: newDuration, startedAt: round.startedAt }, Date.now()) ?? 1);
    scheduleRoundLock(round.id, remaining);
    emitRoundUpdate(round.id);
    await auditLog(admin.id, 'COMPETITION_ROUND_EXTENDED', 'CompetitionRound', round.id, { addMinutes: parsed.data.addMinutes, newDuration });
    return ApiResponse.success(res, { duration: newDuration, remainingSeconds: remaining });
  } catch (error) {
    return mapRoundError(res, error, 'Failed to extend round');
  }
});

// Rejudge every CONTEST submission for each of the round's problems (admin — e.g. after
// fixing test data), then push a fresh leaderboard. Reuses the bounded rejudge queue.
competitionRouter.post('/:roundId/rejudge', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req)!;
    const round = await prisma.competitionRound.findUnique({
      where: { id: req.params.roundId },
      select: { id: true, roundType: true, problems: { select: { problemId: true } } },
    });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
    if (round.roundType !== 'DSA') return ApiResponse.badRequest(res, 'Only DSA rounds can be rejudged');
    const jobIds = round.problems.map((link) =>
      enqueueRejudgeJob({ problemId: link.problemId, contextType: 'CONTEST', contextKey: round.id, requestedBy: admin.id }).id,
    );
    broadcastLeaderboard(round.id); // immediate refresh; jobs trickle in + the monitor poll catches up
    await auditLog(admin.id, 'COMPETITION_ROUND_REJUDGED', 'CompetitionRound', round.id, { problemCount: round.problems.length });
    return ApiResponse.success(res, { jobIds });
  } catch (error) {
    return mapRoundError(res, error, 'Failed to rejudge round');
  }
});

// ─── Live leaderboard / clarifications / monitor (Phase E) ───────────────────

// Live DSA leaderboard (works while ACTIVE). Non-admins inside the freeze window get a
// full freeze (board hidden) for the final N minutes; admins always see live. Team
// events aggregate per the round's teamAggregation (shared computeContestLeaderboard).
competitionRouter.get('/:roundId/leaderboard', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req)!;
    const isAdmin = hasPermission(user.role, 'ADMIN');
    const gate = await prisma.competitionRound.findUnique({ where: { id: req.params.roundId }, select: { eventId: true } });
    if (!gate) return ApiResponse.notFound(res, 'Round not found');
    if (!isAdmin) {
      const reg = await prisma.eventRegistration.findUnique({
        where: { userId_eventId: { userId: user.id, eventId: gate.eventId } },
        select: { id: true },
      });
      if (!reg) return ApiResponse.forbidden(res, 'Register for this event to view the leaderboard.');
    }
    const lb = await computeContestLeaderboard(req.params.roundId, 100);
    if (!lb) return ApiResponse.notFound(res, 'Round not found');
    if (lb.roundType !== 'DSA') {
      return ApiResponse.success(res, { roundType: lb.roundType, frozen: false, results: [], penaltyModel: lb.penaltyModel });
    }
    const frozen = !isAdmin && isLeaderboardFrozen(lb);
    return ApiResponse.success(res, {
      roundType: 'DSA',
      frozen,
      penaltyModel: lb.penaltyModel,
      results: frozen ? [] : lb.results,
    });
  } catch (error) {
    return mapRoundError(res, error, 'Failed to fetch leaderboard');
  }
});

competitionRouter.get('/:roundId/clarifications', authMiddleware, async (req: Request, res: Response) => {
  try {
    const items = await prisma.competitionClarification.findMany({
      where: { roundId: req.params.roundId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, message: true, createdAt: true },
    });
    return ApiResponse.success(res, { clarifications: items.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })) });
  } catch (error) {
    return mapRoundError(res, error, 'Failed to fetch clarifications');
  }
});

competitionRouter.post('/:roundId/clarifications', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req)!;
    const parsed = z.object({ message: z.string().min(1).max(2000) }).safeParse(req.body);
    if (!parsed.success) return ApiResponse.badRequest(res, 'Message is required');
    const round = await prisma.competitionRound.findUnique({ where: { id: req.params.roundId }, select: { id: true } });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
    const created = await prisma.competitionClarification.create({
      data: { roundId: round.id, message: sanitizeText(parsed.data.message), createdBy: admin.id },
      select: { id: true, message: true, createdAt: true },
    });
    const serialized = { ...created, createdAt: created.createdAt.toISOString() };
    emitClarification(round.id, serialized); // live push to every arena + the monitor
    await auditLog(admin.id, 'COMPETITION_CLARIFICATION', 'CompetitionRound', round.id, { clarificationId: created.id });
    return ApiResponse.created(res, { clarification: serialized });
  } catch (error) {
    return mapRoundError(res, error, 'Failed to post clarification');
  }
});

// Admin live monitor: per-user proctor state (online via lastSeenAt, lock, violations)
// merged with the DSA score (the user's own row, or their TEAM's row for team events),
// plus a recent submission feed. Polling-based fallback (also pushed via the relay).
competitionRouter.get('/:roundId/monitor', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const round = await prisma.competitionRound.findUnique({
      where: { id: req.params.roundId },
      select: { id: true, title: true, status: true, roundType: true, startedAt: true, duration: true, leaderboardFreezeMinutes: true },
    });
    if (!round) return ApiResponse.notFound(res, 'Round not found');

    const [states, dsaSubs, lb, violations] = await Promise.all([
      prisma.competitionParticipantState.findMany({
        where: { roundId: round.id },
        select: { userId: true, locked: true, lockReason: true, violationCount: true, lastViolationAt: true, lastSeenAt: true, user: { select: { name: true, email: true, avatar: true } } },
      }),
      // Bounded to the most-recent rows: this feeds the 30-row submission feed and
      // supplies submitter names, but is NOT the source of truth for the participant
      // set (that's `states` ∪ the leaderboard) — so we never load the whole CONTEST
      // submission table here. computeContestLeaderboard below scans submissions once
      // (cached) and already carries every scorer's score/rank/name.
      round.roundType === 'DSA'
        ? prisma.problemSubmission.findMany({
            where: { contextType: 'CONTEST', contextKey: round.id },
            orderBy: { updatedAt: 'desc' },
            take: 50,
            select: { id: true, problemId: true, verdict: true, score: true, updatedAt: true, user: { select: { id: true, name: true } } },
          })
        : Promise.resolve([] as Array<{ id: string; problemId: string; verdict: string; score: number; updatedAt: Date; user: { id: string; name: string } }>),
      computeContestLeaderboard(req.params.roundId, 1000),
      // Recent violation log so the monitor's live feed has history on first load (the
      // socket only carries events that happen after the page opens).
      prisma.competitionViolation.findMany({
        where: { roundId: round.id },
        orderBy: { at: 'desc' },
        take: 50,
        select: { id: true, userId: true, kind: true, detail: true, at: true, user: { select: { name: true } } },
      }),
    ]);

    // Map each user → their standings row. For team events the leaderboard rows are keyed
    // by teamId, so resolve a user to their team's row via teamByUser.
    const rowById = new Map((lb?.results ?? []).map((row) => [row.userId, row]));
    const scoreFor = (userId: string) => {
      const teamId = lb?.teamByUser?.get(userId)?.teamId;
      return rowById.get(teamId ?? userId) ?? null;
    };

    // Participant identity set: every contestant who loaded the arena has a state row,
    // and (for solo rounds) the leaderboard already keys a row per real userId — so we
    // union those two complete sources. The bounded recent-submitter list only
    // supplements names. (Team-round leaderboard rows are keyed by teamId, not userId,
    // so they're excluded here; team members are covered by their state rows.)
    const isTeamRound = Boolean(lb?.teamByUser);
    const submitterIds = dsaSubs.map((s) => s.user.id);
    const leaderboardUserIds = isTeamRound ? [] : (lb?.results ?? []).map((r) => r.userId);
    const userIds = new Set<string>([...states.map((s) => s.userId), ...submitterIds, ...leaderboardUserIds]);
    const stateByUser = new Map(states.map((s) => [s.userId, s]));
    const nameBySubmitter = new Map(dsaSubs.map((s) => [s.user.id, s.user.name]));
    const participants = Array.from(userIds).map((userId) => {
      const s = stateByUser.get(userId);
      const row = scoreFor(userId);
      // Solo leaderboard rows carry the user's own name; use it as a fallback so a
      // scorer outside the recent-submitter window still shows a real name.
      const leaderboardName = !isTeamRound ? row?.userName : undefined;
      return {
        userId,
        name: s?.user.name ?? nameBySubmitter.get(userId) ?? leaderboardName ?? 'Participant',
        email: s?.user.email ?? null,
        avatar: s?.user.avatar ?? null,
        teamName: lb?.teamByUser?.get(userId)?.teamName ?? null,
        locked: s?.locked ?? false,
        lockReason: s?.lockReason ?? null,
        violationCount: s?.violationCount ?? 0,
        lastViolationAt: s?.lastViolationAt?.toISOString() ?? null,
        lastSeenAt: s?.lastSeenAt?.toISOString() ?? null,
        score: row?.totalScore ?? 0,
        rank: row?.rank ?? null,
        penalty: row?.penalty ?? 0,
      };
    }).sort((a, b) => (b.score - a.score) || (a.name.localeCompare(b.name)));

    const recentSubmissions = [...dsaSubs]
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 30)
      .map((sub) => ({
        id: sub.id, userName: sub.user.name, problemId: sub.problemId,
        verdict: sub.verdict, score: sub.score, updatedAt: sub.updatedAt.toISOString(),
      }));

    const recentViolations = violations.map((v) => ({
      id: v.id,
      userId: v.userId,
      userName: v.user.name,
      kind: v.kind,
      detail: v.detail,
      at: v.at.toISOString(),
    }));

    return ApiResponse.success(res, {
      round: {
        id: round.id,
        title: round.title,
        status: round.status,
        roundType: round.roundType,
        startedAt: round.startedAt?.toISOString() ?? null,
        duration: round.duration,
        leaderboardFreezeMinutes: round.leaderboardFreezeMinutes,
      },
      participants,
      recentSubmissions,
      recentViolations,
    });
  } catch (error) {
    return mapRoundError(res, error, 'Failed to fetch monitor');
  }
});

// CSV export of the monitor (participants) or the violation log (?sheet=violations).
competitionRouter.get('/:roundId/monitor/export', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const round = await prisma.competitionRound.findUnique({ where: { id: req.params.roundId }, select: { id: true, title: true } });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
    const safeTitle = round.title.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60) || 'round';
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const send = (header: string[], rows: string[][], suffix: string) => {
      const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}-${suffix}.csv"`);
      return res.status(200).send(csv);
    };

    if (req.query.sheet === 'violations') {
      const violations = await prisma.competitionViolation.findMany({
        where: { roundId: round.id },
        orderBy: { at: 'desc' },
        take: 5000,
        select: { kind: true, detail: true, at: true, user: { select: { name: true, email: true } } },
      });
      return send(
        ['User', 'Email', 'Kind', 'Detail', 'At'],
        violations.map((v) => [v.user.name, v.user.email, v.kind, v.detail ?? '', v.at.toISOString()]),
        'violations',
      );
    }

    const [states, lb] = await Promise.all([
      prisma.competitionParticipantState.findMany({
        where: { roundId: round.id },
        select: { userId: true, locked: true, violationCount: true, lastSeenAt: true, user: { select: { name: true, email: true } } },
      }),
      computeContestLeaderboard(req.params.roundId, 100000),
    ]);
    const rowById = new Map((lb?.results ?? []).map((r) => [r.userId, r]));
    const scoreFor = (userId: string) => rowById.get(lb?.teamByUser?.get(userId)?.teamId ?? userId) ?? null;
    return send(
      ['User', 'Email', 'Team', 'Score', 'Rank', 'Penalty', 'Violations', 'Locked', 'Last seen'],
      states.map((s) => {
        const row = scoreFor(s.userId);
        return [
          s.user.name, s.user.email, lb?.teamByUser?.get(s.userId)?.teamName ?? '',
          String(row?.totalScore ?? 0), String(row?.rank ?? ''), String(row?.penalty ?? 0),
          String(s.violationCount), s.locked ? 'YES' : 'no', s.lastSeenAt?.toISOString() ?? '',
        ];
      }),
      'monitor',
    );
  } catch (error) {
    return mapRoundError(res, error, 'Failed to export monitor');
  }
});

// ─── Plagiarism (Phase H4) — admin-triggered, human-in-the-loop ──────────────
// Heuristic deterrent: per-problem code similarity over the round's CONTEST submissions,
// recorded as flagged pairs for ADMIN REVIEW. Never auto-penalizes. Gated on
// Settings.plagiarismCheckEnabled.
//
// This is the contest's HEAVIEST operation (O(N²) over up-to-100KB code blobs) and runs
// ENTIRELY on the (mostly idle) playground server: the main API ships only
// { roundId, problemIds, threshold } and the playground reads the code from the shared DB
// itself (per-problem, bounded memory) + computes — so the main API's 512MB never holds
// the N×M code blobs. The main API only persists the returned flags (authoritative writes
// stay here). When the relay isn't configured/down it falls back to an inline run.

type PlagiarismFlagRow = { problemId: string } & PlagiarismPair;

// Preferred path: full offload (DB read of code + O(N²) both on the idle playground).
// Returns flagged pairs tagged with problemId, or null when the relay is unavailable/
// failed → the caller falls back to an inline run.
async function offloadRoundPlagiarism(
  roundId: string,
  problemIds: string[],
  threshold: number,
): Promise<PlagiarismFlagRow[] | null> {
  const base = getPlaygroundRelayBase();
  const secret = getInternalApiSecret();
  if (!base || !secret) return null;
  try {
    const resp = await fetch(`${base}/internal/plagiarism`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ roundId, problemIds, threshold }),
      signal: AbortSignal.timeout(60_000), // the DB read + O(N²) both happen there
    });
    if (resp.ok) {
      const json = await resp.json() as { pairs?: PlagiarismFlagRow[] };
      if (Array.isArray(json.pairs)) return json.pairs;
    }
    logger.warn('Plagiarism offload returned non-OK; falling back to inline', { status: resp.status });
  } catch (error) {
    logger.warn('Plagiarism offload failed; falling back to inline', { error: error instanceof Error ? error.message : String(error) });
  }
  return null;
}

// Above this many CONTEST submissions we refuse to pull every code blob into the main API
// at once (each is ≤100KB; the O(N²) compare holds them all). At ~600 that's ~60MB worst
// case — past it the 512MB box risks OOM, so we require the playground offload instead.
const MAX_INLINE_PLAGIARISM_SUBMISSIONS = 600;

// Degraded fallback (relay unavailable): fetch the code on the main API and compute here.
// Heavier on the 512MB box, so it's the last resort only.
async function inlineRoundPlagiarism(
  roundId: string,
  problemIds: Set<string>,
  threshold: number,
): Promise<PlagiarismFlagRow[]> {
  // Bound memory before pulling code blobs: a large round inline would risk OOM, so cap it
  // and direct the admin to the offload (configure PLAYGROUND_API_URL + INTERNAL_API_SECRET).
  const count = await prisma.problemSubmission.count({ where: { contextType: 'CONTEST', contextKey: roundId } });
  if (count > MAX_INLINE_PLAGIARISM_SUBMISSIONS) {
    throw Object.assign(new Error('inline plagiarism too large'), {
      status: 503,
      code: 'PLAGIARISM_OFFLOAD_REQUIRED',
      message: `This round has ${count} submissions — too many to scan on the main server. Configure the playground offload (PLAYGROUND_API_URL + INTERNAL_API_SECRET) and retry.`,
    });
  }
  const submissions = await prisma.problemSubmission.findMany({
    where: { contextType: 'CONTEST', contextKey: roundId },
    select: { problemId: true, userId: true, code: true, user: { select: { name: true } } },
  });
  const byProblem = new Map<string, PlagiarismInput[]>();
  for (const s of submissions) {
    if (!problemIds.has(s.problemId)) continue;
    const list = byProblem.get(s.problemId) ?? [];
    list.push({ userId: s.userId, userName: s.user.name, code: s.code });
    byProblem.set(s.problemId, list);
  }
  const flags: PlagiarismFlagRow[] = [];
  for (const [problemId, items] of byProblem) {
    if (items.length < 2) continue;
    for (const p of findPlagiarismPairs(items, threshold)) flags.push({ problemId, ...p });
  }
  return flags;
}

competitionRouter.post('/:roundId/plagiarism/run', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req)!;
    const settings = await getCachedSettings();
    if (settings?.plagiarismCheckEnabled !== true) {
      return ApiResponse.badRequest(res, 'Plagiarism checking is disabled in settings.');
    }
    const parsed = z.object({ threshold: z.number().min(0.5).max(1).optional() }).safeParse(req.body ?? {});
    const threshold = parsed.success ? (parsed.data.threshold ?? 0.8) : 0.8;

    const round = await prisma.competitionRound.findUnique({
      where: { id: req.params.roundId },
      select: { id: true, roundType: true, problems: { select: { problemId: true } } },
    });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
    if (round.roundType !== 'DSA') return ApiResponse.badRequest(res, 'Plagiarism check applies to DSA rounds only');

    const problemIdList = round.problems.map((p) => p.problemId);

    // Heaviest part runs on the playground (it reads the code from the DB itself); the
    // main API holds NO code blobs on the happy path. Inline only when the relay is down.
    const pairRows = await offloadRoundPlagiarism(round.id, problemIdList, threshold)
      ?? await inlineRoundPlagiarism(round.id, new Set(problemIdList), threshold);
    const flags = pairRows.map((p) => ({ roundId: round.id, ...p }));

    // Replace only PENDING flags; never clobber a pair an admin already reviewed.
    const written = await prisma.$transaction(async (tx) => {
      const reviewed = await tx.competitionPlagiarismFlag.findMany({
        where: { roundId: round.id, status: { not: 'PENDING' } },
        select: { problemId: true, userAId: true, userBId: true },
      });
      const reviewedKey = new Set(reviewed.map((r) => `${r.problemId}|${r.userAId}|${r.userBId}`));
      await tx.competitionPlagiarismFlag.deleteMany({ where: { roundId: round.id, status: 'PENDING' } });
      const fresh = flags.filter((f) => !reviewedKey.has(`${f.problemId}|${f.userAId}|${f.userBId}`));
      if (fresh.length) await tx.competitionPlagiarismFlag.createMany({ data: fresh, skipDuplicates: true });
      return fresh.length;
    });

    await auditLog(admin.id, 'COMPETITION_PLAGIARISM_RUN', 'CompetitionRound', round.id, { threshold, flagged: written });
    return ApiResponse.success(res, { flagged: written, threshold });
  } catch (error) {
    return mapRoundError(res, error, 'Failed to run plagiarism check');
  }
});

competitionRouter.get('/:roundId/plagiarism', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const round = await prisma.competitionRound.findUnique({
      where: { id: req.params.roundId },
      select: { id: true, problems: { select: { problemId: true, problem: { select: { title: true } } } } },
    });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
    const titleByProblem = new Map(round.problems.map((p) => [p.problemId, p.problem.title]));
    const flags = await prisma.competitionPlagiarismFlag.findMany({
      where: { roundId: round.id },
      orderBy: [{ status: 'asc' }, { similarity: 'desc' }],
      take: 500,
    });
    return ApiResponse.success(res, {
      flags: flags.map((f) => ({
        id: f.id,
        problemId: f.problemId,
        problemTitle: titleByProblem.get(f.problemId) ?? 'Problem',
        userAId: f.userAId, userAName: f.userAName,
        userBId: f.userBId, userBName: f.userBName,
        similarity: f.similarity,
        status: f.status,
        reviewedBy: f.reviewedBy,
        reviewedAt: f.reviewedAt?.toISOString() ?? null,
        createdAt: f.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return mapRoundError(res, error, 'Failed to fetch plagiarism flags');
  }
});

competitionRouter.patch('/:roundId/plagiarism/:flagId', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req)!;
    const parsed = z.object({ status: z.enum(['PENDING', 'REVIEWED', 'DISMISSED']) }).safeParse(req.body);
    if (!parsed.success) return ApiResponse.badRequest(res, 'status must be PENDING, REVIEWED, or DISMISSED');
    const existing = await prisma.competitionPlagiarismFlag.findUnique({ where: { id: req.params.flagId }, select: { id: true, roundId: true } });
    if (!existing || existing.roundId !== req.params.roundId) return ApiResponse.notFound(res, 'Flag not found in this round');
    const updated = await prisma.competitionPlagiarismFlag.update({
      where: { id: req.params.flagId },
      data: {
        status: parsed.data.status,
        reviewedBy: parsed.data.status === 'PENDING' ? null : admin.email,
        reviewedAt: parsed.data.status === 'PENDING' ? null : new Date(),
      },
      select: { id: true, status: true, reviewedBy: true, reviewedAt: true },
    });
    await auditLog(admin.id, 'COMPETITION_PLAGIARISM_REVIEW', 'CompetitionPlagiarismFlag', updated.id, { status: updated.status });
    return ApiResponse.success(res, { flag: { ...updated, reviewedAt: updated.reviewedAt?.toISOString() ?? null } });
  } catch (error) {
    return mapRoundError(res, error, 'Failed to update flag');
  }
});

// Graceful shutdown: clear all scheduled auto-lock timers to prevent orphaned callbacks
function cleanupTimers() {
  for (const [roundId, timer] of activeTimers) {
    clearTimeout(timer);
    logger.info('Cleared competition timer on shutdown', { roundId });
  }
  activeTimers.clear();
}
process.on('SIGTERM', cleanupTimers);
process.on('SIGINT', cleanupTimers);

export default competitionRouter;
