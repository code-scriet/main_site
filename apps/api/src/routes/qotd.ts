import { Router, Response } from 'express';
import type { Request } from '../lib/http.js';
import { ProblemLanguage, type Problem, type QOTD } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, optionalAuthMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { requireNotBlocked } from '../middleware/blocks.js';
import { auditLog } from '../utils/audit.js';
import { parsePaginationNumber } from '../utils/pagination.js';
import { ApiResponse, setPublicCache } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { createProblemFromInput, serializeProblemDetail, toIstDateKey, type ProblemInput } from '../utils/problemsCore.js';
import { formatUsageDate } from '../utils/dailyLimit.js';
import { recomputeUserStreakSafe, invalidatePublishedQotdCache, recomputeStreaksForQOTDSafe } from '../utils/qotdStreak.js';
import { broadcastQotdLive, broadcastNotification } from '../utils/notifications.js';
import { armQotdPublishTimer, cancelQotdPublishTimer } from '../utils/scheduler.js';
import { uuidParamGuard } from '../utils/idParams.js';
import { isPresidentOrSuperAdmin, isSuperAdmin } from '../utils/superAdmin.js';
import { signQotdReopenToken } from '../utils/jwt.js';
import { resolveQotdPublishState } from '../utils/qotdAuthoring.js';

export const qotdRouter = Router();

// Reject malformed ids before they hit Prisma — QOTD PKs are uuids. Literal
// routes (/today, /history, /leaderboard/*, /stats/*) don't match these params.
qotdRouter.param('id', uuidParamGuard('QOTD ID'));
qotdRouter.param('qotdId', uuidParamGuard('QOTD ID'));

const testCaseSchema = z.object({
  id: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/),
  input: z.string().max(20_000),
  expectedOutput: z.string().max(20_000),
  label: z.string().trim().max(80).optional(),
  points: z.coerce.number().int().min(1).max(1000).optional(),
}).superRefine((test, ctx) => {
  if (!test.expectedOutput.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expectedOutput'],
      message: 'Test case expected output is required',
    });
  }
  if (!test.input.trim() && !test.expectedOutput.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Test case input or expected output is required',
    });
  }
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
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  problemLink: z.string().url('problemLink must be a valid URL').optional(),
  publishNow: z.boolean().optional(),
  // IST wall-clock time of day to go live (HH:mm). Combined with `date` to build
  // the publishAt instant. Defaults to 00:00 IST (midnight) when omitted.
  publishTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'publishTime must be HH:mm (24h)').optional(),
}).refine((value) => Boolean(value.problemId || value.newProblem || (value.question && value.difficulty && value.problemLink)), {
  message: 'Provide problemId, newProblem, or legacy question/difficulty/problemLink',
});

const updateQotdSchema = z.object({
  question: z.string().trim().min(5).max(2000).optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
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

// Free expired entries every 60s so a fresh insert isn't blocked by stale
// keys squatting on the 30-entry cap. Readers already gate on expiresAt.
const dailyLeaderboardSweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of dailyLeaderboardCache) {
    if (entry.expiresAt <= now) dailyLeaderboardCache.delete(key);
  }
}, 60_000);
if (typeof dailyLeaderboardSweep.unref === 'function') dailyLeaderboardSweep.unref();

type QotdWithProblem = QOTD & {
  problem?: Problem | null;
  _count?: { submissions: number };
};

export function invalidateQotdLeaderboardCaches(qotdId?: string): void {
  if (qotdId) dailyLeaderboardCache.delete(qotdId);
  else dailyLeaderboardCache.clear();
  totalLeaderboardCache = null;
  statsLeaderboardCache = null;
}

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

async function serializeQotd(qotd: QotdWithProblem, userId?: string, precomputedHasSubmitted?: boolean) {
  const withStatus = precomputedHasSubmitted !== undefined
    ? { ...qotd, hasSubmitted: precomputedHasSubmitted }
    : await addSubmissionStatus(qotd, userId);
  if (!qotd.problem) return withStatus;
  return {
    ...withStatus,
    problem: await serializeProblemDetail(qotd.problem, undefined),
  };
}

// Batch form of addSubmissionStatus for list endpoints: two grouped queries
// replace one point read per row (up to 100 on /history). Semantics are
// byte-identical to the per-row unique-key lookup — including the problemId
// match, so a submission left behind after an admin re-points qotd.problemId
// still does NOT count as submitted.
async function getSubmittedQotdIds(
  qotds: Array<{ id: string; problemId: string | null }>,
  userId?: string,
): Promise<Set<string>> {
  const submitted = new Set<string>();
  if (!userId || qotds.length === 0) return submitted;

  const withProblem = qotds.filter((q) => q.problemId);
  const legacyOnly = qotds.filter((q) => !q.problemId);

  const [problemSubs, legacySubs] = await Promise.all([
    withProblem.length
      ? prisma.problemSubmission.findMany({
          where: { userId, contextType: 'QOTD', contextKey: { in: withProblem.map((q) => q.id) } },
          select: { contextKey: true, problemId: true },
        })
      : Promise.resolve([]),
    legacyOnly.length
      ? prisma.qOTDSubmission.findMany({
          where: { userId, qotdId: { in: legacyOnly.map((q) => q.id) } },
          select: { qotdId: true },
        })
      : Promise.resolve([]),
  ]);

  const problemIdByQotdId = new Map(withProblem.map((q) => [q.id, q.problemId] as const));
  for (const sub of problemSubs) {
    if (problemIdByQotdId.get(sub.contextKey) === sub.problemId) submitted.add(sub.contextKey);
  }
  for (const sub of legacySubs) submitted.add(sub.qotdId);
  return submitted;
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
    // Optional single-day lookup (?date=YYYY-MM-DD). The playground uses this to
    // resolve one specific past day's QOTD (e.g. an admin "reopen" link) directly,
    // instead of paging through history — so a reopened day of ANY age resolves,
    // not just one inside the last N entries. QOTD.date is stored at UTC-midnight,
    // whose date portion IS the QOTD's calendar-date key.
    const dateParam = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : null;
    let dateWhere: { gte: Date; lt: Date } | undefined;
    if (dateParam) {
      const dayStart = new Date(`${dateParam}T00:00:00.000Z`);
      if (!Number.isNaN(dayStart.getTime())) {
        dateWhere = { gte: dayStart, lt: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000) };
      }
    }
    // Proposals view (staff only): exactly the CORE_MEMBER-submitted drafts awaiting
    // an admin — unpublished, unscheduled (publishAt null), not held. Returned by the
    // server filter (not a client-side slice of a date-desc page) so the coding-hub
    // badge + Proposals tab never drop an old or past-dated proposal once the archive
    // grows past one page. A scheduled QOTD carries publishAt; a held one carries heldBy.
    const proposalsOnly = req.query.proposals === 'true' && includeUnpublished;
    const baseWhere = proposalsOnly
      ? { isPublished: false, publishAt: null, heldBy: null }
      : dateWhere
      ? { ...(includeUnpublished ? {} : { isPublished: true }), date: dateWhere }
      : includeUnpublished
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
    const submittedIds = await getSubmittedQotdIds(qotds, authUser?.id);
    const data = await Promise.all(qotds.map((qotd) => serializeQotd(qotd, authUser?.id, submittedIds.has(qotd.id))));
    return res.json({ success: true, data, pagination: { total, limit, offset } });
  } catch {
    return ApiResponse.internal(res, 'Failed to fetch QOTD history');
  }
});

// Lightweight totals for the "Full history" header — how many published QOTDs
// exist up to today and how many the caller has solved. Bounded: one row per QOTD
// day (id + problemId only), so it stays cheap even years in. solved is computed
// with the same getSubmittedQotdIds split used by /history, so the count is
// byte-identical to the per-row hasSubmitted there.
qotdRouter.get('/history/summary', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { end } = qotdDateRange();
    const authUser = getAuthUser(req);
    const qotds = await prisma.qOTD.findMany({
      where: { date: { lt: end }, isPublished: true },
      select: { id: true, problemId: true },
    });
    const totalPublished = qotds.length;
    const solved = (await getSubmittedQotdIds(qotds, authUser?.id)).size;
    return ApiResponse.success(res, { totalPublished, solved, left: Math.max(0, totalPublished - solved) });
  } catch (error) {
    logger.error('Failed to fetch QOTD history summary', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to fetch QOTD history summary');
  }
});

qotdRouter.get('/leaderboard/total', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(10, Math.max(1, Number(req.query.limit) || 10));
    if (totalLeaderboardCache && Date.now() < totalLeaderboardCache.expiresAt) {
      setPublicCache(res, 60);
      return ApiResponse.success(res, totalLeaderboardCache.data);
    }

    // Prisma stores DateTime as `timestamp(3)` (without time zone) holding the
    // UTC instant. To get the IST calendar date we must first say "this is UTC"
    // (`AT TIME ZONE 'UTC'` lifts naive → tstz) and then convert to IST
    // (`AT TIME ZONE 'Asia/Kolkata'` flattens tstz → naive local). Skipping the
    // first step inverts the offset and silently drops every row whose IST date
    // differs from its UTC date (i.e. anything submitted before 05:30 IST or
    // QOTD rows whose UTC midnight is the previous IST day).
    const rows = await prisma.$queryRaw<Array<{ user_id: string; total_score: bigint | number; first_solve: Date; latest_solve: Date; solve_days: bigint | number }>>`
      SELECT ps.user_id,
             SUM(ps.score)::int AS total_score,
             MIN(ps.submitted_at) AS first_solve,
             MAX(ps.submitted_at) AS latest_solve,
             COUNT(DISTINCT DATE(ps.submitted_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'))::int AS solve_days
      FROM problem_submissions ps
      JOIN qotd q ON q.id = ps.context_key
      WHERE ps.context_type = 'QOTD'
        AND DATE(ps.submitted_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')
            = DATE(q.date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')
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
          score: Number(row.total_score),
          submittedAt: row.latest_solve.toISOString(),
          firstSolveAt: row.first_solve.toISOString(),
          solveDays: Number(row.solve_days),
        };
      }),
    };
    totalLeaderboardCache = { data, expiresAt: Date.now() + 60_000 };
    setPublicCache(res, 60);
    return ApiResponse.success(res, data);
  } catch {
    return ApiResponse.internal(res, 'Failed to fetch QOTD total leaderboard');
  }
});

// Dashboard v2: rank ± window around the current user — powers the overview "Where you stand" slice.
qotdRouter.get('/leaderboard/around-me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return ApiResponse.unauthorized(res);
    const windowSize = Math.min(5, Math.max(1, Number(req.query.window) || 2));

    // Compute total scores for everyone, rank them, then slice around the caller.
    // RANK() handles ties (same score → same rank). Single query, capped result set.
    const ranked = await prisma.$queryRaw<Array<{ user_id: string; total_score: bigint | number; first_solve: Date; rk: bigint | number; total_rows: bigint | number }>>`
      WITH scored AS (
        SELECT ps.user_id,
               SUM(ps.score)::int AS total_score,
               MIN(ps.submitted_at) AS first_solve
        FROM problem_submissions ps
        JOIN qotd q ON q.id = ps.context_key
        WHERE ps.context_type = 'QOTD'
          AND DATE(ps.submitted_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')
              = DATE(q.date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')
        GROUP BY ps.user_id
      ), ranked AS (
        SELECT user_id, total_score, first_solve,
               RANK() OVER (ORDER BY total_score DESC, first_solve ASC) AS rk,
               COUNT(*) OVER () AS total_rows
        FROM scored
      ), my_rank AS (
        SELECT rk FROM ranked WHERE user_id = ${user.id}
      )
      SELECT r.user_id, r.total_score, r.first_solve, r.rk, r.total_rows
      FROM ranked r, my_rank m
      WHERE ABS(r.rk - m.rk) <= ${windowSize}
      ORDER BY r.rk ASC;
    `;

    if (ranked.length === 0) {
      return ApiResponse.success(res, { slice: [], myRank: null, totalRanked: 0, nextUpDelta: null });
    }
    const users = await prisma.user.findMany({
      where: { id: { in: ranked.map((row) => row.user_id) } },
      select: { id: true, name: true, avatar: true },
    });
    const usersById = new Map(users.map((u) => [u.id, u]));
    const slice = ranked.map((row) => {
      const u = usersById.get(row.user_id);
      return {
        rank: Number(row.rk),
        userId: row.user_id,
        name: u?.name ?? 'Unknown',
        avatar: u?.avatar ?? null,
        score: Number(row.total_score),
        you: row.user_id === user.id,
      };
    });
    const myIdx = slice.findIndex((r) => r.you);
    const myRank = myIdx >= 0 ? slice[myIdx].rank : null;
    const totalRanked = ranked.length > 0 ? Number(ranked[0].total_rows) : 0;
    const nextUp = myIdx > 0 ? slice[myIdx - 1] : null;
    const nextUpDelta = nextUp && myIdx >= 0 ? nextUp.score - slice[myIdx].score : null;
    return ApiResponse.success(res, { slice, myRank, totalRanked, nextUpDelta, nextUp });
  } catch {
    return ApiResponse.internal(res, 'Failed to fetch around-me leaderboard');
  }
});

qotdRouter.get('/stats/leaderboard', async (req: Request, res: Response) => {
  try {
    const limit = parsePaginationNumber(req.query.limit, 10, { min: 1, max: 100 });
    if (limit === null) return ApiResponse.badRequest(res, 'limit must be an integer between 1 and 100');

    if (statsLeaderboardCache && Date.now() < statsLeaderboardCache.expiresAt) {
      const cached = statsLeaderboardCache.data as Array<{ user: { id: string; name: string; avatar: string | null }; submissions: number }>;
      setPublicCache(res, 60);
      return ApiResponse.success(res, cached.slice(0, limit));
    }

    // Count unique IST-date solves per user, combining the legacy QOTDSubmission
    // self-report table and the problem judge's ACCEPTED submissions. Done in SQL
    // (not by hydrating up to 100k rows into Node) to keep the free-tier heap flat
    // on cache misses. Distinct day = the QOTD's IST calendar date, mirroring the
    // `formatUsageDate(q.date)` semantics of the old JS path and the IST-conversion
    // pattern already used by `/leaderboard/total` above. Verdict filter
    // (ACCEPTED) is preserved on the problem-judge branch.
    const rows = await prisma.$queryRaw<Array<{ user_id: string; days: bigint | number }>>`
      SELECT u.user_id, COUNT(DISTINCT u.solve_day)::int AS days
      FROM (
        SELECT qs.user_id,
               DATE(q.date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') AS solve_day
        FROM qotd_submissions qs
        JOIN qotd q ON q.id = qs.qotd_id
        UNION ALL
        SELECT ps.user_id,
               DATE(q.date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') AS solve_day
        FROM problem_submissions ps
        JOIN qotd q ON q.id = ps.context_key
        WHERE ps.context_type = 'QOTD' AND ps.verdict = 'ACCEPTED'
      ) u
      GROUP BY u.user_id
      ORDER BY days DESC, u.user_id ASC
      LIMIT 100;
    `;

    const ranked = rows.map((row) => ({ userId: row.user_id, submissions: Number(row.days) }));

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
    setPublicCache(res, 60);
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
      select: { id: true, problemId: true, date: true, publishedAt: true },
    });
    if (!qotd?.problemId) return ApiResponse.success(res, { entries: [], publishedAt: null, date: null });

    const submissions = await prisma.problemSubmission.findMany({
      where: { problemId: qotd.problemId, contextType: 'QOTD', contextKey: qotd.id },
      orderBy: [{ score: 'desc' }, { submittedAt: 'asc' }],
      take: 10,
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });
    // Reference point for "time taken": prefer explicit publish moment, fall
    // back to IST midnight of the QOTD's date so legacy rows without
    // publishedAt still produce a meaningful delta.
    const referenceTs = (qotd.publishedAt ?? midnightIstUtcFor(qotd.date)).getTime();
    const data = {
      publishedAt: qotd.publishedAt?.toISOString() ?? null,
      date: qotd.date.toISOString(),
      entries: submissions.map((submission, index) => {
        const submittedTs = submission.submittedAt.getTime();
        const timeTakenMs = Math.max(0, submittedTs - referenceTs);
        return {
          rank: index + 1,
          userId: submission.userId,
          name: submission.user.name,
          avatar: submission.user.avatar,
          score: submission.score,
          verdict: submission.verdict,
          submittedAt: submission.submittedAt.toISOString(),
          timeTakenMs,
          activeMs: submission.activeMs ?? null,
        };
      }),
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

qotdRouter.post('/:id/submit', authMiddleware, requireNotBlocked('QOTD'), async (req: Request, res: Response) => {
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

    // Materialize streak (fire-and-forget; never blocks the response).
    recomputeUserStreakSafe(authUser.id);

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

    // Author authority — computed up-front because it gates BOTH the QOTD publish
    // state (below) AND the inline-problem publish state (next): a CORE_MEMBER can
    // only PROPOSE. Super-admin (matched by email) may not carry role ADMIN/PRESIDENT,
    // so include it explicitly to agree with the frontend's isAdmin.
    const isAdmin = isAdminAuth(authUser) || isSuperAdmin(authUser);

    let problemId = parsed.data.problemId ?? null;
    let legacyFields = {
      question: parsed.data.question,
      difficulty: parsed.data.difficulty,
      problemLink: parsed.data.problemLink,
    };

    if (parsed.data.newProblem) {
      // A non-admin proposal must NOT be able to mint a published Problem as a side
      // effect (the propose-gate forces the QOTD to a draft, but the inline problem
      // is a separate row). Mirror problems.ts: force isPublished:false for non-admins.
      const newProblemInput = (isAdmin
        ? parsed.data.newProblem
        : { ...parsed.data.newProblem, isPublished: false }) as ProblemInput;
      const problem = await createProblemFromInput(newProblemInput, authUser.id);
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
    const dateKey = formatUsageDate(parsed.data.date);
    // publishAt = the chosen IST wall-clock time on the QOTD's IST date.
    // Building from the IST date key + "+05:30" offset yields the correct UTC
    // instant regardless of the server's timezone. Falls back to IST midnight
    // if, somehow, the constructed date is invalid.
    const publishTime = parsed.data.publishTime ?? '00:00';
    let computedPublishAt = new Date(`${dateKey}T${publishTime}:00+05:30`);
    if (Number.isNaN(computedPublishAt.getTime())) computedPublishAt = midnightIstUtcFor(parsed.data.date);
    // Auto-publish immediately when the scheduled instant has already passed,
    // unless the caller explicitly forces publishNow on/off.
    const computedPublishNow = parsed.data.publishNow === true
      || (parsed.data.publishNow !== false && computedPublishAt.getTime() <= now.getTime());

    // Non-admin authors (CORE_MEMBER) can only PROPOSE: resolveQotdPublishState
    // forces an unpublished, unscheduled draft (publishAt null → the auto-publish
    // scheduler never arms it) for an admin to review/schedule/publish. Fails closed
    // (unit-tested in qotdAuthoring.test.ts). `isAdmin` is computed above (it also
    // gates the inline-problem publish state).
    const { isPublished, publishAt } = resolveQotdPublishState({
      isAdmin,
      publishNow: computedPublishNow,
      publishAt: computedPublishAt,
    });

    const qotd = await prisma.qOTD.create({
      data: {
        question: legacyFields.question!,
        difficulty: legacyFields.difficulty!,
        problemLink: legacyFields.problemLink!,
        problemId,
        date: parsed.data.date,
        createdById: authUser.id,
        isPublished,
        publishAt,
        publishedAt: isPublished ? now : null,
      },
      include: { problem: true },
    });

    if (qotd.isPublished) {
      invalidatePublishedQotdCache();
      // Fire the bell notification when a QOTD goes live on creation. Scheduled
      // QOTDs get theirs later from the auto-publish scheduler instead.
      broadcastQotdLive(qotd, authUser.id).catch(() => undefined);
    } else if (qotd.publishAt) {
      // Arm the in-memory publish timer for an admin-SCHEDULED QOTD so it goes live
      // exactly at publishAt (event-driven scheduler, no polling). A bare proposal
      // (publishAt null) waits for an admin to schedule/publish it.
      armQotdPublishTimer(qotd);
    }
    await auditLog(authUser.id, isAdmin ? 'CREATE' : 'QOTD_PROPOSED', 'qotd', qotd.id, { question: qotd.question, problemId: qotd.problemId, isPublished: qotd.isPublished });
    return ApiResponse.created(res, qotd, isAdmin ? 'QOTD created successfully' : 'QOTD proposed — an admin will review and publish it');
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
    cancelQotdPublishTimer(qotd.id); // manual publish supersedes any armed auto-publish timer
    invalidateQotdLeaderboardCaches(qotd.id);
    invalidatePublishedQotdCache(); // streak depends on published-day set; new day shifts streaks
    // Materialized streaks for every submitter on this day must reflect the flip.
    recomputeStreaksForQOTDSafe(qotd.id);
    await auditLog(authUser.id, 'QOTD_PUBLISHED', 'qotd', qotd.id);
    broadcastQotdLive(updated, authUser.id).catch(() => undefined);
    // Notify the proposer when an admin publishes someone else's draft. Link to the
    // QOTD's own date (not /qotd/today): a future-dated proposal published "now" is
    // live but isn't today's, so /qotd/today wouldn't resolve to it — a dead link.
    if (qotd.createdById && qotd.createdById !== authUser.id) {
      broadcastNotification({
        source: 'SYSTEM',
        audience: 'CUSTOM',
        audienceUserIds: [qotd.createdById],
        category: 'qotd',
        icon: 'zap',
        title: 'Your QOTD proposal was published and is now live!',
        link: `/qotd/${toIstDateKey(qotd.date)}`,
        refEntity: 'qotd',
        refEntityId: qotd.id,
      }).catch(() => undefined);
    }
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
    cancelQotdPublishTimer(qotd.id); // a held QOTD must not auto-publish
    invalidateQotdLeaderboardCaches(qotd.id);
    invalidatePublishedQotdCache(); // streak depends on published-day set; held days shift streaks
    // Held QOTD becomes "transparent" — every submitter's materialized streak
    // must be recomputed so we don't credit a day that's no longer published.
    recomputeStreaksForQOTDSafe(qotd.id);
    await auditLog(authUser.id, 'QOTD_HELD', 'qotd', qotd.id, { reason: parsed.data.reason });
    return ApiResponse.success(res, updated, 'QOTD held');
  } catch {
    return ApiResponse.internal(res, 'Failed to hold QOTD');
  }
});

// Reopen a PAST QOTD for late submissions via a private signed link.
// PRESIDENT / super admin only. Idempotent — calling it again re-stamps and
// returns a fresh token. The active-day gate is bypassed for link holders, but a
// reopen solve does NOT auto-count: it is judged then HELD (verdict PENDING,
// reopen_pending) and only counts toward streak/marks/leaderboard once an admin
// accepts it from the review queue (see submitProblemForUser + /admin/reopen).
qotdRouter.post('/:id/reopen', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    if (!isPresidentOrSuperAdmin(authUser)) {
      return ApiResponse.forbidden(res, 'Only the President or super admin can reopen a QOTD');
    }
    const qotd = await prisma.qOTD.findUnique({
      where: { id: req.params.id },
      select: { id: true, date: true, problemId: true, isPublished: true, heldBy: true, reopenedAt: true },
    });
    if (!qotd) return ApiResponse.notFound(res, 'QOTD not found');
    if (!qotd.problemId) return ApiResponse.badRequest(res, 'Legacy text-only QOTDs cannot be reopened');
    if (!qotd.isPublished || qotd.heldBy) return ApiResponse.badRequest(res, 'Only a published, non-held QOTD can be reopened');
    if (toIstDateKey(qotd.date) >= formatUsageDate()) {
      return ApiResponse.badRequest(res, "Only a past QOTD can be reopened (today's is already live)");
    }
    // Re-issuing a link for an already-open QOTD must NOT re-stamp reopenedAt:
    // reopenedAt is the session nonce, so keeping it lets prior links from THIS
    // session keep working. A fresh open (was closed) mints a new reopenedAt,
    // which invalidates any link from a previous session.
    const reopenedAt = qotd.reopenedAt ?? new Date();
    if (!qotd.reopenedAt) {
      await prisma.qOTD.update({ where: { id: qotd.id }, data: { reopenedAt, reopenedBy: authUser.id } });
    }
    const dateKey = toIstDateKey(qotd.date);
    const token = signQotdReopenToken({ qotdId: qotd.id, date: dateKey, nonce: reopenedAt.toISOString() });
    await auditLog(authUser.id, 'QOTD_REOPENED', 'qotd', qotd.id, { date: dateKey, fresh: !qotd.reopenedAt });
    return ApiResponse.success(res, { id: qotd.id, date: dateKey, reopenedAt, token }, 'QOTD reopened');
  } catch (error) {
    logger.error('Failed to reopen QOTD', { id: req.params.id, error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to reopen QOTD');
  }
});

// Close a reopened QOTD — revokes every outstanding private link immediately.
qotdRouter.post('/:id/close-reopen', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    if (!isPresidentOrSuperAdmin(authUser)) {
      return ApiResponse.forbidden(res, 'Only the President or super admin can close a reopened QOTD');
    }
    const qotd = await prisma.qOTD.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!qotd) return ApiResponse.notFound(res, 'QOTD not found');
    await prisma.qOTD.update({ where: { id: qotd.id }, data: { reopenedAt: null, reopenedBy: null } });
    await auditLog(authUser.id, 'QOTD_REOPEN_CLOSED', 'qotd', qotd.id);
    return ApiResponse.success(res, { id: qotd.id, reopenedAt: null }, 'Reopened QOTD closed');
  } catch (error) {
    logger.error('Failed to close reopened QOTD', { id: req.params.id, error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to close reopened QOTD');
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

    const isAdmin = isAdminAuth(authUser) || isSuperAdmin(authUser);
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
    const qotd = await prisma.qOTD.findUnique({
      where: { id: req.params.id },
      select: { id: true, isPublished: true, createdById: true },
    });
    if (!qotd) return ApiResponse.notFound(res, 'QOTD not found');
    await prisma.qOTD.delete({ where: { id: req.params.id } });
    cancelQotdPublishTimer(req.params.id); // drop any armed auto-publish timer
    await auditLog(authUser.id, 'DELETE', 'qotd', req.params.id);
    // Notify the proposer when their unpublished draft is rejected.
    if (!qotd.isPublished && qotd.createdById && qotd.createdById !== authUser.id) {
      broadcastNotification({
        source: 'SYSTEM',
        audience: 'CUSTOM',
        audienceUserIds: [qotd.createdById],
        category: 'qotd',
        icon: 'bell',
        title: 'Your QOTD proposal was not selected.',
        refEntity: 'qotd',
        refEntityId: qotd.id,
      }).catch(() => undefined);
    }
    return ApiResponse.success(res, { success: true }, 'QOTD deleted successfully');
  } catch {
    return ApiResponse.internal(res, 'Failed to delete QOTD');
  }
});
