import { Router, Request, Response } from 'express';
import { ProblemLanguage, type Problem, type QOTD } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, optionalAuthMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import { parsePaginationNumber } from '../utils/pagination.js';
import { ApiResponse } from '../utils/response.js';
import { createProblemFromInput, serializeProblemDetail, toIstDateKey, type ProblemInput } from '../utils/problemsCore.js';
import { formatUsageDate } from '../utils/dailyLimit.js';

export const qotdRouter = Router();

const testCaseSchema = z.object({
  id: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/),
  input: z.string().max(20_000),
  expectedOutput: z.string().max(20_000),
  label: z.string().trim().max(80).optional(),
  points: z.coerce.number().int().min(1).max(1000).optional(),
});

const problemInputSchema = z.object({
  slug: z.string().trim().min(3).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(3).max(200),
  body: z.string().min(1).max(60_000),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  allowedLanguages: z.array(z.nativeEnum(ProblemLanguage)).min(1).max(4),
  timeLimitMs: z.coerce.number().int().min(500).max(10_000).default(2000),
  defaultSubmitCap: z.coerce.number().int().min(1).max(100).default(5),
  sampleTests: z.array(testCaseSchema).min(1).max(20),
  hiddenTests: z.array(testCaseSchema).min(1).max(100),
  referenceSolution: z.string().max(100_000).optional().nullable(),
  referenceLanguage: z.nativeEnum(ProblemLanguage).optional().nullable(),
  isPublished: z.boolean().default(false),
});

const createQotdSchema = z.object({
  date: z.coerce.date(),
  problemId: z.string().uuid().optional(),
  newProblem: problemInputSchema.optional(),
  question: z.string().trim().min(5).max(2000).optional(),
  difficulty: z.string().trim().min(1).max(40).optional(),
  problemLink: z.string().url('problemLink must be a valid URL').optional(),
  publishNow: z.boolean().optional(),
}).refine((value) => Boolean(value.problemId || value.newProblem || (value.question && value.difficulty && value.problemLink)), {
  message: 'Provide problemId, newProblem, or legacy question/difficulty/problemLink',
});

const updateQotdSchema = z.object({
  question: z.string().trim().min(5).max(2000).optional(),
  difficulty: z.string().trim().min(1).max(40).optional(),
  problemLink: z.string().url('problemLink must be a valid URL').optional(),
  problemId: z.string().uuid().nullable().optional(),
  date: z.coerce.date().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field must be provided',
});

function midnightIstUtcFor(date: Date): Date {
  const istKey = formatUsageDate(date);
  return new Date(`${istKey}T00:00:00+05:30`);
}

function isAdminAuth(user: { role?: string } | undefined): boolean {
  return user?.role === 'ADMIN' || user?.role === 'PRESIDENT';
}

function isStaffAuth(user: { role?: string } | undefined): boolean {
  return user?.role === 'CORE_MEMBER' || user?.role === 'ADMIN' || user?.role === 'PRESIDENT';
}

const dailyLeaderboardCache = new Map<string, { data: unknown; expiresAt: number }>();
let totalLeaderboardCache: { data: unknown; expiresAt: number } | null = null;
let statsLeaderboardCache: { data: unknown; expiresAt: number } | null = null;

type QotdWithProblem = QOTD & {
  problem?: Problem | null;
  _count?: { submissions: number };
};

function rememberDailyCache(qotdId: string, data: unknown): void {
  dailyLeaderboardCache.set(qotdId, { data, expiresAt: Date.now() + 60_000 });
  if (dailyLeaderboardCache.size > 30) {
    const oldest = dailyLeaderboardCache.keys().next().value;
    if (oldest) dailyLeaderboardCache.delete(oldest);
  }
}

function qotdDateRange(date = new Date()) {
  const key = formatUsageDate(date);
  const start = new Date(`${key}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { key, start, end };
}

function legacyProblemLinkFor(date: Date): string {
  return `${process.env.FRONTEND_URL || 'https://codescriet.dev'}/qotd/${toIstDateKey(date)}`;
}

async function addSubmissionStatus<T extends { id: string; problemId: string | null }>(qotd: T, userId?: string) {
  if (!userId) return { ...qotd, hasSubmitted: false };
  if (qotd.problemId) {
    const submission = await prisma.problemSubmission.findUnique({
      where: {
        userId_problemId_contextType_contextKey: {
          userId,
          problemId: qotd.problemId,
          contextType: 'QOTD',
          contextKey: qotd.id,
        },
      },
      select: { id: true },
    });
    return { ...qotd, hasSubmitted: Boolean(submission) };
  }

  const submission = await prisma.qOTDSubmission.findUnique({
    where: { userId_qotdId: { qotdId: qotd.id, userId } },
    select: { id: true },
  });
  return { ...qotd, hasSubmitted: Boolean(submission) };
}

async function serializeQotd(qotd: QotdWithProblem, userId?: string) {
  const withStatus = await addSubmissionStatus(qotd, userId);
  if (!qotd.problem) return withStatus;
  return {
    ...withStatus,
    problem: await serializeProblemDetail(qotd.problem, undefined),
  };
}

qotdRouter.get('/today', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { start, end } = qotdDateRange();
    const authUser = getAuthUser(req);
    const includeUnpublished = req.query.includeUnpublished === 'true' && isAdminAuth(authUser);
    const qotd = await prisma.qOTD.findFirst({
      where: {
        date: { gte: start, lt: end },
        ...(includeUnpublished ? {} : { isPublished: true }),
      },
      include: { problem: true },
    });

    if (!qotd) {
      return ApiResponse.success(res, null, 'No QOTD for today');
    }

    return ApiResponse.success(res, await serializeQotd(qotd, authUser?.id));
  } catch {
    return ApiResponse.internal(res, 'Failed to fetch QOTD');
  }
});

qotdRouter.get('/history', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const limit = parsePaginationNumber(req.query.limit, 10, { min: 1, max: 100 });
    const offset = parsePaginationNumber(req.query.offset, 0, { min: 0, max: 1000000 });
    if (limit === null) return ApiResponse.badRequest(res, 'limit must be an integer between 1 and 100');
    if (offset === null) return ApiResponse.badRequest(res, 'offset must be a non-negative integer');

    const { end } = qotdDateRange();
    const authUser = getAuthUser(req);
    // Staff (CORE_MEMBER+) may opt into seeing unpublished/scheduled QOTDs (including future) for admin views.
    const includeUnpublished = req.query.includeUnpublished === 'true' && isStaffAuth(authUser);
    const baseWhere = includeUnpublished
      ? {}
      : { date: { lt: end }, isPublished: true };
    const [qotds, total] = await Promise.all([
      prisma.qOTD.findMany({
        where: baseWhere,
        orderBy: { date: 'desc' },
        take: limit,
        skip: offset,
        include: { problem: true, _count: { select: { submissions: true } } },
      }),
      prisma.qOTD.count({ where: baseWhere }),
    ]);
    const data = await Promise.all(qotds.map((qotd) => serializeQotd(qotd, authUser?.id)));
    return res.json({ success: true, data, pagination: { total, limit, offset } });
  } catch {
    return ApiResponse.internal(res, 'Failed to fetch QOTD history');
  }
});

qotdRouter.get('/leaderboard/total', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(10, Math.max(1, Number(req.query.limit) || 10));
    if (totalLeaderboardCache && Date.now() < totalLeaderboardCache.expiresAt) {
      return ApiResponse.success(res, totalLeaderboardCache.data);
    }

    const rows = await prisma.$queryRaw<Array<{ user_id: string; total_score: bigint | number; first_solve: Date }>>`
      SELECT ps.user_id, SUM(ps.score)::int AS total_score, MIN(ps.submitted_at) AS first_solve
      FROM problem_submissions ps
      JOIN qotd q ON q.id = ps.context_key
      WHERE ps.context_type = 'QOTD'
        AND DATE(ps.submitted_at AT TIME ZONE 'Asia/Kolkata') = DATE(q.date AT TIME ZONE 'Asia/Kolkata')
      GROUP BY ps.user_id
      ORDER BY total_score DESC, first_solve ASC
      LIMIT ${limit};
    `;
    const users = await prisma.user.findMany({
      where: { id: { in: rows.map((row) => row.user_id) } },
      select: { id: true, name: true, avatar: true },
    });
    const usersById = new Map(users.map((user) => [user.id, user]));
    const data = {
      entries: rows.map((row, index) => {
        const user = usersById.get(row.user_id);
        return {
          rank: index + 1,
          userId: row.user_id,
          name: user?.name ?? 'Unknown',
          avatar: user?.avatar ?? null,
          totalScore: Number(row.total_score),
          firstSolve: row.first_solve.toISOString(),
        };
      }),
    };
    totalLeaderboardCache = { data, expiresAt: Date.now() + 5 * 60_000 };
    return ApiResponse.success(res, data);
  } catch {
    return ApiResponse.internal(res, 'Failed to fetch QOTD total leaderboard');
  }
});

qotdRouter.get('/stats/leaderboard', async (req: Request, res: Response) => {
  try {
    const limit = parsePaginationNumber(req.query.limit, 10, { min: 1, max: 100 });
    if (limit === null) return ApiResponse.badRequest(res, 'limit must be an integer between 1 and 100');

    if (statsLeaderboardCache && Date.now() < statsLeaderboardCache.expiresAt) {
      const cached = statsLeaderboardCache.data as Array<{ user: { id: string; name: string; avatar: string | null }; submissions: number }>;
      return ApiResponse.success(res, cached.slice(0, limit));
    }

    // Count unique IST-date solves per user, combining the legacy QOTDSubmission
    // self-report table and the problem judge's ACCEPTED submissions.
    const [legacy, problemRows] = await Promise.all([
      prisma.qOTDSubmission.findMany({
        select: { userId: true, qotd: { select: { date: true } } },
        take: 50_000,
      }),
      prisma.problemSubmission.findMany({
        where: { contextType: 'QOTD', verdict: 'ACCEPTED' },
        select: { userId: true, contextKey: true },
        take: 50_000,
      }),
    ]);

    const qotdIds = Array.from(new Set(problemRows.map((row) => row.contextKey)));
    const qotds = qotdIds.length
      ? await prisma.qOTD.findMany({ where: { id: { in: qotdIds } }, select: { id: true, date: true } })
      : [];
    const dateByQotdId = new Map(qotds.map((q) => [q.id, q.date]));

    const userToDates = new Map<string, Set<string>>();
    const remember = (userId: string, dateKey: string) => {
      const existing = userToDates.get(userId);
      if (existing) existing.add(dateKey);
      else userToDates.set(userId, new Set([dateKey]));
    };
    for (const row of legacy) remember(row.userId, formatUsageDate(row.qotd.date));
    for (const row of problemRows) {
      const date = dateByQotdId.get(row.contextKey);
      if (date) remember(row.userId, formatUsageDate(date));
    }

    const ranked = Array.from(userToDates.entries())
      .map(([userId, days]) => ({ userId, submissions: days.size }))
      .sort((a, b) => b.submissions - a.submissions)
      .slice(0, 100);

    const users = ranked.length
      ? await prisma.user.findMany({
          where: { id: { in: ranked.map((entry) => entry.userId) } },
          select: { id: true, name: true, avatar: true },
        })
      : [];
    const usersById = new Map(users.map((user) => [user.id, user]));
    const leaderboard = ranked.map((entry) => ({
      user: usersById.get(entry.userId) ?? { id: entry.userId, name: 'Unknown', avatar: null },
      submissions: entry.submissions,
    }));

    statsLeaderboardCache = { data: leaderboard, expiresAt: Date.now() + 60_000 };
    return ApiResponse.success(res, leaderboard.slice(0, limit));
  } catch {
    return ApiResponse.internal(res, 'Failed to fetch leaderboard');
  }
});

qotdRouter.get('/:qotdId/leaderboard', async (req: Request, res: Response) => {
  try {
    const cached = dailyLeaderboardCache.get(req.params.qotdId);
    if (cached && Date.now() < cached.expiresAt) return ApiResponse.success(res, cached.data);

    const qotd = await prisma.qOTD.findUnique({
      where: { id: req.params.qotdId },
      select: { id: true, problemId: true },
    });
    if (!qotd?.problemId) return ApiResponse.success(res, { entries: [] });

    const submissions = await prisma.problemSubmission.findMany({
      where: { problemId: qotd.problemId, contextType: 'QOTD', contextKey: qotd.id },
      orderBy: [{ score: 'desc' }, { submittedAt: 'asc' }],
      take: 10,
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });
    const data = {
      entries: submissions.map((submission, index) => ({
        rank: index + 1,
        userId: submission.userId,
        name: submission.user.name,
        avatar: submission.user.avatar,
        score: submission.score,
        verdict: submission.verdict,
        submittedAt: submission.submittedAt.toISOString(),
      })),
    };
    rememberDailyCache(qotd.id, data);
    return ApiResponse.success(res, data);
  } catch {
    return ApiResponse.internal(res, 'Failed to fetch QOTD leaderboard');
  }
});

qotdRouter.get('/:id', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const qotd = await prisma.qOTD.findUnique({
      where: { id: req.params.id },
      include: { problem: true, _count: { select: { submissions: true } } },
    });
    if (!qotd) return ApiResponse.notFound(res, 'QOTD not found');
    const authUser = getAuthUser(req);
    return ApiResponse.success(res, await serializeQotd(qotd, authUser?.id));
  } catch {
    return ApiResponse.internal(res, 'Failed to fetch QOTD');
  }
});

qotdRouter.post('/:id/submit', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const qotd = await prisma.qOTD.findUnique({ where: { id: req.params.id } });
    if (!qotd) return ApiResponse.notFound(res, 'QOTD not found');
    if (qotd.problemId) {
      return ApiResponse.badRequest(res, 'Problem-backed QOTDs must be submitted through /api/problems/:id/submit');
    }

    const existing = await prisma.qOTDSubmission.findUnique({
      where: { userId_qotdId: { qotdId: qotd.id, userId: authUser.id } },
    });
    if (existing) return ApiResponse.badRequest(res, 'Already submitted');

    const submission = await prisma.qOTDSubmission.create({
      data: { qotdId: qotd.id, userId: authUser.id },
    });
    return ApiResponse.created(res, submission, 'Submission recorded');
  } catch {
    return ApiResponse.internal(res, 'Failed to submit');
  }
});

qotdRouter.post('/', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const parsed = createQotdSchema.safeParse(req.body);
    if (!parsed.success) return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid QOTD payload');

    let problemId = parsed.data.problemId ?? null;
    let legacyFields = {
      question: parsed.data.question,
      difficulty: parsed.data.difficulty,
      problemLink: parsed.data.problemLink,
    };

    if (parsed.data.newProblem) {
      const problem = await createProblemFromInput(parsed.data.newProblem as ProblemInput, authUser.id);
      problemId = problem.id;
      legacyFields = {
        question: problem.title,
        difficulty: problem.difficulty,
        problemLink: legacyProblemLinkFor(parsed.data.date),
      };
    } else if (problemId) {
      const problem = await prisma.problem.findUnique({ where: { id: problemId } });
      if (!problem) return ApiResponse.notFound(res, 'Problem not found');
      legacyFields = {
        question: problem.title,
        difficulty: problem.difficulty,
        problemLink: legacyProblemLinkFor(parsed.data.date),
      };
    }

    const now = new Date();
    const istToday = formatUsageDate(now);
    const dateKey = formatUsageDate(parsed.data.date);
    const isPastOrToday = dateKey <= istToday;
    const publishNow = parsed.data.publishNow === true || (parsed.data.publishNow !== false && isPastOrToday);
    const publishAt = midnightIstUtcFor(parsed.data.date);

    const qotd = await prisma.qOTD.create({
      data: {
        question: legacyFields.question!,
        difficulty: legacyFields.difficulty!,
        problemLink: legacyFields.problemLink!,
        problemId,
        date: parsed.data.date,
        createdById: authUser.id,
        isPublished: publishNow,
        publishAt,
        publishedAt: publishNow ? now : null,
      },
      include: { problem: true },
    });

    await auditLog(authUser.id, 'CREATE', 'qotd', qotd.id, { question: qotd.question, problemId: qotd.problemId, isPublished: qotd.isPublished });
    return ApiResponse.created(res, qotd, 'QOTD created successfully');
  } catch {
    return ApiResponse.internal(res, 'Failed to create QOTD');
  }
});

qotdRouter.post('/:id/publish', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const qotd = await prisma.qOTD.findUnique({ where: { id: req.params.id } });
    if (!qotd) return ApiResponse.notFound(res, 'QOTD not found');
    const updated = await prisma.qOTD.update({
      where: { id: qotd.id },
      data: { isPublished: true, publishedAt: qotd.publishedAt ?? new Date(), heldBy: null, holdReason: null },
      include: { problem: true },
    });
    dailyLeaderboardCache.delete(qotd.id);
    totalLeaderboardCache = null;
    await auditLog(authUser.id, 'QOTD_PUBLISHED', 'qotd', qotd.id);
    return ApiResponse.success(res, updated, 'QOTD published');
  } catch {
    return ApiResponse.internal(res, 'Failed to publish QOTD');
  }
});

qotdRouter.post('/:id/hold', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const schema = z.object({ reason: z.string().trim().max(280).optional() });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return ApiResponse.badRequest(res, 'Invalid hold payload');
    const qotd = await prisma.qOTD.findUnique({ where: { id: req.params.id } });
    if (!qotd) return ApiResponse.notFound(res, 'QOTD not found');
    const updated = await prisma.qOTD.update({
      where: { id: qotd.id },
      data: { isPublished: false, heldBy: authUser.id, holdReason: parsed.data.reason ?? null },
      include: { problem: true },
    });
    dailyLeaderboardCache.delete(qotd.id);
    totalLeaderboardCache = null;
    await auditLog(authUser.id, 'QOTD_HELD', 'qotd', qotd.id, { reason: parsed.data.reason });
    return ApiResponse.success(res, updated, 'QOTD held');
  } catch {
    return ApiResponse.internal(res, 'Failed to hold QOTD');
  }
});

qotdRouter.post('/:id/publish-practice', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const qotd = await prisma.qOTD.findUnique({ where: { id: req.params.id }, include: { problem: true } });
    if (!qotd) return ApiResponse.notFound(res, 'QOTD not found');
    if (!qotd.problemId) {
      return ApiResponse.badRequest(res, 'Legacy text-only QOTDs cannot be published to practice');
    }
    const istToday = formatUsageDate();
    if (formatUsageDate(qotd.date) >= istToday) {
      return ApiResponse.badRequest(res, 'Wait until the QOTD day has ended before publishing to practice');
    }
    await prisma.problem.update({ where: { id: qotd.problemId }, data: { isPublished: true } });
    await auditLog(authUser.id, 'QOTD_PUBLISHED_TO_PRACTICE', 'qotd', qotd.id, { problemId: qotd.problemId });
    return ApiResponse.success(res, { success: true, problemId: qotd.problemId }, 'Published to practice');
  } catch {
    return ApiResponse.internal(res, 'Failed to publish QOTD to practice');
  }
});

qotdRouter.post('/:id/unpublish-practice', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const qotd = await prisma.qOTD.findUnique({ where: { id: req.params.id } });
    if (!qotd) return ApiResponse.notFound(res, 'QOTD not found');
    if (!qotd.problemId) return ApiResponse.badRequest(res, 'No linked problem');
    await prisma.problem.update({ where: { id: qotd.problemId }, data: { isPublished: false } });
    await auditLog(authUser.id, 'QOTD_UNPUBLISHED_FROM_PRACTICE', 'qotd', qotd.id, { problemId: qotd.problemId });
    return ApiResponse.success(res, { success: true }, 'Removed from practice');
  } catch {
    return ApiResponse.internal(res, 'Failed to remove from practice');
  }
});

qotdRouter.put('/:id', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const parsed = updateQotdSchema.safeParse(req.body);
    if (!parsed.success) return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid QOTD payload');

    const existingQotd = await prisma.qOTD.findUnique({
      where: { id: req.params.id },
      select: { id: true, createdById: true },
    });
    if (!existingQotd) return ApiResponse.notFound(res, 'QOTD not found');

    const isAdmin = authUser.role === 'ADMIN' || authUser.role === 'PRESIDENT';
    const isOwner = existingQotd.createdById === authUser.id;
    if (!isAdmin && !isOwner) return ApiResponse.forbidden(res, 'You can only edit QOTDs created by you');

    const qotd = await prisma.qOTD.update({
      where: { id: req.params.id },
      data: parsed.data,
      include: { problem: true },
    });
    await auditLog(authUser.id, 'UPDATE', 'qotd', qotd.id);
    return ApiResponse.success(res, qotd, 'QOTD updated successfully');
  } catch {
    return ApiResponse.internal(res, 'Failed to update QOTD');
  }
});

qotdRouter.delete('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    await prisma.qOTD.delete({ where: { id: req.params.id } });
    await auditLog(authUser.id, 'DELETE', 'qotd', req.params.id);
    return ApiResponse.success(res, { success: true }, 'QOTD deleted successfully');
  } catch {
    return ApiResponse.internal(res, 'Failed to delete QOTD');
  }
});
