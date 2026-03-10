// ---------------------------------------------------------------------------
// Playground Routes — Snippets & Execution Stats for main site dashboard
// ---------------------------------------------------------------------------
// These routes let the main site (codescriet.dev) access playground data
// stored in the shared PostgreSQL database. The playground execute-server
// writes to these same tables.
// ---------------------------------------------------------------------------

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { logger } from '../utils/logger.js';

const router = Router();
const PLAYGROUND_DAILY_LIMIT = Number(process.env.PLAYGROUND_DAILY_LIMIT || 200);
const SETTINGS_CACHE_TTL_MS = 60 * 1000;

const playgroundSettingsCache: {
  expiresAt: number;
  enabled: boolean;
} = {
  expiresAt: 0,
  enabled: true,
};

const getUsageDate = (): Date => {
  const usageDate = new Date();
  usageDate.setUTCHours(0, 0, 0, 0);
  return usageDate;
};

// All routes require authentication
router.use(authMiddleware);

// Gate: check if playground feature is enabled
router.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = Date.now();
    if (now >= playgroundSettingsCache.expiresAt) {
      const settings = await prisma.settings.findUnique({ where: { id: 'default' }, select: { playgroundEnabled: true } });
      playgroundSettingsCache.enabled = settings?.playgroundEnabled !== false;
      playgroundSettingsCache.expiresAt = now + SETTINGS_CACHE_TTL_MS;
    }

    if (!playgroundSettingsCache.enabled) {
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
        dailyLimit: PLAYGROUND_DAILY_LIMIT,
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
router.post('/admin/reset-limit/:userId', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) return res.status(401).json({ error: 'Not authenticated' });

    const { userId } = req.params;
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

    await prisma.playgroundDailyUsage.upsert({
      where: {
        userId_usageDate: {
          userId,
          usageDate: getUsageDate(),
        },
      },
      create: {
        userId,
        usageDate: getUsageDate(),
        count: 0,
      },
      update: {
        count: 0,
      },
    });

    logger.info('[Playground] Admin reset daily limit', { adminEmail: admin.email, targetEmail: target.email });
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
router.get('/admin/execution-counts', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const usageDate = getUsageDate();
    const counts = await prisma.playgroundDailyUsage.findMany({
      where: { usageDate },
      orderBy: { count: 'desc' },
      take: 100,
      select: {
        userId: true,
        count: true,
      },
    });

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
        lastRunAt: latestByUser.get(r.userId) || null,
      })),
    });
  } catch (error) {
    logger.error('[Playground] Failed to get execution counts', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ success: false, error: 'Failed to fetch counts' });
  }
});

export { router as playgroundRouter };
