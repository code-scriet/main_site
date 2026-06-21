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
import { buildDsaLeaderboard } from '../utils/contestScoring.js';
import { incActiveRounds, decActiveRounds, setActiveRoundCount } from '../competition/contestMode.js';
import { emitRoundStatus, emitClarification, emitProctor, emitViolation, evictContestRoom } from '../competition/competitionRealtime.js';

const competitionRouter = Router();
const activeTimers = new Map<string, NodeJS.Timeout>();

// Reject malformed ids before they hit Prisma — every competition path param
// is a uuid PK. Mirrors the router.param guards in users.ts / quizRouter.ts.
competitionRouter.param('roundId', uuidParamGuard('round ID'));
competitionRouter.param('eventId', uuidParamGuard('event ID'));
competitionRouter.param('submissionId', uuidParamGuard('submission ID'));
competitionRouter.param('userId', uuidParamGuard('user ID'));

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
      { score: 'desc' },
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

    return ApiResponse.success(res, {
      rounds: rounds.map((round) => ({
        roundId: round.id,
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
      })),
    });
  } catch (error) {
    logger.error('Failed to fetch competition results summary', {
      eventId: req.params.eventId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to fetch competition results summary');
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
      select: { id: true, status: true, duration: true, eventId: true, title: true },
    });

    if (!round) return ApiResponse.notFound(res, 'Round not found');
    if (round.status !== 'DRAFT') {
      return ApiResponse.badRequest(res, 'Only draft rounds can be started');
    }

    const startedAt = new Date();
    const updated = await withRetry(() => prisma.competitionRound.update({
      where: { id: round.id },
      data: { status: 'ACTIVE', startedAt, lockedAt: null },
    }));

    scheduleRoundLock(round.id, round.duration);
    // DRAFT → ACTIVE: enter contest priority mode + push synced start to the lobby.
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
      const updated = await prisma.competitionRound.update({
        where: { id: round.id },
        data: { status: 'FINISHED' },
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
    if (!['JUDGING', 'FINISHED'].includes(round.status)) {
      return ApiResponse.badRequest(res, 'Scores can only be updated in judging or finished rounds');
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
        include: { user: { select: { name: true, email: true } }, problem: { select: { title: true } } },
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
      const submissions = await prisma.problemSubmission.findMany({
        where: { contextType: 'CONTEST', contextKey: round.id },
        include: { user: { select: { id: true, name: true, avatar: true } } },
      });
      const results = buildDsaLeaderboard(
        round.problems,
        submissions,
        round.startedAt ? round.startedAt.getTime() : null,
        round.penaltyModel,
        10,
      );

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
    const shouldLock = round.proctored && (round.status === 'ACTIVE' || round.status === 'LOCKED');
    const now = new Date();
    const reason = `Proctor: ${parsed.data.kind}`;
    await prisma.$transaction([
      prisma.competitionViolation.create({
        data: { roundId: round.id, userId: user.id, kind: parsed.data.kind, detail: parsed.data.detail ? sanitizeText(parsed.data.detail) : null },
      }),
      prisma.competitionParticipantState.upsert({
        where: { roundId_userId: { roundId: round.id, userId: user.id } },
        create: {
          roundId: round.id, userId: user.id, violationCount: 1, lastViolationAt: now, lastSeenAt: now,
          locked: shouldLock, lockReason: shouldLock ? reason : null, lockedAt: shouldLock ? now : null,
        },
        update: {
          violationCount: { increment: 1 }, lastViolationAt: now, lastSeenAt: now,
          ...(shouldLock ? { locked: true, lockReason: reason, lockedAt: now } : {}),
        },
      }),
    ]);
    // Push to the admin monitor live (violation feed + participant lock state); the lock
    // also rides to the participant so a parallel tab/device reflects it without reload.
    const state = await prisma.competitionParticipantState.findUnique({
      where: { roundId_userId: { roundId: round.id, userId: user.id } },
      select: { violationCount: true },
    });
    emitViolation(round.id, user.id, parsed.data.kind, state?.violationCount ?? 1);
    if (shouldLock) emitProctor(round.id, user.id, true, reason);
    return ApiResponse.success(res, { locked: shouldLock });
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
    const round = await prisma.competitionRound.findUnique({ where: { id: req.params.roundId }, select: { id: true } });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
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

// ─── Live leaderboard / clarifications / monitor (Phase E) ───────────────────

const DSA_LB_SELECT = {
  orderBy: { displayOrder: 'asc' as const },
  select: { problemId: true, points: true, problem: { select: { title: true } } },
};

// Live DSA leaderboard (works while ACTIVE). Non-admins inside the freeze window get a
// full freeze (board hidden) for the final N minutes; admins always see live.
competitionRouter.get('/:roundId/leaderboard', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req)!;
    const isAdmin = hasPermission(user.role, 'ADMIN');
    const round = await prisma.competitionRound.findUnique({
      where: { id: req.params.roundId },
      select: {
        id: true, eventId: true, roundType: true, status: true, startedAt: true, duration: true,
        penaltyModel: true, leaderboardFreezeMinutes: true, problems: DSA_LB_SELECT,
      },
    });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
    if (!isAdmin) {
      const reg = await prisma.eventRegistration.findUnique({
        where: { userId_eventId: { userId: user.id, eventId: round.eventId } },
        select: { id: true },
      });
      if (!reg) return ApiResponse.forbidden(res, 'Register for this event to view the leaderboard.');
    }
    if (round.roundType !== 'DSA') {
      return ApiResponse.success(res, { roundType: round.roundType, frozen: false, results: [], penaltyModel: round.penaltyModel });
    }
    const remaining = computeRemainingSeconds(round, Date.now());
    const freezeSec = (round.leaderboardFreezeMinutes ?? 0) * 60;
    const frozen = !isAdmin && round.status === 'ACTIVE' && freezeSec > 0 && remaining !== null && remaining <= freezeSec;
    if (frozen) {
      return ApiResponse.success(res, { roundType: 'DSA', frozen: true, results: [], penaltyModel: round.penaltyModel });
    }
    const submissions = await prisma.problemSubmission.findMany({
      where: { contextType: 'CONTEST', contextKey: round.id },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });
    const results = buildDsaLeaderboard(round.problems, submissions, round.startedAt ? round.startedAt.getTime() : null, round.penaltyModel, 100);
    return ApiResponse.success(res, { roundType: 'DSA', frozen: false, results, penaltyModel: round.penaltyModel });
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

// Admin live monitor: participant proctor state (online via lastSeenAt, lock, violations)
// merged with DSA score, plus a recent submission feed. Polling-based (no socket).
competitionRouter.get('/:roundId/monitor', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const round = await prisma.competitionRound.findUnique({
      where: { id: req.params.roundId },
      select: { id: true, title: true, status: true, roundType: true, startedAt: true, penaltyModel: true, problems: DSA_LB_SELECT },
    });
    if (!round) return ApiResponse.notFound(res, 'Round not found');

    const [states, dsaSubs] = await Promise.all([
      prisma.competitionParticipantState.findMany({
        where: { roundId: round.id },
        select: { userId: true, locked: true, lockReason: true, violationCount: true, lastViolationAt: true, lastSeenAt: true, user: { select: { name: true, email: true, avatar: true } } },
      }),
      round.roundType === 'DSA'
        ? prisma.problemSubmission.findMany({
            where: { contextType: 'CONTEST', contextKey: round.id },
            include: { user: { select: { id: true, name: true, avatar: true } } },
          })
        : Promise.resolve([] as never[]),
    ]);

    const lb = round.roundType === 'DSA'
      ? buildDsaLeaderboard(round.problems, dsaSubs, round.startedAt ? round.startedAt.getTime() : null, round.penaltyModel, 1000)
      : [];
    const scoreByUser = new Map(lb.map((row) => [row.userId, row]));

    // Union of proctor-state users and leaderboard users (a non-proctored round has no
    // states; a joined-but-not-submitted user has a state but no leaderboard row).
    const userIds = new Set<string>([...states.map((s) => s.userId), ...lb.map((r) => r.userId)]);
    const stateByUser = new Map(states.map((s) => [s.userId, s]));
    const participants = Array.from(userIds).map((userId) => {
      const s = stateByUser.get(userId);
      const row = scoreByUser.get(userId);
      return {
        userId,
        name: s?.user.name ?? row?.userName ?? 'Participant',
        email: s?.user.email ?? null,
        avatar: s?.user.avatar ?? row?.avatar ?? null,
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

    const recentSubmissions = round.roundType === 'DSA'
      ? [...dsaSubs]
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .slice(0, 30)
          .map((sub) => ({
            id: sub.id, userName: sub.user.name, problemId: sub.problemId,
            verdict: sub.verdict, score: sub.score, updatedAt: sub.updatedAt.toISOString(),
          }))
      : [];

    return ApiResponse.success(res, {
      round: { id: round.id, title: round.title, status: round.status, roundType: round.roundType },
      participants,
      recentSubmissions,
    });
  } catch (error) {
    return mapRoundError(res, error, 'Failed to fetch monitor');
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
