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

export { router as playgroundRouter };
