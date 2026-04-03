import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma, withRetry } from '../lib/prisma.js';
import { authMiddleware, optionalAuthMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ApiResponse, ErrorCodes } from '../utils/response.js';
import { sanitizeText } from '../utils/sanitize.js';
import { auditLog } from '../utils/audit.js';
import { logger } from '../utils/logger.js';

const competitionRouter = Router();
const activeTimers = new Map<string, NodeJS.Timeout>();

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

const createRoundSchema = z.object({
  eventId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  duration: z.number().int().min(300).max(7200),
  participantScope: z.enum(['ALL', 'SELECTED_TEAMS']).optional(),
  leadersOnly: z.boolean().optional(),
  allowedTeamIds: z.array(z.string().uuid()).max(500).optional(),
  targetImageUrl: z.string().url().optional(),
});

const updateRoundSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  duration: z.number().int().min(300).max(7200).optional(),
  participantScope: z.enum(['ALL', 'SELECTED_TEAMS']).optional(),
  leadersOnly: z.boolean().optional(),
  allowedTeamIds: z.array(z.string().uuid()).max(500).optional(),
  targetImageUrl: z.string().url().nullable().optional(),
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
      startedAt: true,
      lockedAt: true,
      createdAt: true,
      updatedAt: true,
      targetImageUrl: true,
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
    await prisma.$transaction(async (tx) => {
      const round = await tx.competitionRound.findUnique({
        where: { id: roundId },
        select: { id: true, status: true, participantScope: true, leadersOnly: true, allowedTeamIds: true },
      });
      if (!round || round.status !== 'ACTIVE') return;

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
    });

    const timer = activeTimers.get(roundId);
    if (timer) clearTimeout(timer);
    activeTimers.delete(roundId);

    logger.info('Competition round auto-locked', { roundId });
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
  const timeout = setTimeout(() => {
    void autoLockRound(roundId);
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

    const round = await withRetry(() => prisma.competitionRound.create({
      data: {
        eventId: parsed.data.eventId,
        title: sanitizeText(parsed.data.title).trim(),
        description: parsed.data.description ? sanitizeText(parsed.data.description).trim() : null,
        duration: parsed.data.duration,
        participantScope: requestedScope,
        leadersOnly,
        allowedTeamIds,
        targetImageUrl: parsed.data.targetImageUrl || null,
        status: 'DRAFT',
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
    const canViewTeamSelection = user?.role === 'ADMIN' || user?.role === 'PRESIDENT';
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
      participantScope: round.participantScope,
      leadersOnly: round.leadersOnly,
      allowedTeamIds: canViewTeamSelection ? round.allowedTeamIds : undefined,
      startedAt: round.startedAt?.toISOString(),
      lockedAt: round.lockedAt?.toISOString(),
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
    const hasSubmittedByUser = await prisma.competitionSubmission.findUnique({
      where: {
        roundId_userId: { roundId, userId: user.id },
      },
      select: { id: true },
    });
    const hasSubmittedByTeam = myTeam
      ? await prisma.competitionSubmission.findUnique({
          where: {
            roundId_teamId: { roundId, teamId: myTeam.id },
          },
          select: { id: true },
        })
      : null;

    return ApiResponse.success(res, {
      id: round.id,
      eventId: round.eventId,
      title: round.title,
      description: round.description ?? undefined,
      duration: round.duration,
      status: round.status,
      participantScope: round.participantScope,
      leadersOnly: round.leadersOnly,
      allowedTeamIds: round.allowedTeamIds,
      startedAt: round.startedAt?.toISOString(),
      lockedAt: round.lockedAt?.toISOString(),
      serverTime: serverTime.toISOString(),
      remainingSeconds: round.status === 'ACTIVE' ? computeRemainingSeconds(round, serverTime.getTime()) : 0,
      hasSubmitted: Boolean(hasSubmittedByUser || hasSubmittedByTeam),
      myTeam,
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
      select: { id: true, status: true, eventId: true, title: true },
    });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
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

    // Auto-compute ranks from scores: highest score = rank 1, ties broken by earlier submission time
    const submissions = await prisma.competitionSubmission.findMany({
      where: { roundId: round.id },
      select: { id: true, score: true, submittedAt: true },
      orderBy: [
        { score: 'desc' },
        { submittedAt: 'asc' },
      ],
    });

    // Assign ranks and update round status in a single transaction
    await prisma.$transaction([
      ...submissions.map((sub, index) =>
        prisma.competitionSubmission.update({
          where: { id: sub.id },
          data: { rank: index + 1 },
        }),
      ),
      prisma.competitionRound.update({
        where: { id: round.id },
        data: { status: 'FINISHED' },
      }),
    ]);

    const updated = await prisma.competitionRound.findUniqueOrThrow({
      where: { id: round.id },
    });

    await auditLog(admin.id, 'COMPETITION_ROUND_FINISHED', 'CompetitionRound', round.id, {
      title: round.title,
      eventId: round.eventId,
      rankedCount: submissions.length,
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
      },
    });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
    if (!['ACTIVE', 'LOCKED', 'JUDGING', 'FINISHED'].includes(round.status)) {
      return ApiResponse.forbidden(res, 'Submissions are available once the round is started');
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

    const updated = await prisma.competitionSubmission.update({
      where: { id: req.params.submissionId },
      data: {
        ...(parsed.data.score !== undefined ? { score: parsed.data.score } : {}),
        ...(parsed.data.rank !== undefined ? { rank: parsed.data.rank } : {}),
        ...(parsed.data.adminNotes !== undefined ? { adminNotes: sanitizeText(parsed.data.adminNotes) } : {}),
      },
      include: {
        team: { select: { teamName: true } },
        user: { select: { name: true } },
      },
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
        event: {
          select: { title: true },
        },
      },
    });
    if (!round) return ApiResponse.notFound(res, 'Round not found');
    if (round.status !== 'FINISHED') {
      return ApiResponse.badRequest(res, 'Results can only be exported after publishing.');
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
        startedAt: true,
        event: {
          select: { id: true, title: true },
        },
      },
    });

    if (!round) return ApiResponse.notFound(res, 'Round not found');
    if (round.status !== 'FINISHED') {
      return ApiResponse.forbidden(res, 'Results are not published yet');
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

    const updated = await prisma.competitionRound.update({
      where: { id: round.id },
      data: {
        ...(parsed.data.title !== undefined ? { title: sanitizeText(parsed.data.title).trim() } : {}),
        ...(parsed.data.description !== undefined ? { description: sanitizeText(parsed.data.description).trim() || null } : {}),
        ...(parsed.data.duration !== undefined ? { duration: parsed.data.duration } : {}),
        participantScope: (!round.event.teamRegistration || requestedScope === 'ALL') ? 'ALL' : 'SELECTED_TEAMS',
        leadersOnly: nextLeadersOnly,
        allowedTeamIds: nextAllowedTeamIds,
        ...(parsed.data.targetImageUrl !== undefined ? { targetImageUrl: parsed.data.targetImageUrl || null } : {}),
      },
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
