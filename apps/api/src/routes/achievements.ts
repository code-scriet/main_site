import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import { generateSlug, generateUniqueSlug } from '../utils/slug.js';
import { parsePaginationNumber } from '../utils/pagination.js';
import { logger } from '../utils/logger.js';
import { submitUrl } from '../utils/indexnow.js';
import { sanitizeHtml } from '../utils/sanitize.js';

export const achievementsRouter = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const optionalUrl = z.union([z.string().url('Must be a valid URL'), z.literal(''), z.null()]).optional();

const createAchievementSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(10).max(2000),
  content: z.string().max(50000).optional().nullable(),
  shortDescription: z.string().trim().max(320).optional().nullable(),
  eventName: z.string().trim().max(140).optional().nullable(),
  achievedBy: z.string().trim().min(1).max(200),
  imageUrl: optionalUrl,
  imageGallery: z.array(z.string().url('Image URL must be valid')).max(30).optional().nullable(),
  date: z.coerce.date().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  featured: z.boolean().optional(),
});

const updateAchievementSchema = createAchievementSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
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

// Get all achievements
achievementsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { featured, year, includeContent } = req.query;
    const limit = parsePaginationNumber(req.query.limit, 50, { min: 1, max: 100 });
    const offset = parsePaginationNumber(req.query.offset, 0, { min: 0, max: 1000000 });

    if (limit === null) {
      return res.status(400).json({ success: false, error: { message: 'limit must be an integer between 1 and 100' } });
    }

    if (offset === null) {
      return res.status(400).json({ success: false, error: { message: 'offset must be a non-negative integer' } });
    }

    const where: any = {};
    
    if (featured === 'true') {
      where.featured = true;
    }
    
    if (year && year !== 'All') {
      const yearNum = parseInt(year as string);
      if (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > 3000) {
        return res.status(400).json({ success: false, error: { message: 'year must be a valid 4-digit value' } });
      }
      where.date = {
        gte: new Date(`${yearNum}-01-01`),
        lt: new Date(`${yearNum + 1}-01-01`),
      };
    }

    const shouldIncludeContent = includeContent === 'true';

    const listSelect = {
      id: true,
      title: true,
      slug: true,
      description: true,
      shortDescription: true,
      eventName: true,
      achievedBy: true,
      imageUrl: true,
      imageGallery: true,
      date: true,
      tags: true,
      featured: true,
      createdAt: true,
      updatedAt: true,
      ...(shouldIncludeContent ? { content: true } : {}),
    } satisfies Prisma.AchievementSelect;

    const achievements = await prisma.achievement.findMany({
      where,
      orderBy: { date: 'desc' },
      take: limit,
      skip: offset,
      select: listSelect,
    });
    const shouldCount = !(offset === 0 && achievements.length < limit);
    const total = shouldCount ? await prisma.achievement.count({ where }) : achievements.length;

    res.json({
      success: true,
      data: achievements,
      pagination: { total, limit, offset },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch achievements' } });
  }
});

// Get latest achievements (for homepage)
achievementsRouter.get('/latest', async (req: Request, res: Response) => {
  try {
    const limit = parsePaginationNumber(req.query.limit, 6, { min: 1, max: 50 });

    if (limit === null) {
      return res.status(400).json({ success: false, error: { message: 'limit must be an integer between 1 and 50' } });
    }

    const achievements = await prisma.achievement.findMany({
      orderBy: { date: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        shortDescription: true,
        eventName: true,
        achievedBy: true,
        imageUrl: true,
        imageGallery: true,
        date: true,
        tags: true,
        featured: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ success: true, data: achievements });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch achievements' } });
  }
});

// Get featured achievements (for homepage showcase)
achievementsRouter.get('/featured', async (req: Request, res: Response) => {
  try {
    const limit = parsePaginationNumber(req.query.limit, 4, { min: 1, max: 50 });

    if (limit === null) {
      return res.status(400).json({ success: false, error: { message: 'limit must be an integer between 1 and 50' } });
    }

    const achievements = await prisma.achievement.findMany({
      where: { featured: true },
      orderBy: { date: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        shortDescription: true,
        eventName: true,
        achievedBy: true,
        imageUrl: true,
        imageGallery: true,
        date: true,
        tags: true,
        featured: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ success: true, data: achievements });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch featured achievements' } });
  }
});

// Get achievement by ID or slug
achievementsRouter.get('/:idOrSlug', async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;

    const achievement = UUID_REGEX.test(idOrSlug)
      ? (await prisma.achievement.findUnique({ where: { id: idOrSlug } })) ??
        (await prisma.achievement.findUnique({ where: { slug: idOrSlug } }))
      : (await prisma.achievement.findUnique({ where: { slug: idOrSlug } })) ??
        (await prisma.achievement.findUnique({ where: { id: idOrSlug } }));

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
    const parsed = createAchievementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { message: parsed.error.errors[0]?.message || 'Invalid achievement payload' },
      });
    }
    const { title, description, content, shortDescription, eventName, achievedBy, imageUrl, imageGallery, date, tags, featured } = parsed.data;

    // Generate unique slug
    const baseSlug = generateSlug(title) || 'achievement';
    const existingSlugs = (
      await prisma.achievement.findMany({
        where: { slug: { startsWith: baseSlug } },
        select: { slug: true },
      })
    ).map((achievement) => achievement.slug);
    const slug = generateUniqueSlug(baseSlug, existingSlugs);

    const achievement = await prisma.achievement.create({
      data: {
        title,
        slug,
        description: sanitizeHtml(description),
        content: normalizeOptionalText(content) ? sanitizeHtml(normalizeOptionalText(content)!) : null,
        shortDescription: normalizeOptionalText(shortDescription),
        eventName: normalizeOptionalText(eventName),
        achievedBy,
        imageUrl: normalizeOptionalText(imageUrl),
        imageGallery: toNullableJsonValue(imageGallery),
        date: date || new Date(),
        tags: tags || [],
        featured: featured || false,
      },
    });

    await auditLog(authUser.id, 'CREATE', 'achievement', achievement.id, { title });

    // Notify search engines about the new achievement page
    submitUrl(`/achievements/${achievement.slug}`);

    res.status(201).json({ success: true, data: achievement, message: 'Achievement created successfully' });
  } catch (error) {
    logger.error('Create achievement error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, error: { message: 'Failed to create achievement' } });
  }
});

// Update achievement
achievementsRouter.put('/:id', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const parsed = updateAchievementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { message: parsed.error.errors[0]?.message || 'Invalid achievement payload' },
      });
    }
    const { title, description, content, shortDescription, eventName, achievedBy, imageUrl, imageGallery, date, tags, featured } = parsed.data;

    // If title changed, regenerate slug
    const updateData: any = {
      ...(description !== undefined && { description: sanitizeHtml(description) }),
      ...(content !== undefined && { content: normalizeOptionalText(content) ? sanitizeHtml(normalizeOptionalText(content)!) : null }),
      ...(shortDescription !== undefined && { shortDescription: normalizeOptionalText(shortDescription) }),
      ...(eventName !== undefined && { eventName: normalizeOptionalText(eventName) }),
      ...(achievedBy !== undefined && { achievedBy }),
      ...(imageUrl !== undefined && { imageUrl: normalizeOptionalText(imageUrl) }),
      ...(imageGallery !== undefined && { imageGallery: toNullableJsonValue(imageGallery) }),
      ...(date !== undefined && { date }),
      ...(tags !== undefined && { tags }),
      ...(featured !== undefined && { featured }),
    };

    if (title) {
      updateData.title = title;
      // Regenerate slug if title changed
      const baseSlug = generateSlug(title) || 'achievement';
      const existingSlugs = (
        await prisma.achievement.findMany({
          where: {
            id: { not: req.params.id },
            slug: { startsWith: baseSlug },
          },
          select: { slug: true },
        })
      ).map((achievement) => achievement.slug);
      const slug = generateUniqueSlug(baseSlug, existingSlugs);
      updateData.slug = slug;
    }

    const achievement = await prisma.achievement.update({
      where: { id: req.params.id },
      data: updateData,
    });

    await auditLog(authUser.id, 'UPDATE', 'achievement', achievement.id);

    // Notify search engines about the updated achievement page
    if (achievement.slug) submitUrl(`/achievements/${achievement.slug}`);

    res.json({ success: true, data: achievement, message: 'Achievement updated successfully' });
  } catch (error) {
    logger.error('Update achievement error', {
      error: error instanceof Error ? error.message : String(error),
    });
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
