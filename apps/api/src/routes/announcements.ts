import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import { generateSlug, generateUniqueSlug } from '../utils/slug.js';
import { emailService } from '../utils/email.js';
import { logger } from '../utils/logger.js';
import { submitUrl } from '../utils/indexnow.js';
import { parsePaginationNumber } from '../utils/pagination.js';
import { sanitizeHtml } from '../utils/sanitize.js';

export const announcementsRouter = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const optionalUrl = z.union([z.string().url('Must be a valid URL'), z.literal(''), z.null()]).optional();

const announcementLinkSchema = z.object({
  title: z.string().trim().min(1).max(120).refine((value) => !/[<>"&]/.test(value), {
    message: 'Link title contains invalid characters',
  }),
  url: z.string().url('Link URL must be valid'),
});

const announcementAttachmentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  url: z.string().url('Attachment URL must be valid'),
  type: z.string().trim().max(40).optional(),
});

const createAnnouncementSchema = z.object({
  title: z.string().trim().min(3).max(180),
  body: z.string().trim().min(10).max(20000),
  shortDescription: z.string().trim().max(320).optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  imageUrl: optionalUrl,
  imageGallery: z.array(z.string().url('Image URL must be valid')).max(20).optional().nullable(),
  attachments: z.array(announcementAttachmentSchema).max(20).optional().nullable(),
  links: z.array(announcementLinkSchema).max(20).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  featured: z.boolean().optional(),
  pinned: z.boolean().optional(),
  expiresAt: z.coerce.date().optional().nullable(),
});

const updateAnnouncementSchema = createAnnouncementSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required' }
);

const normalizeOptionalText = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toNullableJsonValue = (
  value: unknown
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
};

// Get all announcements (with pinned first, then by date)
announcementsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { featured } = req.query;
    const limit = parsePaginationNumber(req.query.limit, 20, { min: 1, max: 100 });
    const offset = parsePaginationNumber(req.query.offset, 0, { min: 0, max: 1000000 });

    if (limit === null) {
      return res.status(400).json({ success: false, error: { message: 'limit must be an integer between 1 and 100' } });
    }

    if (offset === null) {
      return res.status(400).json({ success: false, error: { message: 'offset must be a non-negative integer' } });
    }

    if (offset + limit > 10000) {
      return res.status(400).json({
        success: false,
        error: { message: 'offset + limit must be at most 10000' },
      });
    }

    const where: Record<string, unknown> = {};
    
    // Filter expired announcements
    where.OR = [
      { expiresAt: null },
      { expiresAt: { gte: new Date() } }
    ];
    
    if (featured === 'true') {
      where.featured = true;
    }

    const listSelect = {
      id: true,
      title: true,
      slug: true,
      body: true,
      shortDescription: true,
      priority: true,
      imageUrl: true,
      imageGallery: true,
      tags: true,
      featured: true,
      pinned: true,
      expiresAt: true,
      createdBy: true,
      createdAt: true,
      creator: { select: { id: true, name: true, avatar: true } },
    } satisfies Prisma.AnnouncementSelect;

    const announcements = await prisma.announcement.findMany({
      where,
      orderBy: [
        { pinned: 'desc' },
        { createdAt: 'desc' }
      ],
      take: limit,
      skip: offset,
      select: listSelect,
    });
    const shouldCount = !(offset === 0 && announcements.length < limit);
    const total = shouldCount ? await prisma.announcement.count({ where }) : announcements.length;

    res.json({
      success: true,
      data: announcements,
      pagination: { total, limit, offset },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch announcements' } });
  }
});

// Get latest announcements (for homepage widget)
announcementsRouter.get('/latest', async (req: Request, res: Response) => {
  try {
    const limit = parsePaginationNumber(req.query.limit, 5, { min: 1, max: 50 });

    if (limit === null) {
      return res.status(400).json({ success: false, error: { message: 'limit must be an integer between 1 and 50' } });
    }

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
      take: limit,
      select: {
        id: true,
        title: true,
        slug: true,
        body: true,
        shortDescription: true,
        priority: true,
        imageUrl: true,
        imageGallery: true,
        tags: true,
        featured: true,
        pinned: true,
        createdBy: true,
        createdAt: true,
        creator: { select: { id: true, name: true, avatar: true } },
      },
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
    const includeOptions = { creator: { select: { id: true, name: true, avatar: true } } } as const;
    const announcement = UUID_REGEX.test(idOrSlug)
      ? (await prisma.announcement.findUnique({ where: { id: idOrSlug }, include: includeOptions })) ??
        (await prisma.announcement.findUnique({ where: { slug: idOrSlug }, include: includeOptions }))
      : (await prisma.announcement.findUnique({ where: { slug: idOrSlug }, include: includeOptions })) ??
        (await prisma.announcement.findUnique({ where: { id: idOrSlug }, include: includeOptions }));

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
    const parsed = createAnnouncementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { message: parsed.error.errors[0]?.message || 'Invalid announcement payload' } });
    }
    const data = parsed.data;

    // Generate slug from title
    const baseSlug = generateSlug(data.title) || 'announcement';
    const existingSlugs = (
      await prisma.announcement.findMany({
        where: { slug: { startsWith: baseSlug } },
        select: { slug: true },
      })
    ).map((announcement) => announcement.slug).filter(Boolean) as string[];
    const slug = generateUniqueSlug(baseSlug, existingSlugs);

    const announcement = await prisma.announcement.create({
      data: {
        title: data.title,
        slug,
        body: sanitizeHtml(data.body),
        shortDescription: normalizeOptionalText(data.shortDescription),
        priority: data.priority || 'MEDIUM',
        imageUrl: normalizeOptionalText(data.imageUrl),
        imageGallery: toNullableJsonValue(data.imageGallery),
        attachments: toNullableJsonValue(data.attachments),
        links: toNullableJsonValue(data.links),
        tags: data.tags || [],
        featured: data.featured || false,
        pinned: data.pinned || false,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        createdBy: authUser.id,
      },
      include: { creator: { select: { id: true, name: true, avatar: true } } },
    });

    await auditLog(authUser.id, 'CREATE', 'announcement', announcement.id, { title: data.title });

    // Notify search engines about the new announcement page
    if (announcement.slug) submitUrl(`/announcements/${announcement.slug}`);

    // Send email notification to all users (async, don't wait)
    void sendAnnouncementEmailsAsync(announcement);

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
    // Get all users with email, excluding NETWORK role users (they should never receive bulk emails)
    const users = await prisma.user.findMany({
      where: { 
        email: { not: '' },
        role: { not: 'NETWORK' },
      },
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
    const parsed = updateAnnouncementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { message: parsed.error.errors[0]?.message || 'Invalid announcement payload' } });
    }
    const data = parsed.data;

    // If title changed, regenerate slug
    let slugUpdate = {};
    if (data.title) {
      const baseSlug = generateSlug(data.title) || 'announcement';
      const existingSlugs = (
        await prisma.announcement.findMany({
          where: {
            id: { not: req.params.id },
            slug: { startsWith: baseSlug },
          },
          select: { slug: true },
        })
      ).map((announcement) => announcement.slug).filter(Boolean) as string[];
      const newSlug = generateUniqueSlug(baseSlug, existingSlugs);
      slugUpdate = { slug: newSlug };
    }

    const announcement = await prisma.announcement.update({
      where: { id: req.params.id },
      data: {
        ...(data.title && { title: data.title }),
        ...slugUpdate,
        ...(data.body !== undefined && { body: sanitizeHtml(data.body) }),
        ...(data.shortDescription !== undefined && { shortDescription: normalizeOptionalText(data.shortDescription) }),
        ...(data.priority && { priority: data.priority }),
        ...(data.imageUrl !== undefined && { imageUrl: normalizeOptionalText(data.imageUrl) }),
        ...(data.imageGallery !== undefined && { imageGallery: toNullableJsonValue(data.imageGallery) }),
        ...(data.attachments !== undefined && { attachments: toNullableJsonValue(data.attachments) }),
        ...(data.links !== undefined && { links: toNullableJsonValue(data.links) }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.featured !== undefined && { featured: data.featured }),
        ...(data.pinned !== undefined && { pinned: data.pinned }),
        ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt || null }),
      },
      include: { creator: { select: { id: true, name: true, avatar: true } } },
    });

    await auditLog(authUser.id, 'UPDATE', 'announcement', announcement.id);

    // Notify search engines about the updated announcement page
    if (announcement.slug) submitUrl(`/announcements/${announcement.slug}`);

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
