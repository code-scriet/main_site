import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';

export const teamRouter = Router();

const optionalSocialUrl = z
  .union([z.string(), z.literal('')])
  .optional();

const createTeamMemberSchema = z.object({
  name: z.string().trim().min(1).max(100),
  role: z.string().trim().min(1).max(100),
  team: z.string().trim().min(1).max(100),
  imageUrl: z.string().url('Image URL must be a valid URL'),
  github: optionalSocialUrl,
  linkedin: optionalSocialUrl,
  twitter: optionalSocialUrl,
  instagram: optionalSocialUrl,
  order: z.coerce.number().int().min(0).max(10000).optional(),
});

const updateTeamMemberSchema = createTeamMemberSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

const reorderSchema = z.object({
  members: z.array(
    z.object({
      id: z.string().min(1),
      order: z.coerce.number().int().min(0).max(10000),
    })
  ).max(500),
});

const normalizeOptionalText = (value?: string): string | null => {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

// Get all team members
teamRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { team } = req.query;

    const where = team ? { team: team as string } : {};

    const teamMembers = await prisma.teamMember.findMany({
      where,
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });

    res.json({ success: true, data: teamMembers });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch team members' } });
  }
});

// Get team groups/types
teamRouter.get('/meta/teams', async (_req: Request, res: Response) => {
  try {
    const teams = await prisma.teamMember.groupBy({
      by: ['team'],
      _count: { id: true },
    });

    res.json({
      success: true,
      data: teams.map((t) => ({ team: t.team, count: t._count.id })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch teams' } });
  }
});

// Get team member by ID
teamRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const teamMember = await prisma.teamMember.findUnique({
      where: { id: req.params.id },
    });

    if (!teamMember) {
      return res.status(404).json({ success: false, error: { message: 'Team member not found' } });
    }

    res.json({ success: true, data: teamMember });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch team member' } });
  }
});

// Create team member
teamRouter.post('/', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const parsed = createTeamMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { message: parsed.error.errors[0]?.message || 'Invalid input' },
      });
    }

    const { name, role, team, imageUrl, github, linkedin, twitter, instagram, order } = parsed.data;

    const teamMember = await prisma.teamMember.create({
      data: {
        name: name.trim(),
        role: role.trim(),
        team: team.trim(),
        imageUrl,
        github: normalizeOptionalText(github),
        linkedin: normalizeOptionalText(linkedin),
        twitter: normalizeOptionalText(twitter),
        instagram: normalizeOptionalText(instagram),
        order: order || 0,
      },
    });

    await auditLog(authUser.id, 'CREATE', 'team_member', teamMember.id, { name, role, team });
    res.status(201).json({ success: true, data: teamMember, message: 'Team member added successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to create team member' } });
  }
});

// Update team member
teamRouter.put('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const parsed = updateTeamMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { message: parsed.error.errors[0]?.message || 'Invalid input' },
      });
    }

    const { name, role, team, imageUrl, github, linkedin, twitter, instagram, order } = parsed.data;

    const teamMember = await prisma.teamMember.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(role !== undefined && { role: role.trim() }),
        ...(team !== undefined && { team: team.trim() }),
        ...(imageUrl && { imageUrl }),
        ...(github !== undefined && { github: normalizeOptionalText(github) }),
        ...(linkedin !== undefined && { linkedin: normalizeOptionalText(linkedin) }),
        ...(twitter !== undefined && { twitter: normalizeOptionalText(twitter) }),
        ...(instagram !== undefined && { instagram: normalizeOptionalText(instagram) }),
        ...(order !== undefined && { order }),
      },
    });

    await auditLog(authUser.id, 'UPDATE', 'team_member', teamMember.id);
    res.json({ success: true, data: teamMember, message: 'Team member updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update team member' } });
  }
});

// Reorder team members
teamRouter.patch('/reorder', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { message: 'Members array is required' } });
    }
    const { members } = parsed.data;

    await prisma.$transaction(
      members.map(({ id, order }) =>
        prisma.teamMember.update({ where: { id }, data: { order } })
      )
    );

    await auditLog(authUser.id, 'UPDATE', 'team_member', 'batch', { action: 'reorder' });
    res.json({ success: true, message: 'Team members reordered successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to reorder team members' } });
  }
});

// Delete team member
teamRouter.delete('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    await prisma.teamMember.delete({ where: { id: req.params.id } });
    await auditLog(authUser.id, 'DELETE', 'team_member', req.params.id);
    res.json({ success: true, message: 'Team member removed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to delete team member' } });
  }
});
