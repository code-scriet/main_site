import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { requireNotBlocked } from '../middleware/blocks.js';
import { auditLog } from '../utils/audit.js';
import { logger } from '../utils/logger.js';
import { submitUrl } from '../utils/indexnow.js';
import { emailService } from '../utils/email.js';
import { parsePaginationNumber } from '../utils/pagination.js';
import { sanitizeHtml, sanitizeUrl } from '../utils/sanitize.js';
import { generateSlug, generateUniqueSlug } from '../utils/slug.js';

export const networkRouter = Router();
const CUID_REGEX = /^c[a-z0-9]{24}$/;

// Rich content fields that support HTML/Markdown
const RICH_CONTENT_FIELDS = ['bio', 'connectionNote', 'achievements', 'adminNotes', 'vision', 'story', 'expertise'];

// Sanitize rich content in profile data
const sanitizeProfileContent = (data: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...data };
  for (const field of RICH_CONTENT_FIELDS) {
    if (typeof result[field] === 'string') {
      result[field] = sanitizeHtml(result[field] as string);
    }
  }
  if (typeof result.personalWebsite === 'string') {
    result.personalWebsite = sanitizeUrl(result.personalWebsite as string) || null;
  }
  return result;
};

const networkConnectionTypes = [
  'GUEST_SPEAKER',
  'GMEET_SESSION',
  'EVENT_JUDGE',
  'MENTOR',
  'INDUSTRY_PARTNER',
  'ALUMNI',
  'OTHER',
] as const;

const networkStatuses = ['PENDING', 'VERIFIED', 'REJECTED'] as const;

const isNetworkConnectionType = (value: string): value is (typeof networkConnectionTypes)[number] =>
  networkConnectionTypes.includes(value as (typeof networkConnectionTypes)[number]);

const isNetworkStatus = (value: string): value is (typeof networkStatuses)[number] =>
  networkStatuses.includes(value as (typeof networkStatuses)[number]);

const toCleanSlugBase = (raw: string): string => generateSlug(raw) || 'network-profile';

const resolveUniqueNetworkSlug = async (raw: string, excludeId?: string): Promise<string> => {
  const baseSlug = toCleanSlugBase(raw);
  const existingSlugs = (
    await prisma.networkProfile.findMany({
      where: {
        ...(excludeId ? { id: { not: excludeId } } : {}),
        slug: { startsWith: baseSlug },
      },
      take: 100,
      select: { slug: true },
    })
  )
    .map((profile) => profile.slug)
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

// Validation schemas
const createProfileSchema = z.object({
  fullName: z.string().min(2).max(100),
  designation: z.string().min(2).max(100),
  company: z.string().min(1).max(100),
  industry: z.string().min(1).max(50),
  bio: z.string().max(2000).optional().nullable(),
  profilePhoto: z.string().url().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  linkedinUsername: z.string().max(100).optional().nullable(),
  twitterUsername: z.string().max(100).optional().nullable(),
  githubUsername: z.string().max(100).optional().nullable(),
  personalWebsite: z.string().url().optional().nullable(),
  connectionType: z.enum([
    'GUEST_SPEAKER',
    'GMEET_SESSION',
    'EVENT_JUDGE',
    'MENTOR',
    'INDUSTRY_PARTNER',
    'ALUMNI',
    'OTHER',
  ]),
  connectionNote: z.string().max(1000).optional().nullable(),
  connectedSince: z.number().min(2000).max(2100).optional().nullable(),
  // Alumni-specific fields
  passoutYear: z.number().min(1990).max(2100).optional().nullable(),
  degree: z.string().max(50).optional().nullable(),
  branch: z.string().max(100).optional().nullable(),
  rollNumber: z.string().max(50).optional().nullable(),
  achievements: z.string().max(2000).optional().nullable(),
  currentLocation: z.string().max(100).optional().nullable(),
  // Rich profile content fields
  vision: z.string().max(5000).optional().nullable(),
  story: z.string().max(5000).optional().nullable(),
  expertise: z.string().max(3000).optional().nullable(),
});

const updateProfileSchema = createProfileSchema.partial();

const networkEventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  date: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).optional().nullable(),
  type: z.string().trim().max(120).optional().nullable(),
  link: z.string().url('Event link must be a valid URL').optional().nullable(),
});

const adminUpdateProfileSchema = createProfileSchema
  .partial()
  .extend({
    isPublic: z.boolean().optional(),
    displayOrder: z.coerce.number().int().min(0).max(100000).optional(),
    adminNotes: z.string().max(5000).optional().nullable(),
    events: z.array(networkEventSchema).max(200).optional().nullable(),
    isFeatured: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

const toNullableJsonValue = (
  value: unknown
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
};

// ====================
// JOIN NETWORK (for already logged-in users)
// ====================

// Allow authenticated users to join the network without OAuth
networkRouter.post('/join', authMiddleware, requireNotBlocked('NETWORK'), async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Only upgrade USER or PUBLIC roles to NETWORK
    // Higher-privileged users (MEMBER, CORE_MEMBER, ADMIN) keep their role
    if (user.role === 'USER' || user.role === 'PUBLIC') {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'NETWORK' } as any,  
      });
      
      logger.info(`User ${user.email} joined network`);
      return res.json({ 
        success: true, 
        message: 'Successfully joined the network',
        newRole: 'NETWORK'
      });
    } else if (user.role === 'NETWORK') {
      // Already a network member
      return res.json({ 
        success: true, 
        message: 'Already a network member',
        newRole: 'NETWORK'
      });
    } else {
      // Higher-privileged users - they can still create a network profile but role stays the same
      return res.json({ 
        success: true, 
        message: 'You can create a network profile with your current role',
        newRole: user.role
      });
    }
  } catch (error) {
    logger.error('Join network error:', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to join network' });
  }
});

// ====================
// PUBLIC ENDPOINTS
// ====================

// Get all verified, public network profiles
networkRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { industry, connectionType, search } = req.query;
    const limit = parsePaginationNumber(req.query.limit, 200, { min: 1, max: 500 });
    const offset = parsePaginationNumber(req.query.offset, 0, { min: 0, max: 1000000 });

    if (limit === null) {
      return res.status(400).json({
        success: false,
        error: { message: 'limit must be an integer between 1 and 500' },
      });
    }

    if (offset === null) {
      return res.status(400).json({
        success: false,
        error: { message: 'offset must be a non-negative integer' },
      });
    }

    const basePublicWhere: { status: 'VERIFIED'; isPublic: true } = {
      status: 'VERIFIED',
      isPublic: true,
    };
    const where: any = { ...basePublicWhere };

    if (industry && typeof industry === 'string') {
      where.industry = industry;
    }

    if (connectionType && typeof connectionType === 'string') {
      if (!isNetworkConnectionType(connectionType)) {
        return res.status(400).json({
          success: false,
          error: { message: 'Invalid connection type filter' },
        });
      }
      where.connectionType = connectionType;
    }

    if (search && typeof search === 'string') {
      const trimmedSearch = search.trim();
      if (trimmedSearch.length > 120) {
        return res.status(400).json({
          success: false,
          error: { message: 'search must be 120 characters or fewer' },
        });
      }
      where.OR = [
        { fullName: { contains: trimmedSearch, mode: 'insensitive' } },
        { company: { contains: trimmedSearch, mode: 'insensitive' } },
        { designation: { contains: trimmedSearch, mode: 'insensitive' } },
      ];
    }

    const [profiles, industryRows, connectionTypeRows] = await Promise.all([
      prisma.networkProfile.findMany({
        where,
        orderBy: [{ isFeatured: 'desc' }, { displayOrder: 'asc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
        select: {
          id: true,
          slug: true,
          fullName: true,
          designation: true,
          company: true,
          industry: true,
          bio: true,
          profilePhoto: true,
          linkedinUsername: true,
          twitterUsername: true,
          githubUsername: true,
          personalWebsite: true,
          connectionType: true,
          connectedSince: true,
          // Alumni-specific fields
          passoutYear: true,
          degree: true,
          branch: true,
          currentLocation: true,
          isFeatured: true,
          createdAt: true,
        },
      }),
      prisma.networkProfile.findMany({
        where: basePublicWhere,
        select: { industry: true },
        distinct: ['industry'],
        orderBy: { industry: 'asc' },
        take: 100,
      }),
      prisma.networkProfile.findMany({
        where: basePublicWhere,
        select: { connectionType: true },
        distinct: ['connectionType'],
        take: 100,
      }),
    ]);
    const shouldCount = !(offset === 0 && profiles.length < limit);
    const total = shouldCount ? await prisma.networkProfile.count({ where }) : profiles.length;

    const industries = industryRows.map((row) => row.industry).filter(Boolean);
    const connectionTypes = connectionTypeRows.map((row) => row.connectionType);

    res.json({
      success: true,
      data: {
        profiles,
        filters: { industries, connectionTypes },
        total,
        pagination: { limit, offset },
      },
    });
  } catch (error) {
    logger.error('Failed to fetch network profiles', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to fetch profiles' } });
  }
});

// Get single verified profile (by slug or id)
networkRouter.get('/:idOrSlug', async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;
    const publicSelect = {
      id: true,
      slug: true,
      fullName: true,
      designation: true,
      company: true,
      industry: true,
      bio: true,
      profilePhoto: true,
      linkedinUsername: true,
      twitterUsername: true,
      githubUsername: true,
      personalWebsite: true,
      connectionType: true,
      connectionNote: true,
      connectedSince: true,
      passoutYear: true,
      degree: true,
      branch: true,
      achievements: true,
      currentLocation: true,
      vision: true,
      story: true,
      expertise: true,
      events: true,
      isFeatured: true,
      createdAt: true,
    } satisfies Prisma.NetworkProfileSelect;

    const profile = await prisma.networkProfile.findFirst({
      where: {
        status: 'VERIFIED',
        isPublic: true,
        OR: [
          { slug: idOrSlug },
          { legacySlugs: { has: idOrSlug } },
          ...(CUID_REGEX.test(idOrSlug) ? [{ id: idOrSlug }] : []),
        ],
      },
      select: publicSelect,
    });

    if (!profile) {
      return res.status(404).json({ success: false, error: { message: 'Profile not found' } });
    }

    res.json({ success: true, data: profile });
  } catch (error) {
    logger.error('Failed to fetch network profile', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to fetch profile' } });
  }
});

// ====================
// NETWORK USER ENDPOINTS
// ====================

// Get own profile (NETWORK role users)
networkRouter.get('/profile/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    const profile = await prisma.networkProfile.findUnique({
      where: { userId: authUser.id },
    });

    // Wrap response so client gets { data: profile, hasProfile: boolean }
    res.json({
      success: true,
      data: {
        data: profile || null,
        hasProfile: !!profile,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch own network profile', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to fetch profile' } });
  }
});

// Submit onboarding form (create profile)
networkRouter.post('/profile', authMiddleware, requireNotBlocked('NETWORK'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    // Check if profile already exists
    const existing = await prisma.networkProfile.findUnique({
      where: { userId: authUser.id },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: { message: 'Profile already exists. Use PATCH to update.' },
      });
    }

    const parsed = createProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { message: 'Validation failed', details: parsed.error.flatten() },
      });
    }

    const slug = await resolveUniqueNetworkSlug(parsed.data.fullName);

    // Sanitize rich content fields
    const sanitizedData = sanitizeProfileContent(parsed.data as Record<string, unknown>);

    // Fetch user to get Google profile photo if not provided
    const user = await prisma.user.findUnique({ 
      where: { id: authUser.id }, 
      select: { email: true, avatar: true } 
    });

    const profile = await prisma.networkProfile.create({
      data: {
        userId: authUser.id,
        slug,
        legacySlugs: [],
        ...sanitizedData,
        // Use Google profile picture if profilePhoto not provided
        profilePhoto: parsed.data.profilePhoto || user?.avatar || undefined,
        status: 'PENDING',
      } as any,
    });

    // Send thank you email for joining the network
    if (user?.email) {
      // Send alumni-specific email (WhatsApp link only if verified)
      if (parsed.data.connectionType === 'ALUMNI') {
        emailService.sendAlumniWelcome(
          user.email,
          parsed.data.fullName,
          parsed.data.designation,
          parsed.data.company,
          false, // Not verified yet
          parsed.data.passoutYear || undefined,
          parsed.data.branch || undefined
        ).catch(err => {
          logger.error('Failed to send alumni welcome email', { error: err });
        });
      } else {
        emailService.sendNetworkWelcome(
          user.email,
          parsed.data.fullName,
          parsed.data.designation,
          parsed.data.company,
          parsed.data.connectionType
        ).catch(err => {
          logger.error('Failed to send network welcome email', { error: err });
        });
      }
    }

    logger.info('Network profile created', { userId: authUser.id, profileId: profile.id });

    res.status(201).json({
      success: true,
      data: profile,
      message: 'Profile submitted for review',
    });
  } catch (error) {
    logger.error('Failed to create network profile', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to create profile' } });
  }
});

// Update own profile
networkRouter.patch('/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    const existing = await prisma.networkProfile.findUnique({
      where: { userId: authUser.id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { message: 'No profile found. Create one first.' },
      });
    }

    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { message: 'Validation failed', details: parsed.error.flatten() },
      });
    }

    // Update data without resetting verification status.
    // Once verified, profiles stay verified even after updates.
    const sanitizedData = sanitizeProfileContent(parsed.data as Record<string, unknown>);
    const updateData: any = { ...sanitizedData };
    if (typeof parsed.data.fullName === 'string' && parsed.data.fullName.trim() && parsed.data.fullName.trim() !== existing.fullName) {
      const canonicalSlug = await resolveUniqueNetworkSlug(parsed.data.fullName, existing.id);
      updateData.slug = canonicalSlug;
      updateData.legacySlugs = appendLegacySlug(existing.legacySlugs, existing.slug, canonicalSlug);
    }

    const profile = await prisma.networkProfile.update({
      where: { userId: authUser.id },
      data: updateData,
    });

    logger.info('Network profile updated', {
      userId: authUser.id,
      profileId: profile.id,
      status: profile.status,
    });

    res.json({
      success: true,
      data: profile,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    logger.error('Failed to update network profile', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to update profile' } });
  }
});

// ====================
// ADMIN ENDPOINTS
// ====================

// Get pending profiles
networkRouter.get('/admin/pending', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const profiles = await prisma.networkProfile.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    res.json({ success: true, data: profiles });
  } catch (error) {
    logger.error('Failed to fetch pending network profiles', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to fetch profiles' } });
  }
});

// Get all profiles (with filters)
networkRouter.get('/admin/all', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { status, search, category } = req.query;
    const page = parsePaginationNumber(req.query.page, 1, { min: 1, max: 1000000 });
    const limit = parsePaginationNumber(req.query.limit, 100, { min: 1, max: 500 });

    if (page === null) {
      return res.status(400).json({ success: false, error: { message: 'page must be a positive integer' } });
    }
    if (limit === null) {
      return res.status(400).json({ success: false, error: { message: 'limit must be an integer between 1 and 500' } });
    }

    const where: Record<string, unknown> = {};

    if (status && typeof status === 'string') {
      if (!isNetworkStatus(status)) {
        return res.status(400).json({ success: false, error: { message: 'Invalid status filter' } });
      }
      where.status = status;
    }

    if (category && typeof category === 'string') {
      const normalized = category.toUpperCase();
      if (normalized === 'ALUMNI') {
        where.connectionType = 'ALUMNI';
      } else if (normalized === 'PROFESSIONAL' || normalized === 'NETWORK') {
        where.connectionType = { not: 'ALUMNI' };
      } else if (normalized !== 'ANY') {
        return res.status(400).json({ success: false, error: { message: 'Invalid category filter' } });
      }
    }

    if (search && typeof search === 'string' && search.trim()) {
      const trimmed = search.trim();
      if (trimmed.length > 120) {
        return res.status(400).json({ success: false, error: { message: 'search must be 120 characters or fewer' } });
      }
      where.OR = [
        { fullName: { contains: trimmed, mode: 'insensitive' } },
        { company: { contains: trimmed, mode: 'insensitive' } },
        { designation: { contains: trimmed, mode: 'insensitive' } },
        { user: { email: { contains: trimmed, mode: 'insensitive' } } },
      ];
    }

    const [profiles, counts, total] = await Promise.all([
      prisma.networkProfile.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      }),
      // Get counts by status
      prisma.networkProfile.groupBy({
        by: ['status'],
        _count: true,
      }),
      prisma.networkProfile.count({ where }),
    ]);

    const statusCounts = {
      PENDING: 0,
      VERIFIED: 0,
      REJECTED: 0,
    };
    counts.forEach(c => {
      statusCounts[c.status as keyof typeof statusCounts] = c._count;
    });

    res.json({
      success: true,
      data: {
        profiles,
        counts: statusCounts,
        total,
        pagination: {
          page,
          limit,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to fetch all network profiles', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to fetch profiles' } });
  }
});

// Get NETWORK-role users who have not completed onboarding yet (no profile row)
networkRouter.get('/admin/pending-users', authMiddleware, requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        role: 'NETWORK',
        networkProfile: { is: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        oauthProvider: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      data: {
        users,
        total: users.length,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch pending network users', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to fetch pending network users' } });
  }
});

// Export network data to Excel (Admin only)
networkRouter.get('/admin/export', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { status, connectionType, search, includePendingUsers, category } = req.query;

    const where: any = {};
    if (status && typeof status === 'string') {
      if (!isNetworkStatus(status)) {
        return res.status(400).json({ success: false, error: { message: 'Invalid status filter' } });
      }
      where.status = status;
    }
    const rawCategory = typeof category === 'string' ? category.toUpperCase() : 'ANY';
    const normalizedCategory = rawCategory === 'NETWORK' ? 'PROFESSIONAL' : rawCategory;
    if (!['ANY', 'PROFESSIONAL', 'ALUMNI'].includes(normalizedCategory)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid category filter' } });
    }
    if (normalizedCategory === 'ALUMNI') {
      where.connectionType = 'ALUMNI';
    } else if (normalizedCategory === 'PROFESSIONAL') {
      where.connectionType = { not: 'ALUMNI' };
    }
    if (connectionType && typeof connectionType === 'string') {
      if (!isNetworkConnectionType(connectionType)) {
        return res.status(400).json({ success: false, error: { message: 'Invalid connection type filter' } });
      }
      where.connectionType = connectionType;
    }
    if (search && typeof search === 'string') {
      const trimmed = search.trim();
      if (!trimmed) {
        // no-op
      } else if (trimmed.length > 120) {
        return res.status(400).json({ success: false, error: { message: 'search must be 120 characters or fewer' } });
      } else {
        where.OR = [
          { fullName: { contains: trimmed, mode: 'insensitive' } },
          { company: { contains: trimmed, mode: 'insensitive' } },
          { designation: { contains: trimmed, mode: 'insensitive' } },
          { user: { email: { contains: trimmed, mode: 'insensitive' } } },
        ];
      }
    }

    const shouldIncludePendingUsers = includePendingUsers !== 'false';

    const [profiles, pendingUsers] = await Promise.all([
      prisma.networkProfile.findMany({
        where,
        orderBy: [{ status: 'asc' }, { displayOrder: 'asc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          slug: true,
          fullName: true,
          designation: true,
          company: true,
          industry: true,
          bio: true,
          phone: true,
          connectionType: true,
          connectionNote: true,
          connectedSince: true,
          status: true,
          isPublic: true,
          displayOrder: true,
          isFeatured: true,
          verifiedAt: true,
          rejectionReason: true,
          linkedinUsername: true,
          twitterUsername: true,
          githubUsername: true,
          personalWebsite: true,
          // Alumni-specific fields
          passoutYear: true,
          degree: true,
          branch: true,
          rollNumber: true,
          achievements: true,
          currentLocation: true,
          // Admin content
          adminNotes: true,
          events: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              createdAt: true,
            },
          },
        },
      }),
      shouldIncludePendingUsers
        ? prisma.user.findMany({
            where: {
              role: 'NETWORK',
              networkProfile: { is: null },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
            select: {
              id: true,
              name: true,
              email: true,
              oauthProvider: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const connectionTypeLabel: Record<string, string> = {
      GUEST_SPEAKER: 'Guest Speaker',
      GMEET_SESSION: 'GMeet Session',
      EVENT_JUDGE: 'Event Judge',
      MENTOR: 'Mentor',
      INDUSTRY_PARTNER: 'Industry Partner',
      ALUMNI: 'Alumni',
      OTHER: 'Other',
    };

    const statusLabel: Record<string, string> = {
      PENDING: 'Pending',
      VERIFIED: 'Verified',
      REJECTED: 'Rejected',
    };

    const profileEventsToText = (events: unknown): string => {
      if (!Array.isArray(events)) {
        return '';
      }
      return events
        .map((event) => {
          if (!event || typeof event !== 'object') {
            return '';
          }
          const parsed = event as { title?: unknown; date?: unknown; type?: unknown };
          const title = typeof parsed.title === 'string' ? parsed.title : '';
          const date = typeof parsed.date === 'string' ? parsed.date : '';
          const type = typeof parsed.type === 'string' ? parsed.type : '';
          return [title, date, type].filter(Boolean).join(' | ');
        })
        .filter(Boolean)
        .join(' || ');
    };

    const socialLinkFromUsername = (platform: 'linkedin' | 'twitter' | 'github', username?: string | null): string => {
      if (!username) return '';
      if (platform === 'linkedin') return `https://linkedin.com/in/${username}`;
      if (platform === 'twitter') return `https://twitter.com/${username}`;
      return `https://github.com/${username}`;
    };

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.default.Workbook();
    workbook.creator = 'code.scriet';
    workbook.created = new Date();

    const applySheetStyling = (worksheet: any) => {  
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD97706' },
      };
      worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };

      worksheet.eachRow((row: any, rowNumber: number) => {  
        if (rowNumber > 1) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: rowNumber % 2 === 0 ? 'FFFEF3C7' : 'FFFFFFFF' },
          };
        }
        row.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
      });
    };

    const profilesSheet = workbook.addWorksheet('Network Profiles');
    profilesSheet.columns = [
      { header: 'Profile ID', key: 'profileId', width: 28 },
      { header: 'Slug', key: 'slug', width: 28 },
      { header: 'Full Name', key: 'fullName', width: 24 },
      { header: 'Email', key: 'email', width: 34 },
      { header: 'Designation', key: 'designation', width: 24 },
      { header: 'Company', key: 'company', width: 24 },
      { header: 'Industry', key: 'industry', width: 18 },
      { header: 'Connection Type', key: 'connectionType', width: 20 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Public', key: 'isPublic', width: 10 },
      { header: 'Featured', key: 'isFeatured', width: 10 },
      { header: 'Display Order', key: 'displayOrder', width: 14 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Connected Since', key: 'connectedSince', width: 14 },
      { header: 'Passout Year', key: 'passoutYear', width: 14 },
      { header: 'Degree', key: 'degree', width: 16 },
      { header: 'Branch', key: 'branch', width: 18 },
      { header: 'Roll Number', key: 'rollNumber', width: 14 },
      { header: 'Current Location', key: 'currentLocation', width: 20 },
      { header: 'LinkedIn', key: 'linkedin', width: 32 },
      { header: 'Twitter', key: 'twitter', width: 28 },
      { header: 'GitHub', key: 'github', width: 28 },
      { header: 'Website', key: 'website', width: 32 },
      { header: 'Bio', key: 'bio', width: 40 },
      { header: 'Connection Note', key: 'connectionNote', width: 34 },
      { header: 'Achievements', key: 'achievements', width: 40 },
      { header: 'Admin Notes', key: 'adminNotes', width: 44 },
      { header: 'Events Timeline', key: 'events', width: 44 },
      { header: 'Rejected Reason', key: 'rejectionReason', width: 28 },
      { header: 'Verified At', key: 'verifiedAt', width: 24 },
      { header: 'Created At', key: 'createdAt', width: 24 },
      { header: 'Updated At', key: 'updatedAt', width: 24 },
      { header: 'User Joined At', key: 'userCreatedAt', width: 24 },
    ];

    for (const profile of profiles) {
      profilesSheet.addRow({
        profileId: profile.id,
        slug: profile.slug || '',
        fullName: profile.fullName,
        email: profile.user.email,
        designation: profile.designation,
        company: profile.company,
        industry: profile.industry,
        connectionType: connectionTypeLabel[profile.connectionType] || profile.connectionType,
        status: statusLabel[profile.status] || profile.status,
        isPublic: profile.isPublic ? 'Yes' : 'No',
        isFeatured: profile.isFeatured ? 'Yes' : 'No',
        displayOrder: profile.displayOrder,
        phone: profile.phone || '',
        connectedSince: profile.connectedSince || '',
        passoutYear: profile.passoutYear || '',
        degree: profile.degree || '',
        branch: profile.branch || '',
        rollNumber: profile.rollNumber || '',
        currentLocation: profile.currentLocation || '',
        linkedin: socialLinkFromUsername('linkedin', profile.linkedinUsername),
        twitter: socialLinkFromUsername('twitter', profile.twitterUsername),
        github: socialLinkFromUsername('github', profile.githubUsername),
        website: profile.personalWebsite || '',
        bio: profile.bio || '',
        connectionNote: profile.connectionNote || '',
        achievements: profile.achievements || '',
        adminNotes: profile.adminNotes || '',
        events: profileEventsToText(profile.events),
        rejectionReason: profile.rejectionReason || '',
        verifiedAt: profile.verifiedAt
          ? profile.verifiedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
          : '',
        createdAt: profile.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        updatedAt: profile.updatedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        userCreatedAt: profile.user.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      });
    }
    applySheetStyling(profilesSheet);

    const alumniProfiles = profiles.filter((profile) => profile.connectionType === 'ALUMNI');
    const alumniSheet = workbook.addWorksheet('Alumni');
    alumniSheet.columns = [
      { header: 'Full Name', key: 'fullName', width: 24 },
      { header: 'Email', key: 'email', width: 34 },
      { header: 'Designation', key: 'designation', width: 24 },
      { header: 'Company', key: 'company', width: 24 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Passout Year', key: 'passoutYear', width: 14 },
      { header: 'Degree', key: 'degree', width: 16 },
      { header: 'Branch', key: 'branch', width: 18 },
      { header: 'Current Location', key: 'currentLocation', width: 20 },
      { header: 'Achievements', key: 'achievements', width: 40 },
      { header: 'Connected Since', key: 'connectedSince', width: 14 },
      { header: 'Created At', key: 'createdAt', width: 24 },
    ];
    for (const profile of alumniProfiles) {
      alumniSheet.addRow({
        fullName: profile.fullName,
        email: profile.user.email,
        designation: profile.designation,
        company: profile.company,
        status: statusLabel[profile.status] || profile.status,
        passoutYear: profile.passoutYear || '',
        degree: profile.degree || '',
        branch: profile.branch || '',
        currentLocation: profile.currentLocation || '',
        achievements: profile.achievements || '',
        connectedSince: profile.connectedSince || '',
        createdAt: profile.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      });
    }
    applySheetStyling(alumniSheet);

    const pendingUsersSheet = workbook.addWorksheet('Pending Onboarding');
    pendingUsersSheet.columns = [
      { header: 'User ID', key: 'id', width: 28 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Email', key: 'email', width: 34 },
      { header: 'OAuth Provider', key: 'oauthProvider', width: 16 },
      { header: 'Joined At', key: 'createdAt', width: 24 },
    ];
    for (const user of pendingUsers) {
      pendingUsersSheet.addRow({
        id: user.id,
        name: user.name,
        email: user.email,
        oauthProvider: user.oauthProvider || '',
        createdAt: user.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      });
    }
    applySheetStyling(pendingUsersSheet);

    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.addRow(['Generated At', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })]);
    summarySheet.addRow(['Generated By', authUser.email]);
    summarySheet.addRow(['Profiles Exported', profiles.length]);
    summarySheet.addRow(['Alumni In Export', alumniProfiles.length]);
    summarySheet.addRow(['Pending Onboarding Accounts', pendingUsers.length]);
    summarySheet.addRow(['Status Filter', typeof status === 'string' ? status : 'All']);
    summarySheet.addRow(['Category Filter', normalizedCategory]);
    summarySheet.addRow(['Connection Type Filter', typeof connectionType === 'string' ? connectionType : 'All']);
    summarySheet.addRow(['Search Filter', typeof search === 'string' ? search : 'None']);
    summarySheet.getColumn(1).width = 28;
    summarySheet.getColumn(2).width = 50;
    summarySheet.getColumn(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();

    let filename = 'network_profiles';
    if (normalizedCategory !== 'ANY') filename += `_${normalizedCategory.toLowerCase()}`;
    if (connectionType && typeof connectionType === 'string') filename += `_${connectionType.toLowerCase()}`;
    if (status && typeof status === 'string') filename += `_${status.toLowerCase()}`;
    filename += `_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));

    await auditLog(authUser.id, 'NETWORK_EXPORT', 'network_profiles', 'bulk', {
      filters: {
        status: typeof status === 'string' ? status : null,
        category: normalizedCategory,
        connectionType: typeof connectionType === 'string' ? connectionType : null,
        search: typeof search === 'string' ? search : null,
        includePendingUsers: shouldIncludePendingUsers,
      },
      exportedProfiles: profiles.length,
      exportedAlumni: alumniProfiles.length,
      exportedPendingUsers: pendingUsers.length,
    });

    return;
  } catch (error) {
    logger.error('Failed to export network data', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: { message: 'Failed to export network data' } });
  }
});

// Revert pending onboarding user back to USER role
networkRouter.patch('/admin/pending-users/:userId/revert', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { userId } = req.params;

    const target = await prisma.user.findUnique({
      where: { id: userId },
      include: { networkProfile: { select: { id: true } } },
    });

    if (!target) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    if (target.role !== 'NETWORK') {
      return res.status(400).json({
        success: false,
        error: { message: 'Only NETWORK users can be reverted from this section' },
      });
    }

    if (target.networkProfile) {
      return res.status(400).json({
        success: false,
        error: { message: 'User already submitted a network profile' },
      });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role: 'USER' },
      select: { id: true, role: true, name: true, email: true },
    });

    await auditLog(authUser.id, 'NETWORK_PENDING_USER_REVERTED', 'User', userId, {
      name: updated.name,
      email: updated.email,
    });

    res.json({
      success: true,
      data: updated,
      message: 'User moved back to normal sign-in flow',
    });
  } catch (error) {
    logger.error('Failed to revert pending network user', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to revert user' } });
  }
});

// Delete pending onboarding user (NETWORK role without profile)
networkRouter.delete('/admin/pending-users/:userId', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { userId } = req.params;

    if (authUser.id === userId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Cannot delete your own account' },
      });
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      include: { networkProfile: { select: { id: true } } },
    });

    if (!target) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    if (target.role !== 'NETWORK') {
      return res.status(400).json({
        success: false,
        error: { message: 'Only NETWORK users can be deleted from this section' },
      });
    }

    if (target.networkProfile) {
      return res.status(400).json({
        success: false,
        error: { message: 'User already submitted a network profile' },
      });
    }

    await prisma.user.delete({ where: { id: userId } });

    await auditLog(authUser.id, 'NETWORK_PENDING_USER_DELETED', 'User', userId, {
      name: target.name,
      email: target.email,
    });

    res.json({
      success: true,
      message: 'Pending onboarding account deleted successfully',
    });
  } catch (error) {
    logger.error('Failed to delete pending network user', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to delete user' } });
  }
});

// Verify profile
networkRouter.patch('/admin/:id/verify', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { id } = req.params;

    const profile = await prisma.networkProfile.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    });

    if (!profile) {
      return res.status(404).json({ success: false, error: { message: 'Profile not found' } });
    }

    const slug = await resolveUniqueNetworkSlug(profile.fullName, profile.id);
    const legacySlugs = appendLegacySlug(profile.legacySlugs, profile.slug, slug);

    const updated = await prisma.networkProfile.update({
      where: { id },
      data: {
        status: 'VERIFIED',
        verifiedAt: new Date(),
        verifiedBy: authUser.id,
        rejectionReason: null,
        slug,
        legacySlugs,
      },
    });

    // Send verification email in background. Verification should succeed even if email provider is down.
    const emailPromise = profile.connectionType === 'ALUMNI'
      ? emailService.sendAlumniWelcome(
          profile.user.email,
          profile.fullName,
          profile.designation,
          profile.company,
          true,
          profile.passoutYear || undefined,
          profile.branch || undefined
        )
      : emailService.sendNetworkVerified(
          profile.user.email,
          profile.fullName,
          profile.designation,
          profile.company,
          slug
        );

    emailPromise.catch((error) => {
      logger.error('Failed to send network verification email', {
        profileId: id,
        email: profile.user.email,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Audit log
    await auditLog(authUser.id, 'NETWORK_PROFILE_VERIFIED', 'NetworkProfile', id, {
      fullName: profile.fullName,
      company: profile.company,
    });

    logger.info('Network profile verified', { profileId: id, adminId: authUser.id });

    // Notify search engines about the newly public network profile
    if (updated.slug) submitUrl(`/network/${updated.slug}`);

    res.json({
      success: true,
      data: updated,
      message: 'Profile verified successfully',
    });
  } catch (error) {
    logger.error('Failed to verify network profile', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to verify profile' } });
  }
});

// Reject profile
networkRouter.patch('/admin/:id/reject', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { id } = req.params;
    const rawReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    // Sanitize rejection reason to prevent XSS when displayed
    const reason = rawReason ? sanitizeHtml(rawReason) : '';

    if (reason.length > 1000) {
      return res.status(400).json({ success: false, error: { message: 'Rejection reason must be 1000 characters or fewer' } });
    }

    const profile = await prisma.networkProfile.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    });

    if (!profile) {
      return res.status(404).json({ success: false, error: { message: 'Profile not found' } });
    }

    const updated = await prisma.networkProfile.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason || null,
      },
    });

    // Send rejection email in background if reason provided.
    if (reason) {
      emailService.sendNetworkRejected(
        profile.user.email,
        profile.fullName,
        reason
      ).catch((error) => {
        logger.error('Failed to send network rejection email', {
          profileId: id,
          email: profile.user.email,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    // Audit log
    await auditLog(authUser.id, 'NETWORK_PROFILE_REJECTED', 'NetworkProfile', id, {
      fullName: profile.fullName,
      reason: reason || 'No reason provided',
    });

    logger.info('Network profile rejected', { profileId: id, adminId: authUser.id, reason });

    res.json({
      success: true,
      data: updated,
      message: 'Profile rejected',
    });
  } catch (error) {
    logger.error('Failed to reject network profile', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to reject profile' } });
  }
});

// Admin update any profile
networkRouter.patch('/admin/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { id } = req.params;

    const existing = await prisma.networkProfile.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: { message: 'Profile not found' } });
    }

    const parsed = adminUpdateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { message: parsed.error.errors[0]?.message || 'Invalid profile update payload' },
      });
    }

    const { events, ...updateFields } = parsed.data;

    // Sanitize rich content fields
    const sanitizedData = sanitizeProfileContent(updateFields as Record<string, unknown>);
    const updateData: any = {
      ...sanitizedData,
      ...(events !== undefined ? { events: toNullableJsonValue(events) } : {}),
    };

    if (typeof parsed.data.fullName === 'string' && parsed.data.fullName.trim() && parsed.data.fullName.trim() !== existing.fullName) {
      const canonicalSlug = await resolveUniqueNetworkSlug(parsed.data.fullName, existing.id);
      updateData.slug = canonicalSlug;
      updateData.legacySlugs = appendLegacySlug(existing.legacySlugs, existing.slug, canonicalSlug);
    }

    const updated = await prisma.networkProfile.update({
      where: { id },
      data: updateData,
    });

    await auditLog(authUser.id, 'NETWORK_PROFILE_UPDATED', 'NetworkProfile', id, {
      changes: Object.keys(parsed.data),
    });

    logger.info('Network profile admin updated', { profileId: id, adminId: authUser.id });

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error('Failed to admin update network profile', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to update profile' } });
  }
});

// Delete profile
networkRouter.delete('/admin/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { id } = req.params;

    const profile = await prisma.networkProfile.findUnique({ where: { id } });
    if (!profile) {
      return res.status(404).json({ success: false, error: { message: 'Profile not found' } });
    }

    await prisma.networkProfile.delete({ where: { id } });

    await auditLog(authUser.id, 'NETWORK_PROFILE_DELETED', 'NetworkProfile', id, {
      fullName: profile.fullName,
      company: profile.company,
    });

    logger.info('Network profile deleted', { profileId: id, adminId: authUser.id });

    res.json({ success: true, message: 'Profile deleted' });
  } catch (error) {
    logger.error('Failed to delete network profile', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to delete profile' } });
  }
});

// Get network stats for admin dashboard
networkRouter.get('/admin/stats', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const [totalVerified, totalPending, thisMonth] = await Promise.all([
      prisma.networkProfile.count({ where: { status: 'VERIFIED' } }),
      prisma.networkProfile.count({ where: { status: 'PENDING' } }),
      prisma.networkProfile.count({
        where: {
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalVerified,
        totalPending,
        thisMonth,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch network stats', { error });
    res.status(500).json({ success: false, error: { message: 'Failed to fetch stats' } });
  }
});
