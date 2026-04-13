import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import { sanitizeHtml } from '../utils/sanitize.js';
import { logger } from '../utils/logger.js';

export const creditsRouter = Router();
const uuidSchema = z.string().uuid();

const teamMemberSelect = {
  id: true,
  name: true,
  slug: true,
  imageUrl: true,
  role: true,
  team: true,
};

const createCreditSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  category: z.string().trim().min(1).max(100),
  teamMemberId: z.string().uuid().optional().nullable(),
  order: z.coerce.number().int().min(0).max(10000).optional(),
});

const updateCreditSchema = createCreditSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

const reorderSchema = z.object({
  credits: z.array(
    z.object({
      id: z.string().uuid(),
      order: z.coerce.number().int().min(0).max(10000),
    })
  ).max(500),
});

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidSchema.safeParse(value).success;
}

// GET /api/credits — list all credits (public)
creditsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const teamMemberId = req.query.teamMemberId;

    const where: Record<string, unknown> = {};
    if (teamMemberId !== undefined) {
      if (!isValidUuid(teamMemberId)) {
        return res.status(400).json({ success: false, error: { message: 'Invalid team member ID format' } });
      }
      where.teamMemberId = teamMemberId;
    }

    const credits = await prisma.credit.findMany({
      where,
      include: { teamMember: { select: teamMemberSelect } },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });

    res.json({ success: true, data: credits });
  } catch (error) {
    logger.error('Failed to fetch credits', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to fetch credits' } });
  }
});

// GET /api/credits/:id — get single credit (public)
creditsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid credit ID format' } });
    }

    const credit = await prisma.credit.findUnique({
      where: { id: req.params.id },
      include: { teamMember: { select: teamMemberSelect } },
    });

    if (!credit) {
      return res.status(404).json({ success: false, error: { message: 'Credit not found' } });
    }

    res.json({ success: true, data: credit });
  } catch (error) {
    logger.error('Failed to fetch credit', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to fetch credit' } });
  }
});

// POST /api/credits — create credit (admin only)
creditsRouter.post('/', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const parsed = createCreditSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { message: parsed.error.errors[0]?.message || 'Validation failed' } });
    }

    const { title, description, category, teamMemberId, order } = parsed.data;

    // Validate teamMemberId exists if provided
    if (teamMemberId) {
      const member = await prisma.teamMember.findUnique({ where: { id: teamMemberId } });
      if (!member) {
        return res.status(400).json({ success: false, error: { message: 'Team member not found' } });
      }
    }

    const credit = await prisma.credit.create({
      data: {
        title: title.trim(),
        description: description ? sanitizeHtml(description) : null,
        category: category.trim(),
        teamMemberId: teamMemberId || null,
        order: order ?? 0,
      },
      include: { teamMember: { select: teamMemberSelect } },
    });

    const authUser = getAuthUser(req);
    if (authUser) {
      await auditLog(authUser.id, 'CREATE', 'credit', credit.id, { title, category });
    }

    res.status(201).json({ success: true, data: credit, message: 'Credit created successfully' });
  } catch (error) {
    logger.error('Failed to create credit', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to create credit' } });
  }
});

// PUT /api/credits/:id — update credit (admin only)
creditsRouter.put('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid credit ID format' } });
    }

    const parsed = updateCreditSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { message: parsed.error.errors[0]?.message || 'Validation failed' } });
    }

    const existing = await prisma.credit.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: { message: 'Credit not found' } });
    }

    const { title, description, category, teamMemberId, order } = parsed.data;

    // Validate teamMemberId exists if provided
    if (teamMemberId) {
      const member = await prisma.teamMember.findUnique({ where: { id: teamMemberId } });
      if (!member) {
        return res.status(400).json({ success: false, error: { message: 'Team member not found' } });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description ? sanitizeHtml(description) : null;
    if (category !== undefined) updateData.category = category.trim();
    if (teamMemberId !== undefined) updateData.teamMemberId = teamMemberId || null;
    if (order !== undefined) updateData.order = order;

    const credit = await prisma.credit.update({
      where: { id: req.params.id },
      data: updateData,
      include: { teamMember: { select: teamMemberSelect } },
    });

    const authUser = getAuthUser(req);
    if (authUser) {
      await auditLog(authUser.id, 'UPDATE', 'credit', credit.id, { title: credit.title });
    }

    res.json({ success: true, data: credit, message: 'Credit updated successfully' });
  } catch (error) {
    logger.error('Failed to update credit', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to update credit' } });
  }
});

// DELETE /api/credits/:id — delete credit (admin only)
creditsRouter.delete('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    if (!isValidUuid(req.params.id)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid credit ID format' } });
    }

    const existing = await prisma.credit.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: { message: 'Credit not found' } });
    }

    await prisma.credit.delete({ where: { id: req.params.id } });

    const authUser = getAuthUser(req);
    if (authUser) {
      await auditLog(authUser.id, 'DELETE', 'credit', req.params.id, { title: existing.title });
    }

    res.json({ success: true, message: 'Credit deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete credit', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to delete credit' } });
  }
});

// PATCH /api/credits/reorder — reorder credits (admin only)
creditsRouter.patch('/reorder', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { message: parsed.error.errors[0]?.message || 'Validation failed' } });
    }

    const creditIds = Array.from(new Set(parsed.data.credits.map(({ id }) => id)));
    const existingCredits = await prisma.credit.findMany({
      where: { id: { in: creditIds } },
      select: { id: true },
    });
    const existingCreditIds = new Set(existingCredits.map(({ id }) => id));
    const invalidIds = creditIds.filter((id) => !existingCreditIds.has(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        error: { message: `Unknown credit IDs: ${invalidIds.join(', ')}` },
      });
    }

    await prisma.$transaction(
      parsed.data.credits.map(({ id, order }) =>
        prisma.credit.update({ where: { id }, data: { order } })
      )
    );

    const authUser = getAuthUser(req);
    if (authUser) {
      await auditLog(authUser.id, 'UPDATE', 'credit', 'reorder', { count: parsed.data.credits.length });
    }

    res.json({ success: true, message: 'Credits reordered successfully' });
  } catch (error) {
    logger.error('Failed to reorder credits', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to reorder credits' } });
  }
});
