// ---------------------------------------------------------------------------
// Playground Routes — Snippets & Execution Stats for main site dashboard
// ---------------------------------------------------------------------------
// These routes let the main site (codescriet.dev) access playground data
// stored in the shared PostgreSQL database. The playground execute-server
// writes to these same tables.
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { getAuthUser } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

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
    console.error('[Playground] Failed to list snippets:', error);
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

    // Executions today (for daily limit display)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = await prisma.execution.count({
      where: {
        userId: user.id,
        executedAt: { gte: todayStart },
      },
    });

    return res.json({
      success: true,
      data: {
        languageStats: languageStats.map(s => ({
          language: s.language,
          count: s._count.id,
        })),
        totalExecutions,
        todayCount,
        dailyLimit: 200,
      },
    });
  } catch (error) {
    console.error('[Playground] Failed to fetch stats:', error);
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
    console.error('[Playground] Failed to fetch history:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
});

// ---------------------------------------------------------------------------
// Admin — Reset a user's daily execution limit (ADMIN only)
// ---------------------------------------------------------------------------

/** Reset a specific user's daily execution limit */
router.post('/admin/reset-limit/:userId', async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) return res.status(401).json({ error: 'Not authenticated' });
    if (!['ADMIN', 'CORE_MEMBER'].includes(admin.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const { userId } = req.params;
    const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 200) : '';

    // Verify target user exists
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!target) return res.status(404).json({ success: false, error: 'User not found' });

    // Insert a reset record into playground_limit_resets (raw SQL — table managed by execute-server)
    await prisma.$executeRaw`
      INSERT INTO playground_limit_resets (id, user_id, reset_by, note, reset_at)
      VALUES (gen_random_uuid(), ${userId}, ${admin.id}, ${note}, NOW())
      ON CONFLICT DO NOTHING
    `;

    await prisma.$executeRaw`
      INSERT INTO playground_daily_usage (user_id, usage_date, count, updated_at)
      VALUES (${userId}, CURRENT_DATE, 0, NOW())
      ON CONFLICT (user_id, usage_date)
      DO UPDATE SET count = 0, updated_at = NOW()
    `;

    console.log(`[Admin] ${admin.email} reset playground daily limit for ${target.email}`);
    return res.json({
      success: true,
      message: `Daily execution limit reset for ${target.email}`,
      resetAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Playground] Failed to reset limit:', error);
    return res.status(500).json({ success: false, error: 'Failed to reset limit' });
  }
});

/** Get users with their today's execution counts */
router.get('/admin/execution-counts', async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) return res.status(401).json({ error: 'Not authenticated' });
    if (!['ADMIN', 'CORE_MEMBER'].includes(admin.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const counts = await prisma.$queryRaw<Array<{ user_id: string; today_count: bigint; last_run_at: Date | null }>>`
      SELECT
        p.user_id,
        p.count::int AS today_count,
        MAX(e.executed_at) AS last_run_at
      FROM playground_daily_usage p
      LEFT JOIN executions e ON e.user_id = p.user_id AND e.executed_at >= CURRENT_DATE
      WHERE p.usage_date = CURRENT_DATE
      GROUP BY p.user_id, p.count
      ORDER BY today_count DESC
      LIMIT 100
    `;

    return res.json({
      success: true,
      data: counts.map(r => ({
        userId: r.user_id,
        todayCount: Number(r.today_count),
        lastRunAt: r.last_run_at,
      })),
    });
  } catch (error) {
    console.error('[Playground] Failed to get execution counts:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch counts' });
  }
});

export { router as playgroundRouter };
