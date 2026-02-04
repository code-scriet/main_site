import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import { generateSlug } from '../utils/slug.js';

export const achievementsRouter = Router();

// Get all achievements
achievementsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { limit = '50', offset = '0', featured, year } = req.query;

    const where: any = {};
    
    if (featured === 'true') {
      where.featured = true;
    }
    
    if (year && year !== 'All') {
      const yearNum = parseInt(year as string);
      where.date = {
        gte: new Date(`${yearNum}-01-01`),
        lt: new Date(`${yearNum + 1}-01-01`),
      };
    }

    const [achievements, total] = await Promise.all([
      prisma.achievement.findMany({
        where,
        orderBy: { date: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
      }),
      prisma.achievement.count({ where }),
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

// Get latest achievements (for homepage)
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

// Get featured achievements (for homepage showcase)
achievementsRouter.get('/featured', async (req: Request, res: Response) => {
  try {
    const { limit = '4' } = req.query;

    const achievements = await prisma.achievement.findMany({
      where: { featured: true },
      orderBy: { date: 'desc' },
      take: parseInt(limit as string),
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
    
    // Try to find by slug first, then by ID
    let achievement = await prisma.achievement.findUnique({
      where: { slug: idOrSlug },
    });
    
    if (!achievement) {
      achievement = await prisma.achievement.findUnique({
        where: { id: idOrSlug },
      });
    }

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
    const { title, description, content, shortDescription, eventName, achievedBy, imageUrl, imageGallery, date, tags, featured } = req.body;

    if (!title || !description || !achievedBy) {
      return res.status(400).json({
        success: false,
        error: { message: 'Title, description, and achievedBy are required' },
      });
    }

    // Generate unique slug
    const baseSlug = generateSlug(title);
    const existingSlugs = (await prisma.achievement.findMany({
      select: { slug: true },
    })).map(a => a.slug);
    
    let slug = baseSlug;
    let counter = 1;
    while (existingSlugs.includes(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const achievement = await prisma.achievement.create({
      data: {
        title,
        slug,
        description,
        content: content || null,
        shortDescription: shortDescription || null,
        eventName: eventName || null,
        achievedBy,
        imageUrl: imageUrl || null,
        imageGallery: imageGallery || null,
        date: date ? new Date(date) : new Date(),
        tags: tags || [],
        featured: featured || false,
      },
    });

    await auditLog(authUser.id, 'CREATE', 'achievement', achievement.id, { title });
    res.status(201).json({ success: true, data: achievement, message: 'Achievement created successfully' });
  } catch (error) {
    console.error('Create achievement error:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to create achievement' } });
  }
});

// Update achievement
achievementsRouter.put('/:id', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { title, description, content, shortDescription, eventName, achievedBy, imageUrl, imageGallery, date, tags, featured } = req.body;

    // If title changed, regenerate slug
    let updateData: any = {
      ...(description && { description }),
      ...(content !== undefined && { content }),
      ...(shortDescription !== undefined && { shortDescription }),
      ...(eventName !== undefined && { eventName }),
      ...(achievedBy && { achievedBy }),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(imageGallery !== undefined && { imageGallery }),
      ...(date && { date: new Date(date) }),
      ...(tags !== undefined && { tags }),
      ...(featured !== undefined && { featured }),
    };

    if (title) {
      updateData.title = title;
      // Regenerate slug if title changed
      const baseSlug = generateSlug(title);
      const existingSlugs = (await prisma.achievement.findMany({
        where: { id: { not: req.params.id } },
        select: { slug: true },
      })).map(a => a.slug);
      
      let slug = baseSlug;
      let counter = 1;
      while (existingSlugs.includes(slug)) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
      updateData.slug = slug;
    }

    const achievement = await prisma.achievement.update({
      where: { id: req.params.id },
      data: updateData,
    });

    await auditLog(authUser.id, 'UPDATE', 'achievement', achievement.id);
    res.json({ success: true, data: achievement, message: 'Achievement updated successfully' });
  } catch (error) {
    console.error('Update achievement error:', error);
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
