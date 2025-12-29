import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';

export const achievementsRouter = Router();

// Get all achievements
achievementsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { limit = '50', offset = '0' } = req.query;

    const [achievements, total] = await Promise.all([
      prisma.achievement.findMany({
        orderBy: { date: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
      }),
      prisma.achievement.count(),
    ]);

    res.json({
      success: true,
      data: achievements,
      pagination: { total, limit: parseInt(limit as string), offset: parseInt(offset as string) },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch achievements' } });
  }
});

// Get latest achievements
achievementsRouter.get('/latest', async (req: Request, res: Response) => {
  try {
    const { limit = '6' } = req.query;

    const achievements = await prisma.achievement.findMany({
      orderBy: { date: 'desc' },
      take: parseInt(limit as string),
    });

    res.json({ success: true, data: achievements });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch achievements' } });
  }
});

// Get achievement by ID
achievementsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const achievement = await prisma.achievement.findUnique({
      where: { id: req.params.id },
    });

    if (!achievement) {
      return res.status(404).json({ success: false, error: { message: 'Achievement not found' } });
    }

    res.json({ success: true, data: achievement });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch achievement' } });
  }
});

// Create achievement
achievementsRouter.post('/', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { title, description, eventName, achievedBy, imageUrl, date } = req.body;

    if (!title || !description || !achievedBy) {
      return res.status(400).json({
        success: false,
        error: { message: 'Title, description, and achievedBy are required' },
      });
    }

    const achievement = await prisma.achievement.create({
      data: {
        title,
        description,
        eventName: eventName || null,
        achievedBy,
        imageUrl: imageUrl || null,
        date: date ? new Date(date) : new Date(),
      },
    });

    await auditLog(authUser.id, 'CREATE', 'achievement', achievement.id, { title });
    res.status(201).json({ success: true, data: achievement, message: 'Achievement created successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to create achievement' } });
  }
});

// Update achievement
achievementsRouter.put('/:id', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { title, description, eventName, achievedBy, imageUrl, date } = req.body;

    const achievement = await prisma.achievement.update({
      where: { id: req.params.id },
      data: {
        ...(title && { title }),
        ...(description && { description }),
        ...(eventName !== undefined && { eventName }),
        ...(achievedBy && { achievedBy }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(date && { date: new Date(date) }),
      },
    });

    await auditLog(authUser.id, 'UPDATE', 'achievement', achievement.id);
    res.json({ success: true, data: achievement, message: 'Achievement updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update achievement' } });
  }
});

// Delete achievement
achievementsRouter.delete('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    await prisma.achievement.delete({ where: { id: req.params.id } });
    await auditLog(authUser.id, 'DELETE', 'achievement', req.params.id);
    res.json({ success: true, message: 'Achievement deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to delete achievement' } });
  }
});
