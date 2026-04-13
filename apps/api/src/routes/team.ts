import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import { sanitizeHtml, sanitizeUrl } from '../utils/sanitize.js';
import { logger } from '../utils/logger.js';
import { submitUrl } from '../utils/indexnow.js';
import { syncUserToTeamMember } from '../utils/profileSync.js';
import { generateSlug, generateUniqueSlug } from '../utils/slug.js';

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
  // New fields
  userId: z.string().uuid().optional().nullable(),
  slug: z.string().trim().max(100).optional().nullable(),
  bio: z.string().max(10000).optional().nullable(),
  vision: z.string().max(5000).optional().nullable(),
  story: z.string().max(10000).optional().nullable(),
  expertise: z.string().max(5000).optional().nullable(),
  achievements: z.string().max(5000).optional().nullable(),
  website: optionalSocialUrl,
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

// Preserve explicit blank overrides for self-managed team profiles so linked
// user data does not repopulate a field that the member intentionally cleared.
const normalizeExplicitOverride = (value?: string): string => {
  return value?.trim() ?? '';
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const teamMemberUserSelect = {
  id: true,
  name: true,
  email: true,
  avatar: true,
  bio: true,
  githubUrl: true,
  linkedinUrl: true,
  twitterUrl: true,
  websiteUrl: true,
} as const;

const toCleanSlugBase = (raw: string): string => generateSlug(raw) || 'team-member';

const resolveUniqueTeamSlug = async (raw: string, excludeId?: string): Promise<string> => {
  const baseSlug = toCleanSlugBase(raw);
  const existingSlugs = (
    await prisma.teamMember.findMany({
      where: {
        ...(excludeId ? { id: { not: excludeId } } : {}),
        slug: { startsWith: baseSlug },
      },
      select: { slug: true },
    })
  )
    .map((member) => member.slug)
    .filter((slug): slug is string => Boolean(slug));

  return generateUniqueSlug(baseSlug, existingSlugs);
};

const appendLegacySlug = (legacySlugs: string[] | null | undefined, previousSlug: string | null | undefined, nextSlug: string): string[] => {
  const next = new Set((legacySlugs ?? []).filter(Boolean));
  const normalizedPrevious = previousSlug?.trim();
  if (normalizedPrevious && normalizedPrevious !== nextSlug) {
    next.add(normalizedPrevious);
  }
  next.delete(nextSlug);
  return Array.from(next);
};

// Rich content fields that support HTML
const RICH_CONTENT_FIELDS = ['bio', 'vision', 'story', 'expertise', 'achievements'];

// Sanitize rich content fields
const sanitizeRichContent = (data: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...data };
  for (const field of RICH_CONTENT_FIELDS) {
    if (typeof result[field] === 'string') {
      result[field] = sanitizeHtml(result[field] as string);
    }
  }
  if (typeof result.website === 'string') {
    result.website = sanitizeUrl(result.website as string) || null;
  }
  return result;
};

// Merge team member data with linked user data (team member fields take priority)
// Uses explicit null checks so that intentionally cleared fields stay empty
// and don't fall through to the linked user's data.
const mergeWithUserData = (teamMember: any, includeSyncMetadata = true): any => {
  if (!teamMember.user) return teamMember;

  const user = teamMember.user;
  const merged: Record<string, unknown> = {
    ...teamMember,
    // Merged fields - team member data takes priority
    // Only fall back to user data when the team member field is null (never explicitly set),
    // not when it's an empty string (intentionally cleared).
    imageUrl: teamMember.imageUrl !== null ? teamMember.imageUrl : user.avatar,
    bio: teamMember.bio !== null ? teamMember.bio : user.bio,
    github: teamMember.github !== null ? teamMember.github : user.githubUrl,
    linkedin: teamMember.linkedin !== null ? teamMember.linkedin : user.linkedinUrl,
    twitter: teamMember.twitter !== null ? teamMember.twitter : user.twitterUrl,
    website: teamMember.website !== null ? teamMember.website : user.websiteUrl,
  };

  if (includeSyncMetadata) {
    merged._syncedFrom = {
      imageUrl: teamMember.imageUrl === null && user.avatar ? 'user' : 'team',
      bio: teamMember.bio === null && user.bio ? 'user' : 'team',
      github: teamMember.github === null && user.githubUrl ? 'user' : 'team',
      linkedin: teamMember.linkedin === null && user.linkedinUrl ? 'user' : 'team',
      twitter: teamMember.twitter === null && user.twitterUrl ? 'user' : 'team',
      website: teamMember.website === null && user.websiteUrl ? 'user' : 'team',
    };
  }

  return merged;
};

// Get all team members
teamRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { team, compact } = req.query;

    const where = team ? { team: team as string } : {};
    const isCompact = compact === 'true';

    const teamMembers = isCompact
      ? await prisma.teamMember.findMany({
          where,
          select: {
            id: true,
            name: true,
            role: true,
            team: true,
            imageUrl: true,
            github: true,
            linkedin: true,
            twitter: true,
            instagram: true,
            order: true,
            slug: true,
            userId: true,
            user: {
              select: {
                avatar: true,
                githubUrl: true,
                linkedinUrl: true,
                twitterUrl: true,
                websiteUrl: true,
              },
            },
          },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        })
      : await prisma.teamMember.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                bio: true,
                githubUrl: true,
                linkedinUrl: true,
                twitterUrl: true,
                websiteUrl: true,
              },
            },
          },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        });

    res.json({ success: true, data: teamMembers.map((member) => mergeWithUserData(member, !isCompact)) });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch team members' } });
  }
});

// Get team member profile for the currently logged-in user
teamRouter.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const teamMember = await prisma.teamMember.findFirst({
      where: { userId: authUser.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            bio: true,
            githubUrl: true,
            linkedinUrl: true,
            twitterUrl: true,
            websiteUrl: true,
          },
        },
      },
    });

    if (!teamMember) {
      return res.json({ success: true, data: null });
    }

    res.json({ success: true, data: mergeWithUserData(teamMember) });
  } catch (error) {
    logger.error('Failed to fetch my team profile', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to fetch team profile' } });
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
    const idOrSlug = req.params.id;
    const teamMember = UUID_REGEX.test(idOrSlug)
      ? (await prisma.teamMember.findUnique({
          where: { id: idOrSlug },
          include: { user: { select: teamMemberUserSelect } },
        })) ??
        (await prisma.teamMember.findUnique({
          where: { slug: idOrSlug },
          include: { user: { select: teamMemberUserSelect } },
        })) ??
        (await prisma.teamMember.findFirst({
          where: { legacySlugs: { has: idOrSlug } },
          include: { user: { select: teamMemberUserSelect } },
        }))
      : (await prisma.teamMember.findUnique({
          where: { slug: idOrSlug },
          include: { user: { select: teamMemberUserSelect } },
        })) ??
        (await prisma.teamMember.findFirst({
          where: { legacySlugs: { has: idOrSlug } },
          include: { user: { select: teamMemberUserSelect } },
        })) ??
        (await prisma.teamMember.findUnique({
          where: { id: idOrSlug },
          include: { user: { select: teamMemberUserSelect } },
        }));

    if (!teamMember) {
      return res.status(404).json({ success: false, error: { message: 'Team member not found' } });
    }

    res.json({ success: true, data: mergeWithUserData(teamMember) });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch team member' } });
  }
});

// Get team member by slug (public profile page)
teamRouter.get('/slug/:slug', async (req: Request, res: Response) => {
  try {
    const slugOrId = req.params.slug;
    const teamMember = UUID_REGEX.test(slugOrId)
      ? (await prisma.teamMember.findUnique({
          where: { id: slugOrId },
          include: { user: { select: teamMemberUserSelect } },
        })) ??
        (await prisma.teamMember.findUnique({
          where: { slug: slugOrId },
          include: { user: { select: teamMemberUserSelect } },
        })) ??
        (await prisma.teamMember.findFirst({
          where: { legacySlugs: { has: slugOrId } },
          include: { user: { select: teamMemberUserSelect } },
        }))
      : (await prisma.teamMember.findUnique({
          where: { slug: slugOrId },
          include: { user: { select: teamMemberUserSelect } },
        })) ??
        (await prisma.teamMember.findFirst({
          where: { legacySlugs: { has: slugOrId } },
          include: { user: { select: teamMemberUserSelect } },
        })) ??
        (await prisma.teamMember.findUnique({
          where: { id: slugOrId },
          include: { user: { select: teamMemberUserSelect } },
        }));

    if (!teamMember) {
      return res.status(404).json({ success: false, error: { message: 'Team member not found' } });
    }

    res.json({ success: true, data: mergeWithUserData(teamMember) });
  } catch (error) {
    logger.error('Failed to fetch team member by slug', { error, slug: req.params.slug });
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

    const { name, role, team, imageUrl, github, linkedin, twitter, instagram, order, userId, bio, vision, story, expertise, achievements, website } = parsed.data;

    const slugSource = parsed.data.slug?.trim() ? parsed.data.slug : name;
    const slug = await resolveUniqueTeamSlug(slugSource);

    // Sanitize rich content fields
    const sanitizedData = sanitizeRichContent({ bio, vision, story, expertise, achievements, website });

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
        slug,
        legacySlugs: [],
        userId: userId || null,
        bio: sanitizedData.bio as string | null,
        vision: sanitizedData.vision as string | null,
        story: sanitizedData.story as string | null,
        expertise: sanitizedData.expertise as string | null,
        achievements: sanitizedData.achievements as string | null,
        website: sanitizedData.website as string | null,
      },
    });

    await auditLog(authUser.id, 'CREATE', 'team_member', teamMember.id, { name, role, team });

    // Notify search engines about the new team member page
    if (teamMember.slug) submitUrl(`/team/${teamMember.slug}`);

    res.status(201).json({ success: true, data: teamMember, message: 'Team member added successfully' });
  } catch (error) {
    logger.error('Failed to create team member', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to create team member' } });
  }
});

// Update team member (admin only)
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

    const { name, role, team, imageUrl, github, linkedin, twitter, instagram, order, userId, slug, bio, vision, story, expertise, achievements, website } = parsed.data;

    // Sanitize rich content fields
    const sanitizedData = sanitizeRichContent({ bio, vision, story, expertise, achievements, website });

    const existing = await prisma.teamMember.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, slug: true, legacySlugs: true },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: { message: 'Team member not found' } });
    }

    let slugUpdate: { slug: string; legacySlugs: string[] } | undefined;
    const explicitSlug = typeof slug === 'string' ? slug.trim() : '';
    const normalizedName = name?.trim();
    const shouldRegenerateFromName =
      normalizedName !== undefined &&
      normalizedName.length > 0 &&
      normalizedName !== existing.name;
    const slugSource =
      explicitSlug.length > 0
        ? explicitSlug
        : shouldRegenerateFromName
          ? normalizedName
          : undefined;

    if (slugSource) {
      const canonicalSlug = await resolveUniqueTeamSlug(slugSource, req.params.id);
      slugUpdate = {
        slug: canonicalSlug,
        legacySlugs: appendLegacySlug(existing.legacySlugs, existing.slug, canonicalSlug),
      };
    }

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
        ...(userId !== undefined && { userId: userId || null }),
        ...(slugUpdate && slugUpdate),
        ...(bio !== undefined && { bio: sanitizedData.bio as string | null }),
        ...(vision !== undefined && { vision: sanitizedData.vision as string | null }),
        ...(story !== undefined && { story: sanitizedData.story as string | null }),
        ...(expertise !== undefined && { expertise: sanitizedData.expertise as string | null }),
        ...(achievements !== undefined && { achievements: sanitizedData.achievements as string | null }),
        ...(website !== undefined && { website: sanitizedData.website as string | null }),
      },
    });

    await auditLog(authUser.id, 'UPDATE', 'team_member', teamMember.id);

    // Notify search engines about the updated team member page
    if (teamMember.slug) submitUrl(`/team/${teamMember.slug}`);

    res.json({ success: true, data: teamMember, message: 'Team member updated successfully' });
  } catch (error) {
    logger.error('Failed to update team member', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to update team member' } });
  }
});

// Profile content update schema (for self-edit by linked user)
const profileUpdateSchema = z.object({
  bio: z.string().max(10000).optional().nullable(),
  vision: z.string().max(5000).optional().nullable(),
  story: z.string().max(10000).optional().nullable(),
  expertise: z.string().max(5000).optional().nullable(),
  achievements: z.string().max(5000).optional().nullable(),
  website: optionalSocialUrl,
  github: optionalSocialUrl,
  linkedin: optionalSocialUrl,
  twitter: optionalSocialUrl,
  instagram: optionalSocialUrl,
});

// Update team member profile (for linked user or admin)
teamRouter.put('/:id/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { id } = req.params;

    // Check if user is authorized (admin or linked user)
    const existing = await prisma.teamMember.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: { message: 'Team member not found' } });
    }

    const isAdmin = ['ADMIN', 'PRESIDENT'].includes(authUser.role);
    const isOwner = existing.userId === authUser.id;

    if (!isAdmin && !isOwner) {
      return res.status(404).json({ success: false, error: { message: 'Team member not found' } });
    }

    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { message: parsed.error.errors[0]?.message || 'Invalid input' },
      });
    }

    const { bio, vision, story, expertise, achievements, website, github, linkedin, twitter, instagram } = parsed.data;

    // Sanitize rich content fields
    const sanitizedData = sanitizeRichContent({ bio, vision, story, expertise, achievements, website });
    const normalizedWebsite =
      website === undefined
        ? undefined
        : website.trim() === ''
          ? ''
          : (sanitizedData.website as string | null);

    const teamMember = await prisma.teamMember.update({
      where: { id },
      data: {
        ...(bio !== undefined && { bio: sanitizedData.bio as string | null }),
        ...(vision !== undefined && { vision: sanitizedData.vision as string | null }),
        ...(story !== undefined && { story: sanitizedData.story as string | null }),
        ...(expertise !== undefined && { expertise: sanitizedData.expertise as string | null }),
        ...(achievements !== undefined && { achievements: sanitizedData.achievements as string | null }),
        ...(normalizedWebsite !== undefined && { website: normalizedWebsite }),
        ...(github !== undefined && { github: normalizeExplicitOverride(github) }),
        ...(linkedin !== undefined && { linkedin: normalizeExplicitOverride(linkedin) }),
        ...(twitter !== undefined && { twitter: normalizeExplicitOverride(twitter) }),
        ...(instagram !== undefined && { instagram: normalizeExplicitOverride(instagram) }),
      },
    });

    await auditLog(authUser.id, 'UPDATE', 'team_member_profile', teamMember.id);

    // Notify search engines about the updated team member page
    if (teamMember.slug) submitUrl(`/team/${teamMember.slug}`);

    res.json({ success: true, data: teamMember, message: 'Profile updated successfully' });
  } catch (error) {
    logger.error('Failed to update team member profile', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to update profile' } });
  }
});

// Link team member to user account
teamRouter.patch('/:id/link-user', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { id } = req.params;
    const { userId } = req.body;

    if (userId !== null && typeof userId !== 'string') {
      return res.status(400).json({ success: false, error: { message: 'Invalid userId' } });
    }

    // If linking to a user, verify user exists
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ success: false, error: { message: 'User not found' } });
      }

      // Check if user is already linked to another team member
      const existingLink = await prisma.teamMember.findFirst({
        where: { userId, id: { not: id } },
      });
      if (existingLink) {
        return res.status(400).json({ success: false, error: { message: 'User is already linked to another team member' } });
      }
    }

    // If linking a user, auto-generate slug if team member doesn't have one
    const updateData: Record<string, unknown> = { userId: userId || null };
    if (userId) {
      const existing = await prisma.teamMember.findUnique({ where: { id }, select: { slug: true, name: true, legacySlugs: true } });
      if (existing && !existing.slug) {
        const canonicalSlug = await resolveUniqueTeamSlug(existing.name, id);
        updateData.slug = canonicalSlug;
        updateData.legacySlugs = appendLegacySlug(existing.legacySlugs, existing.slug, canonicalSlug);
      }
    }

    const teamMember = await prisma.teamMember.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    await auditLog(authUser.id, 'UPDATE', 'team_member', teamMember.id, { action: 'link_user', userId });
    res.json({ success: true, data: teamMember, message: userId ? 'Team member linked to user' : 'Team member unlinked from user' });
  } catch (error) {
    logger.error('Failed to link team member to user', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to link user' } });
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
