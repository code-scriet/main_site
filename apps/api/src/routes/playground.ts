// ---------------------------------------------------------------------------
// Playground Routes — Snippets & Execution Stats for main site dashboard
// ---------------------------------------------------------------------------
// These routes let the main site (codescriet.dev) access playground data
// stored in the shared PostgreSQL database. The playground execute-server
// writes to these same tables.
// ---------------------------------------------------------------------------

import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { logger } from '../utils/logger.js';
import { getUsageDate, resetDailyQuotaAndPracticeCounters } from '../utils/dailyLimit.js';
import { auditLog } from '../utils/audit.js';
import { requireUuid } from '../utils/idParams.js';

const router = Router();
const SETTINGS_CACHE_TTL_MS = 15 * 1000;
const DEFAULT_PLAYGROUND_DAILY_LIMIT = 100;

const executionCountsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Try again in a minute.' },
});

const playgroundSettingsCache: {
  expiresAt: number;
  enabled: boolean;
  dailyLimit: number;
} = {
  expiresAt: 0,
  enabled: true,
  dailyLimit: DEFAULT_PLAYGROUND_DAILY_LIMIT,
};

const getCachedPlaygroundSettings = async (): Promise<{ enabled: boolean; dailyLimit: number }> => {
  const now = Date.now();
  if (now < playgroundSettingsCache.expiresAt) {
    return {
      enabled: playgroundSettingsCache.enabled,
      dailyLimit: playgroundSettingsCache.dailyLimit,
    };
  }

  const settings = await prisma.settings.findUnique({
    where: { id: 'default' },
    select: { playgroundEnabled: true, playgroundDailyLimit: true },
  });

  playgroundSettingsCache.enabled = settings?.playgroundEnabled !== false;
  playgroundSettingsCache.dailyLimit =
    Number.isInteger(settings?.playgroundDailyLimit)
      ? Math.max(1, Number(settings!.playgroundDailyLimit))
      : DEFAULT_PLAYGROUND_DAILY_LIMIT;
  playgroundSettingsCache.expiresAt = now + SETTINGS_CACHE_TTL_MS;

  return {
    enabled: playgroundSettingsCache.enabled,
    dailyLimit: playgroundSettingsCache.dailyLimit,
  };
};

const serializeResetRequest = (request: {
  id: string;
  userId: string;
  note: string | null;
  status: string;
  decidedBy: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  user?: { id: string; name: string; email: string; avatar: string | null };
}) => ({
  id: request.id,
  userId: request.userId,
  note: request.note,
  status: request.status,
  decidedBy: request.decidedBy,
  decidedAt: request.decidedAt?.toISOString() ?? null,
  createdAt: request.createdAt.toISOString(),
  ...(request.user ? { user: request.user } : {}),
});

const normalizeResetNote = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const note = value.trim().slice(0, 500);
  return note.length ? note : null;
};

// All routes require authentication
router.use(authMiddleware);

// Gate: check if playground feature is enabled
router.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await getCachedPlaygroundSettings();
    if (!settings.enabled) {
      return res.status(403).json({ success: false, error: { message: 'Code Playground is currently disabled' } });
    }
    next();
  } catch {
    next();
  }
});

// ---------------------------------------------------------------------------
// Snippets
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Daily limit reset requests
// ---------------------------------------------------------------------------

/** User asks an admin to reset today's playground limit */
router.post('/request-reset', async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const existing = await prisma.playgroundLimitResetRequest.findFirst({
      where: { userId: user.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return res.json({ success: true, data: { request: serializeResetRequest(existing) } });
    }

    const request = await prisma.playgroundLimitResetRequest.create({
      data: {
        userId: user.id,
        note: normalizeResetNote(req.body?.note),
      },
    });

    return res.status(201).json({ success: true, data: { request: serializeResetRequest(request) } });
  } catch (error) {
    logger.error('[Playground] Failed to create reset request', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ success: false, error: 'Failed to request reset' });
  }
});

/** Latest reset request for the current user */
router.get('/my-reset-request', async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const request = await prisma.playgroundLimitResetRequest.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({
      success: true,
      data: { request: request ? serializeResetRequest(request) : null },
    });
  } catch (error) {
    logger.error('[Playground] Failed to fetch my reset request', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ success: false, error: 'Failed to fetch reset request' });
  }
});

/** Admin inbox of pending playground reset requests */
router.get('/admin/pending-reset-requests', requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const requests = await prisma.playgroundLimitResetRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    });

    return res.json({
      success: true,
      data: { requests: requests.map(serializeResetRequest) },
    });
  } catch (error) {
    logger.error('[Playground] Failed to fetch pending reset requests', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ success: false, error: 'Failed to fetch reset requests' });
  }
});

/** Admin grants a pending reset request */
router.post('/admin/reset-requests/:id/grant', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) return res.status(401).json({ error: 'Not authenticated' });
    if (!requireUuid(res, req.params.id, 'reset request ID')) {
      return;
    }

    const request = await prisma.playgroundLimitResetRequest.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    if (!request) return res.status(404).json({ success: false, error: 'Reset request not found' });
    if (request.status !== 'PENDING') {
      return res.status(409).json({ success: false, error: 'Reset request was already decided' });
    }

    const decidedAt = new Date();
    const note = normalizeResetNote(req.body?.note) ?? request.note ?? 'Granted from reset request inbox';
    const updated = await prisma.$transaction(async (tx) => {
      const granted = await tx.playgroundLimitResetRequest.update({
        where: { id: request.id },
        data: { status: 'GRANTED', decidedBy: admin.id, decidedAt },
        include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
      });
      await tx.playgroundLimitReset.create({
        data: {
          userId: request.userId,
          resetBy: admin.id,
          note,
        },
      });
      return granted;
    });

    await resetDailyQuotaAndPracticeCounters(request.userId);
    await auditLog(admin.id, 'PLAYGROUND_LIMIT_RESET_REQUEST_GRANTED', 'PlaygroundLimitResetRequest', request.id, {
      userId: request.userId,
      resetDailyQuota: true,
      resetPracticeProblemCounters: true,
      note,
    });

    logger.info('[Playground] Admin granted reset request', { adminEmail: admin.email, targetEmail: request.user.email, requestId: request.id });
    return res.json({ success: true, data: { request: serializeResetRequest(updated) } });
  } catch (error) {
    logger.error('[Playground] Failed to grant reset request', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ success: false, error: 'Failed to grant reset request' });
  }
});

/** Admin denies a pending reset request */
router.post('/admin/reset-requests/:id/deny', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) return res.status(401).json({ error: 'Not authenticated' });
    if (!requireUuid(res, req.params.id, 'reset request ID')) {
      return;
    }

    const request = await prisma.playgroundLimitResetRequest.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    if (!request) return res.status(404).json({ success: false, error: 'Reset request not found' });
    if (request.status !== 'PENDING') {
      return res.status(409).json({ success: false, error: 'Reset request was already decided' });
    }

    const updated = await prisma.playgroundLimitResetRequest.update({
      where: { id: request.id },
      data: { status: 'DENIED', decidedBy: admin.id, decidedAt: new Date() },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });

    await auditLog(admin.id, 'PLAYGROUND_LIMIT_RESET_REQUEST_DENIED', 'PlaygroundLimitResetRequest', request.id, {
      userId: request.userId,
      note: normalizeResetNote(req.body?.note),
    });

    logger.info('[Playground] Admin denied reset request', { adminEmail: admin.email, targetEmail: request.user.email, requestId: request.id });
    return res.json({ success: true, data: { request: serializeResetRequest(updated) } });
  } catch (error) {
    logger.error('[Playground] Failed to deny reset request', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ success: false, error: 'Failed to deny reset request' });
  }
});

/** List current user's snippets */
router.get('/snippets', async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const snippets = await prisma.snippet.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    return res.json({
      success: true,
      data: snippets.map(s => ({
        id: s.id,
        title: s.title,
        language: s.language,
        code: s.code,
        isPublic: s.isPublic,
        shareToken: s.shareToken,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    });
  } catch (error) {
    logger.error('[Playground] Failed to list snippets', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ success: false, error: 'Failed to fetch snippets' });
  }
});

/** Get a single snippet by ID */
router.get('/snippets/:id', async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    if (!requireUuid(res, req.params.id, 'snippet ID')) {
      return;
    }

    const snippet = await prisma.snippet.findUnique({ where: { id: req.params.id } });
    if (!snippet) return res.status(404).json({ success: false, error: 'Snippet not found' });
    if (snippet.userId !== user.id) return res.status(403).json({ success: false, error: 'Not your snippet' });

    return res.json({ success: true, data: snippet });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch snippet' });
  }
});

// ---------------------------------------------------------------------------
// Execution Stats — language counters (no full code stored for stats)
// ---------------------------------------------------------------------------

/** Get user's language usage stats + execution count */
router.get('/stats', async (req: Request, res: Response) => {
  try {
  const settings = await getCachedPlaygroundSettings();

    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    // Language distribution — grouped counts
    const languageStats = await prisma.execution.groupBy({
      by: ['language'],
      where: { userId: user.id },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    // Total executions
    const totalExecutions = await prisma.execution.count({
      where: { userId: user.id },
    });

    // Metered executions today (C/C++/Java only, from session counter table)
    const usageDate = getUsageDate();
    const usageRow = await prisma.playgroundDailyUsage.findUnique({
      where: {
        userId_usageDate: {
          userId: user.id,
          usageDate,
        },
      },
      select: { count: true },
    });
    const todayCount = usageRow?.count || 0;

    return res.json({
      success: true,
      data: {
        languageStats: languageStats.map(s => ({
          language: s.language,
          count: s._count.id,
        })),
        totalExecutions,
        todayCount,
        dailyLimit: settings.dailyLimit,
      },
    });
  } catch (error) {
    logger.error('[Playground] Failed to fetch stats', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

/** Get recent execution history (last 20 with code) */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const history = await prisma.execution.findMany({
      where: {
        userId: user.id,
        code: { not: null },
      },
      orderBy: { executedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        language: true,
        code: true,
        outputText: true,
        durationMs: true,
        status: true,
        executedAt: true,
      },
    });

    return res.json({
      success: true,
      data: history.map(h => ({
        id: h.id,
        language: h.language,
        code: h.code,
        output: h.outputText,
        durationMs: h.durationMs,
        status: h.status,
        executedAt: h.executedAt,
      })),
    });
  } catch (error) {
    logger.error('[Playground] Failed to fetch history', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
});

// ---------------------------------------------------------------------------
// Admin — Reset a user's daily execution limit (ADMIN only)
// ---------------------------------------------------------------------------

/** Reset a specific user's daily execution limit */
router.post('/admin/reset-limit/:userId', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) return res.status(401).json({ error: 'Not authenticated' });

    const { userId } = req.params;
    if (!requireUuid(res, userId, 'user ID')) {
      return;
    }
    const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 200) : '';

    // Verify target user exists
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!target) return res.status(404).json({ success: false, error: 'User not found' });

    await prisma.playgroundLimitReset.create({
      data: {
        userId,
        resetBy: admin.id,
        note,
      },
    });
    await prisma.playgroundLimitResetRequest.updateMany({
      where: { userId, status: 'PENDING' },
      data: {
        status: 'GRANTED',
        decidedBy: admin.id,
        decidedAt: new Date(),
      },
    });
    await resetDailyQuotaAndPracticeCounters(userId);
    await auditLog(admin.id, 'PLAYGROUND_LIMIT_RESET', 'User', userId, {
      resetDailyQuota: true,
      resetPracticeProblemCounters: true,
      note,
    });

    logger.info('[Playground] Admin reset daily limit and practice caps', { adminEmail: admin.email, targetEmail: target.email });
    return res.json({
      success: true,
      message: `Daily execution limit reset for ${target.email}`,
      resetAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[Playground] Failed to reset limit', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ success: false, error: 'Failed to reset limit' });
  }
});

/** Get users with their today's execution counts */
router.get('/admin/execution-counts', requireRole('ADMIN'), executionCountsLimiter, async (req: Request, res: Response) => {
  try {
    const settings = await getCachedPlaygroundSettings();
    const usageDate = getUsageDate();
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '50', 10) || 50));
    const skip = (page - 1) * limit;

    const [counts, total] = await Promise.all([
      prisma.playgroundDailyUsage.findMany({
        where: { usageDate },
        orderBy: { count: 'desc' },
        skip,
        take: limit,
        select: {
          userId: true,
          count: true,
        },
      }),
      prisma.playgroundDailyUsage.count({ where: { usageDate } }),
    ]);

    const userIds = counts.map((row) => row.userId);
    const latestExecutions = userIds.length
      ? await prisma.execution.groupBy({
          by: ['userId'],
          where: {
            userId: { in: userIds },
            executedAt: { gte: usageDate },
          },
          _max: { executedAt: true },
        })
      : [];

    const latestByUser = new Map(latestExecutions.map((row) => [row.userId, row._max.executedAt || null]));

    return res.json({
      success: true,
      data: counts.map(r => ({
        userId: r.userId,
        todayCount: r.count,
        dailyLimit: settings.dailyLimit,
        lastRunAt: latestByUser.get(r.userId) || null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    logger.error('[Playground] Failed to get execution counts', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ success: false, error: 'Failed to fetch counts' });
  }
});

export { router as playgroundRouter };
