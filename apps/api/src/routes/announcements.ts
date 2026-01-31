import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import { generateSlug, generateUniqueSlug } from '../utils/slug.js';
import { emailService } from '../utils/email.js';
import { logger } from '../utils/logger.js';

export const announcementsRouter = Router();

// Get all announcements (with pinned first, then by date)
announcementsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { limit = '20', offset = '0', featured } = req.query;

    const where: Record<string, unknown> = {};
    
    // Filter expired announcements
    where.OR = [
      { expiresAt: null },
      { expiresAt: { gte: new Date() } }
    ];
    
    if (featured === 'true') {
      where.featured = true;
    }

    const [announcements, total] = await Promise.all([
      prisma.announcement.findMany({
        where,
        orderBy: [
          { pinned: 'desc' },
          { createdAt: 'desc' }
        ],
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
        include: { creator: { select: { id: true, name: true, avatar: true } } },
      }),
      prisma.announcement.count({ where }),
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

// Get latest announcements (for homepage widget)
announcementsRouter.get('/latest', async (req: Request, res: Response) => {
  try {
    const { limit = '5' } = req.query;

    const announcements = await prisma.announcement.findMany({
      where: {
        OR: [
          { expiresAt: null },
          { expiresAt: { gte: new Date() } }
        ]
      },
      orderBy: [
        { pinned: 'desc' },
        { createdAt: 'desc' }
      ],
      take: parseInt(limit as string),
      include: { creator: { select: { id: true, name: true, avatar: true } } },
    });

    res.json({ success: true, data: announcements });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch announcements' } });
  }
});

// Get announcement by ID or slug
announcementsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const idOrSlug = req.params.id;
    
    const announcement = await prisma.announcement.findFirst({
      where: {
        OR: [
          { id: idOrSlug },
          { slug: idOrSlug }
        ]
      },
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
    const data = req.body;

    if (!data.title || !data.body) {
      return res.status(400).json({ success: false, error: { message: 'Title and body are required' } });
    }

    // Generate slug from title
    const baseSlug = generateSlug(data.title);
    const existingSlugs = (await prisma.announcement.findMany({ select: { slug: true } })).map(a => a.slug).filter(Boolean) as string[];
    const slug = generateUniqueSlug(baseSlug, existingSlugs);

    const announcement = await prisma.announcement.create({
      data: {
        title: data.title,
        slug,
        body: data.body,
        shortDescription: data.shortDescription || null,
        priority: data.priority || 'MEDIUM',
        imageUrl: data.imageUrl || null,
        imageGallery: data.imageGallery || null,
        attachments: data.attachments || null,
        links: data.links || null,
        tags: data.tags || [],
        featured: data.featured || false,
        pinned: data.pinned || false,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        createdBy: authUser.id,
      },
      include: { creator: { select: { id: true, name: true, avatar: true } } },
    });

    await auditLog(authUser.id, 'CREATE', 'announcement', announcement.id, { title: data.title });

    // Send email notification to all users (async, don't wait)
    sendAnnouncementEmailsAsync(announcement);

    res.status(201).json({ success: true, data: announcement, message: 'Announcement created successfully' });
  } catch (error) {
    logger.error('Failed to create announcement:', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: { message: 'Failed to create announcement' } });
  }
});

// Helper function to send announcement emails asynchronously
async function sendAnnouncementEmailsAsync(announcement: {
  title: string;
  body: string;
  priority: string;
  slug: string | null;
  shortDescription?: string | null;
  imageUrl?: string | null;
  tags?: string[];
}) {
  try {
    // Get all users with email
    const users = await prisma.user.findMany({
      where: { email: { not: '' } },
      select: { email: true },
    });

    const emails = users.map(u => u.email).filter(Boolean) as string[];
    
    if (emails.length === 0) {
      logger.info('No users to notify for announcement');
      return;
    }

    logger.info(`📧 Sending announcement email to ${emails.length} users...`, { title: announcement.title });

    await emailService.sendAnnouncementToAll(
      emails,
      announcement.title,
      announcement.body,
      announcement.priority,
      announcement.slug || '',
      announcement.shortDescription || undefined,
      announcement.imageUrl || undefined,
      announcement.tags || []
    );

    logger.info(`✅ Announcement emails sent to ${emails.length} users`);
  } catch (error) {
    logger.error('Failed to send announcement emails', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Update announcement
announcementsRouter.put('/:id', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const data = req.body;

    // If title changed, regenerate slug
    let slugUpdate = {};
    if (data.title) {
      const baseSlug = generateSlug(data.title);
      const existingSlugs = (await prisma.announcement.findMany({ 
        where: { id: { not: req.params.id } },
        select: { slug: true } 
      })).map(a => a.slug).filter(Boolean) as string[];
      const newSlug = generateUniqueSlug(baseSlug, existingSlugs);
      slugUpdate = { slug: newSlug };
    }

    const announcement = await prisma.announcement.update({
      where: { id: req.params.id },
      data: {
        ...(data.title && { title: data.title }),
        ...slugUpdate,
        ...(data.body && { body: data.body }),
        ...(data.shortDescription !== undefined && { shortDescription: data.shortDescription }),
        ...(data.priority && { priority: data.priority }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
        ...(data.imageGallery !== undefined && { imageGallery: data.imageGallery }),
        ...(data.attachments !== undefined && { attachments: data.attachments }),
        ...(data.links !== undefined && { links: data.links }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.featured !== undefined && { featured: data.featured }),
        ...(data.pinned !== undefined && { pinned: data.pinned }),
        ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null }),
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
