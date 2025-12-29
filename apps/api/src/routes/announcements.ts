import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';

export const announcementsRouter = Router();

// Get all announcements
announcementsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { limit = '10', offset = '0' } = req.query;

    const [announcements, total] = await Promise.all([
      prisma.announcement.findMany({
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
        include: { creator: { select: { id: true, name: true, avatar: true } } },
      }),
      prisma.announcement.count(),
    ]);

    res.json({
      success: true,
      data: announcements,
      pagination: { total, limit: parseInt(limit as string), offset: parseInt(offset as string) },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch announcements' } });
  }
});

// Get latest announcements
announcementsRouter.get('/latest', async (req: Request, res: Response) => {
  try {
    const { limit = '5' } = req.query;

    const announcements = await prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      include: { creator: { select: { id: true, name: true, avatar: true } } },
    });

    res.json({ success: true, data: announcements });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch announcements' } });
  }
});

// Get announcement by ID
announcementsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const announcement = await prisma.announcement.findUnique({
      where: { id: req.params.id },
      include: { creator: { select: { id: true, name: true, avatar: true } } },
    });

    if (!announcement) {
      return res.status(404).json({ success: false, error: { message: 'Announcement not found' } });
    }

    res.json({ success: true, data: announcement });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch announcement' } });
  }
});

// Create announcement
announcementsRouter.post('/', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { title, body, priority } = req.body;

    if (!title || !body) {
      return res.status(400).json({ success: false, error: { message: 'Title and body are required' } });
    }

    const announcement = await prisma.announcement.create({
      data: {
        title,
        body,
        priority: priority || 'MEDIUM',
        createdBy: authUser.id,
      },
      include: { creator: { select: { id: true, name: true, avatar: true } } },
    });

    await auditLog(authUser.id, 'CREATE', 'announcement', announcement.id, { title });
    res.status(201).json({ success: true, data: announcement, message: 'Announcement created successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to create announcement' } });
  }
});

// Update announcement
announcementsRouter.put('/:id', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { title, body, priority } = req.body;

    const announcement = await prisma.announcement.update({
      where: { id: req.params.id },
      data: {
        ...(title && { title }),
        ...(body && { body }),
        ...(priority && { priority }),
      },
      include: { creator: { select: { id: true, name: true, avatar: true } } },
    });

    await auditLog(authUser.id, 'UPDATE', 'announcement', announcement.id);
    res.json({ success: true, data: announcement, message: 'Announcement updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update announcement' } });
  }
});

// Delete announcement
announcementsRouter.delete('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    await prisma.announcement.delete({ where: { id: req.params.id } });
    await auditLog(authUser.id, 'DELETE', 'announcement', req.params.id);
    res.json({ success: true, message: 'Announcement deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to delete announcement' } });
  }
});
