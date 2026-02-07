import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, optionalAuthMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';

export const qotdRouter = Router();

const parsePaginationNumber = (
  input: unknown,
  fallback: number,
  { min, max }: { min: number; max: number }
): number | null => {
  if (input === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(String(input), 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return parsed;
};

// Get today's QOTD
qotdRouter.get('/today', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const qotd = await prisma.qOTD.findFirst({
      where: { date: { gte: today, lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) } },
    });

    if (!qotd) {
      return res.json({ success: true, data: null, message: 'No QOTD for today' });
    }

    const authUser = getAuthUser(req);
    let hasSubmitted = false;
    if (authUser) {
      const submission = await prisma.qOTDSubmission.findUnique({
        where: { userId_qotdId: { qotdId: qotd.id, userId: authUser.id } },
      });
      hasSubmitted = !!submission;
    }

    res.json({ success: true, data: { ...qotd, hasSubmitted } });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch QOTD' } });
  }
});

// Get QOTD history
qotdRouter.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = parsePaginationNumber(req.query.limit, 10, { min: 1, max: 100 });
    const offset = parsePaginationNumber(req.query.offset, 0, { min: 0, max: 1000000 });

    if (limit === null) {
      return res.status(400).json({ success: false, error: { message: 'limit must be an integer between 1 and 100' } });
    }

    if (offset === null) {
      return res.status(400).json({ success: false, error: { message: 'offset must be a non-negative integer' } });
    }

    const [qotds, total] = await Promise.all([
      prisma.qOTD.findMany({
        where: { date: { lte: new Date() } },
        orderBy: { date: 'desc' },
        take: limit,
        skip: offset,
        include: { _count: { select: { submissions: true } } },
      }),
      prisma.qOTD.count({ where: { date: { lte: new Date() } } }),
    ]);

    res.json({
      success: true,
      data: qotds,
      pagination: { total, limit, offset },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch QOTD history' } });
  }
});

// Get QOTD by ID
qotdRouter.get('/:id', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const qotd = await prisma.qOTD.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { submissions: true } } },
    });

    if (!qotd) {
      return res.status(404).json({ success: false, error: { message: 'QOTD not found' } });
    }

    const authUser = getAuthUser(req);
    let hasSubmitted = false;
    if (authUser) {
      const submission = await prisma.qOTDSubmission.findUnique({
        where: { userId_qotdId: { qotdId: qotd.id, userId: authUser.id } },
      });
      hasSubmitted = !!submission;
    }

    res.json({ success: true, data: { ...qotd, hasSubmitted } });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch QOTD' } });
  }
});

// Submit QOTD answer
qotdRouter.post('/:id/submit', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const qotdId = req.params.id;

    const qotd = await prisma.qOTD.findUnique({ where: { id: qotdId } });
    if (!qotd) {
      return res.status(404).json({ success: false, error: { message: 'QOTD not found' } });
    }

    const existing = await prisma.qOTDSubmission.findUnique({
      where: { userId_qotdId: { qotdId, userId: authUser.id } },
    });

    if (existing) {
      return res.status(400).json({ success: false, error: { message: 'Already submitted' } });
    }

    const submission = await prisma.qOTDSubmission.create({
      data: { qotdId, userId: authUser.id },
    });

    res.status(201).json({ success: true, data: submission, message: 'Submission recorded' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to submit' } });
  }
});

// Get leaderboard
qotdRouter.get('/stats/leaderboard', async (req: Request, res: Response) => {
  try {
    const limit = parsePaginationNumber(req.query.limit, 10, { min: 1, max: 100 });
    if (limit === null) {
      return res.status(400).json({ success: false, error: { message: 'limit must be an integer between 1 and 100' } });
    }

    const submissions = await prisma.qOTDSubmission.groupBy({
      by: ['userId'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });

    const userIds = submissions.map((s) => s.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, avatar: true },
    });
    const usersById = new Map(users.map((user) => [user.id, user]));

    const leaderboard = submissions.map((s) => {
      const user = usersById.get(s.userId);
      return { user: user || { id: s.userId, name: 'Unknown', avatar: null }, submissions: s._count.id };
    });

    res.json({ success: true, data: leaderboard });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch leaderboard' } });
  }
});

// Create QOTD
qotdRouter.post('/', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { question, difficulty, problemLink, date } = req.body;

    if (!question || !difficulty || !date || !problemLink) {
      return res.status(400).json({ success: false, error: { message: 'Question, difficulty, problemLink, and date are required' } });
    }

    const qotd = await prisma.qOTD.create({
      data: { question, difficulty, problemLink, date: new Date(date) },
    });

    await auditLog(authUser.id, 'CREATE', 'qotd', qotd.id, { question: qotd.question });
    res.status(201).json({ success: true, data: qotd, message: 'QOTD created successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to create QOTD' } });
  }
});

// Update QOTD
qotdRouter.put('/:id', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { question, difficulty, problemLink, date } = req.body;

    const qotd = await prisma.qOTD.update({
      where: { id: req.params.id },
      data: {
        ...(question && { question }),
        ...(difficulty && { difficulty }),
        ...(problemLink !== undefined && { problemLink }),
        ...(date && { date: new Date(date) }),
      },
    });

    await auditLog(authUser.id, 'UPDATE', 'qotd', qotd.id);
    res.json({ success: true, data: qotd, message: 'QOTD updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update QOTD' } });
  }
});

// Delete QOTD
qotdRouter.delete('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    await prisma.qOTD.delete({ where: { id: req.params.id } });
    await auditLog(authUser.id, 'DELETE', 'qotd', req.params.id);
    res.json({ success: true, message: 'QOTD deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to delete QOTD' } });
  }
});
