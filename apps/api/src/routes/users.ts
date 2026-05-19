import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Prisma, type UserBlockFeature } from '@prisma/client';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import { logger } from '../utils/logger.js';
import bcrypt from 'bcryptjs';
import { socketEvents, disconnectUserSockets } from '../utils/socket.js';
import { computeQOTDStats } from '../utils/qotdStreak.js';
import { isSuperAdmin, isPresidentOrSuperAdmin } from '../utils/superAdmin.js';
import { emailService } from '../utils/email.js';
import { ApiResponse } from '../utils/response.js';
import { hashPasswordResetToken } from '../utils/passwordReset.js';

const USER_BLOCK_FEATURES = ['EVENT', 'PLAYGROUND', 'QOTD', 'QUIZ', 'NETWORK'] as const;
type UserBlockFeatureKey = (typeof USER_BLOCK_FEATURES)[number];

/** Sentinel reason that identifies a UserBlock row created (or overwritten)
 * by the soft-delete handler. Restore uses this string to remove the
 * auto-issued blocks while leaving anything an admin later writes alone. */
const SOFT_DELETE_AUTO_REASON = 'Auto-block on soft-delete';

export const usersRouter = Router();

const optionalUrl = z.union([z.string().url('Must be a valid URL'), z.literal('')]).optional();

const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  bio: z.string().max(3000).optional().nullable(),
  avatarUrl: z.string().url('Avatar URL must be valid').optional().or(z.literal('')),
  githubUrl: optionalUrl,
  linkedinUrl: optionalUrl,
  twitterUrl: optionalUrl,
  websiteUrl: optionalUrl,
  phone: z.string().trim().max(30).optional().nullable(),
  course: z.string().trim().max(100).optional().nullable(),
  branch: z.string().trim().max(100).optional().nullable(),
  year: z.string().trim().max(30).optional().nullable(),
});

const adminProfileUpdateSchema = profileUpdateSchema.extend({
  password: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    },
    z.string().min(8).max(128).optional()
  ),
});

const roleUpdateSchema = z.object({
  role: z.enum(['USER', 'MEMBER', 'CORE_MEMBER', 'ADMIN', 'PRESIDENT']),
});

const addPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

const normalizeOptionalText = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

// Get current user profile
usersRouter.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        bio: true,
        phone: true,
        course: true,
        branch: true,
        year: true,
        profileCompleted: true,
        password: true,
        oauthProvider: true,
        githubUrl: true,
        linkedinUrl: true,
        twitterUrl: true,
        websiteUrl: true,
        createdAt: true,
        _count: { select: { registrations: true, qotdSubmissions: true } },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    // Return user data without password, but with hasPassword flag
    const { password, ...userData } = user;
    res.json({ 
      success: true, 
      data: {
        ...userData,
        hasPassword: !!password,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch profile' } });
  }
});

// Update current user profile
usersRouter.put('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { message: parsed.error.errors[0]?.message || 'Invalid profile update payload' },
      });
    }

    const { name, bio, avatarUrl, githubUrl, linkedinUrl, twitterUrl, websiteUrl, phone, course, branch, year } = parsed.data;

    const existing = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { phone: true, course: true, branch: true, year: true },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    const nextPhone = normalizeOptionalText(phone === undefined ? existing.phone : phone);
    const nextCourse = normalizeOptionalText(course === undefined ? existing.course : course);
    const nextBranch = normalizeOptionalText(branch === undefined ? existing.branch : branch);
    const nextYear = normalizeOptionalText(year === undefined ? existing.year : year);
    const isProfileCompletion = Boolean(nextPhone && nextCourse && nextBranch && nextYear);

    const user = await prisma.user.update({
      where: { id: authUser.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(bio !== undefined && { bio: normalizeOptionalText(bio) }),
        ...(avatarUrl !== undefined && { avatar: normalizeOptionalText(avatarUrl) }),
        ...(githubUrl !== undefined && { githubUrl: normalizeOptionalText(githubUrl) }),
        ...(linkedinUrl !== undefined && { linkedinUrl: normalizeOptionalText(linkedinUrl) }),
        ...(twitterUrl !== undefined && { twitterUrl: normalizeOptionalText(twitterUrl) }),
        ...(websiteUrl !== undefined && { websiteUrl: normalizeOptionalText(websiteUrl) }),
        ...(phone !== undefined && { phone: nextPhone }),
        ...(course !== undefined && { course: nextCourse }),
        ...(branch !== undefined && { branch: nextBranch }),
        ...(year !== undefined && { year: nextYear }),
        profileCompleted: isProfileCompletion,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        bio: true,
        phone: true,
        course: true,
        branch: true,
        year: true,
        profileCompleted: true,
        githubUrl: true,
        linkedinUrl: true,
        twitterUrl: true,
        websiteUrl: true,
      },
    });

    await auditLog(authUser.id, 'UPDATE', 'user', authUser.id, { fields: Object.keys(req.body) });
    res.json({ success: true, data: user, message: 'Profile updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update profile' } });
  }
});

// Add password for OAuth-only accounts
usersRouter.post('/me/add-password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const parsed = addPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { message: parsed.error.errors[0]?.message || 'Invalid password payload' } });
    }
    const { newPassword } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true, password: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    if (user.password) {
      return res.status(400).json({ success: false, error: { message: 'You already have a password set. Use "Change Password" instead.' } });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: authUser.id },
      data: { password: hashedPassword },
    });

    await auditLog(authUser.id, 'CREATE', 'user', authUser.id, { action: 'password_added' });
    res.json({ success: true, message: 'Password added successfully! You can now sign in with email and password.' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to add password' } });
  }
});

// Change password
usersRouter.post('/me/change-password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { message: parsed.error.errors[0]?.message || 'Invalid password payload' } });
    }
    const { currentPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true, password: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    if (!user.password) {
      return res.status(400).json({ success: false, error: { message: 'You have not set a password yet. Please use "Add Password" instead.' } });
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ success: false, error: { message: 'Current password is incorrect' } });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: authUser.id },
      data: { password: hashedPassword },
    });

    await auditLog(authUser.id, 'UPDATE', 'user', authUser.id, { action: 'password_change' });
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to change password' } });
  }
});

// Get user's event registrations
usersRouter.get('/me/registrations', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    const registrations = await prisma.eventRegistration.findMany({
      where: { userId: authUser.id },
      select: {
        id: true,
        userId: true,
        eventId: true,
        timestamp: true,
        customFieldResponses: true,
        event: { select: { id: true, title: true, startDate: true, location: true, imageUrl: true } },
      },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    res.json({ success: true, data: registrations });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch registrations' } });
  }
});

// Get user's QOTD stats (streak, longest streak, badges, heatmap, recent submissions)
usersRouter.get('/me/qotd-stats', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const stats = await computeQOTDStats(authUser.id);
    res.json({
      success: true,
      // Keep legacy field names alongside the richer payload for backwards compatibility.
      data: {
        ...stats,
        totalSubmissions: stats.totalSolved,
      },
    });
  } catch (error) {
    logger.error('Failed to compute QOTD stats', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: { message: 'Failed to fetch QOTD stats' } });
  }
});

// Search users (admin)
usersRouter.get('/search', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query || query.length < 2) {
      return res.json({ success: true, data: [] });
    }
    if (query.length > 120) {
      return res.status(400).json({ success: false, error: { message: 'Search query must be 120 characters or fewer' } });
    }

    const users = await prisma.user.findMany({
      where: {
        role: { not: 'NETWORK' },
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 10,
      select: { id: true, name: true, email: true, avatar: true, role: true },
    });

    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to search users' } });
  }
});

// Export all users to Excel (admin)
usersRouter.get('/export', authMiddleware, requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { not: 'NETWORK' } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        course: true,
        branch: true,
        year: true,
        bio: true,
        profileCompleted: true,
        oauthProvider: true,
        githubUrl: true,
        linkedinUrl: true,
        twitterUrl: true,
        websiteUrl: true,
        createdAt: true,
        _count: { select: { registrations: true, qotdSubmissions: true } },
      },
    });

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.default.Workbook();
    workbook.creator = 'code.scriet';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Users');

    // Define columns
    worksheet.columns = [
      { header: 'S.No', key: 'sno', width: 8 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 35 },
      { header: 'Role', key: 'role', width: 15 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Course', key: 'course', width: 12 },
      { header: 'Branch', key: 'branch', width: 15 },
      { header: 'Year', key: 'year', width: 12 },
      { header: 'Profile Complete', key: 'profileCompleted', width: 16 },
      { header: 'Auth Method', key: 'authMethod', width: 14 },
      { header: 'Events Registered', key: 'eventsRegistered', width: 18 },
      { header: 'QOTD Submissions', key: 'qotdSubmissions', width: 18 },
      { header: 'GitHub', key: 'github', width: 30 },
      { header: 'LinkedIn', key: 'linkedin', width: 30 },
      { header: 'Joined', key: 'joined', width: 22 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD97706' }, // Amber color
    };
    worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 25;

    // Add data rows
    users.forEach((user, index) => {
      worksheet.addRow({
        sno: index + 1,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone || 'N/A',
        course: user.course || 'N/A',
        branch: user.branch || 'N/A',
        year: user.year || 'N/A',
        profileCompleted: user.profileCompleted ? 'Yes' : 'No',
        authMethod: user.oauthProvider || 'Email/Password',
        eventsRegistered: user._count.registrations,
        qotdSubmissions: user._count.qotdSubmissions,
        github: user.githubUrl || '',
        linkedin: user.linkedinUrl || '',
        joined: user.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      });
    });

    // Add alternating row colors
    worksheet.eachRow((row, rowNumber) => {
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

    // Add summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.addRow(['Total Users', users.length]);
    summarySheet.addRow(['Admins', users.filter(u => u.role === 'ADMIN').length]);
    summarySheet.addRow(['Core Members', users.filter(u => u.role === 'CORE_MEMBER').length]);
    summarySheet.addRow(['Members', users.filter(u => u.role === 'USER').length]);
    summarySheet.addRow(['Profiles Completed', users.filter(u => u.profileCompleted).length]);
    summarySheet.addRow(['Export Date', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })]);

    summarySheet.getColumn(1).width = 20;
    summarySheet.getColumn(1).font = { bold: true };
    summarySheet.getColumn(2).width = 30;

    // Send Excel file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="code_scriet_users_${new Date().toISOString().split('T')[0]}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('User export error:', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: { message: 'Failed to export users' } });
  }
});

// Get all users (admin) — extended for admin-deep-control with optional
// server-side search (q), multi-value role/branch/year filters, hasNetwork
// + isBlocked toggles, includeDeleted (PRESIDENT/superAdmin only).
// Backward-compat: when no new filters are supplied, the legacy shape is
// returned verbatim. Callers can opt into the richer shape via `?searchAll=1`
// or any of the new params; meta.nextCursor is added in that mode.
usersRouter.get('/', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const includeAllValue = String(req.query.includeAll ?? '').toLowerCase();
    const includeAll = includeAllValue === 'true' || includeAllValue === '1' || includeAllValue === 'yes';
    const parsedLimit = Number(req.query.limit);
    const requestedLimit = Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 100;
    const regularLimit = Math.min(2000, Math.max(1, requestedLimit));

    // Parse new admin-deep-control filters
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
    const splitCsv = (v: unknown): string[] => (typeof v === 'string' && v.trim()
      ? v.split(',').map(s => s.trim()).filter(Boolean)
      : []);
    const ALLOWED_ROLES = ['PUBLIC', 'USER', 'MEMBER', 'CORE_MEMBER', 'ADMIN', 'PRESIDENT'] as const;
    type AllowedRole = (typeof ALLOWED_ROLES)[number];
    const roleFilter = splitCsv(req.query.role)
      .map(v => v.toUpperCase())
      .filter((v): v is AllowedRole => (ALLOWED_ROLES as readonly string[]).includes(v));
    const branchFilter = splitCsv(req.query.branch);
    const yearFilter = splitCsv(req.query.year);
    const blockedFromFilter = splitCsv(req.query.blockedFrom)
      .map(v => v.toUpperCase())
      .filter((v): v is UserBlockFeatureKey => (USER_BLOCK_FEATURES as readonly string[]).includes(v));
    const hasNetwork = req.query.hasNetwork === '1' || req.query.hasNetwork === 'true';
    const includeDeleted = (req.query.includeDeleted === '1' || req.query.includeDeleted === 'true')
      && isPresidentOrSuperAdmin(authUser);
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'created';
    const cursor = typeof req.query.cursor === 'string' && req.query.cursor.length > 0 ? req.query.cursor : null;

    const hasNewFilters = q.length > 0 || roleFilter.length > 0 || branchFilter.length > 0
      || yearFilter.length > 0 || blockedFromFilter.length > 0 || hasNetwork || includeDeleted
      || cursor !== null || sort !== 'created' || req.query.searchAll === '1' || req.query.searchAll === 'true';

    const userListSelect = {
      id: true,
      name: true,
      email: true,
      role: true,
      avatar: true,
      phone: true,
      course: true,
      branch: true,
      year: true,
      profileCompleted: true,
      createdAt: true,
      lastLoginAt: true,
      isDeleted: true,
      blocks: { select: { feature: true, expiresAt: true } },
    } as const;

    if (hasNewFilters) {
      // New advanced path — server-side filter + cursor pagination + lightweight match cap.
      const SEARCH_CAP = 500;
      const take = Math.min(SEARCH_CAP, Math.max(1, Math.min(100, Number(req.query.take) || 50)));

      const where: Prisma.UserWhereInput = {
        role: { not: 'NETWORK' },
        ...(includeDeleted ? {} : { isDeleted: false }),
        ...(roleFilter.length ? { role: { in: roleFilter as unknown as Prisma.EnumRoleFilter['in'] } } : {}),
        ...(branchFilter.length ? { branch: { in: branchFilter } } : {}),
        ...(yearFilter.length ? { year: { in: yearFilter } } : {}),
        ...(hasNetwork ? { networkProfile: { isNot: null } } : {}),
        ...(blockedFromFilter.length
          ? {
              blocks: {
                some: {
                  feature: { in: blockedFromFilter as UserBlockFeature[] },
                  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                },
              },
            }
          : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { branch: { contains: q, mode: 'insensitive' } },
                { course: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q, mode: 'insensitive' } },
                { githubUrl: { contains: q, mode: 'insensitive' } },
                { linkedinUrl: { contains: q, mode: 'insensitive' } },
                { twitterUrl: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      };

      const orderBy: Prisma.UserOrderByWithRelationInput =
        sort === 'last_seen' ? { lastLoginAt: { sort: 'desc', nulls: 'last' } }
        : sort === 'name' ? { name: 'asc' }
        : { createdAt: 'desc' };

      const [total, users] = await prisma.$transaction([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          orderBy,
          take: take + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: userListSelect,
        }),
      ]);

      const hasMore = users.length > take;
      const slice = hasMore ? users.slice(0, take) : users;
      const nextCursor = hasMore ? slice[slice.length - 1]?.id ?? null : null;

      return res.json({
        success: true,
        data: {
          users: slice,
          meta: {
            totalUsers: total,
            returned: slice.length,
            nextCursor,
            hasMore,
            mode: 'advanced',
            appliedFilters: {
              q: q || null,
              role: roleFilter,
              branch: branchFilter,
              year: yearFilter,
              blockedFrom: blockedFromFilter,
              hasNetwork,
              includeDeleted,
              sort,
            },
          },
        },
      });
    }

    // ─── Legacy path (backward-compat) ─────────────────────────────────────
    const [totalUsers, privilegedUsersCount, regularUsersTotal] = await Promise.all([
      prisma.user.count({ where: { role: { not: 'NETWORK' }, isDeleted: false } }),
      prisma.user.count({ where: { role: { in: ['ADMIN', 'PRESIDENT'] }, isDeleted: false } }),
      prisma.user.count({ where: { role: { notIn: ['NETWORK', 'ADMIN', 'PRESIDENT'] }, isDeleted: false } }),
    ]);

    if (includeAll) {
      const users = await prisma.user.findMany({
        where: { role: { not: 'NETWORK' }, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        select: userListSelect,
      });

      return res.json({
        success: true,
        data: {
          users,
          meta: {
            totalUsers,
            privilegedUsers: privilegedUsersCount,
            regularUsersTotal,
            regularUsersReturned: regularUsersTotal,
            regularLimit: null,
            includeAll: true,
            hasMoreRegular: false,
          },
        },
      });
    }

    // Keep payload bounded for regular users while always including privileged roles.
    const [privilegedUsers, recentRegularUsers] = await Promise.all([
      prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'PRESIDENT'] }, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        select: userListSelect,
      }),
      prisma.user.findMany({
        where: { role: { notIn: ['NETWORK', 'ADMIN', 'PRESIDENT'] }, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: regularLimit,
        select: userListSelect,
      }),
    ]);

    const users = [...privilegedUsers, ...recentRegularUsers].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );

    res.json({
      success: true,
      data: {
        users,
        meta: {
          totalUsers,
          privilegedUsers: privilegedUsersCount,
          regularUsersTotal,
          regularUsersReturned: recentRegularUsers.length,
          regularLimit,
          includeAll: false,
          hasMoreRegular: regularLimit < regularUsersTotal,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to fetch users', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: { message: 'Failed to fetch users' } });
  }
});

// Get user by ID (admin)
usersRouter.get('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const targetUser = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        bio: true,
        phone: true,
        course: true,
        branch: true,
        year: true,
        profileCompleted: true,
        oauthProvider: true,
        githubUrl: true,
        linkedinUrl: true,
        twitterUrl: true,
        websiteUrl: true,
        createdAt: true,
        _count: { select: { registrations: true, qotdSubmissions: true } },
        registrations: {
          select: {
            id: true,
            userId: true,
            eventId: true,
            timestamp: true,
            customFieldResponses: true,
            event: {
              select: {
                id: true,
                title: true,
                startDate: true,
                status: true,
                imageUrl: true,
              },
            },
          },
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    if (targetUser.role === 'NETWORK') {
      return res.status(404).json({
        success: false,
        error: { message: 'Network profiles are managed in Network Management' },
      });
    }

    // Check permissions: Super admin can see everyone, other admins cannot see other admins
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    const isSuperAdmin = authUser.email === superAdminEmail;
    
    if ((targetUser.role === 'ADMIN' || targetUser.role === 'PRESIDENT') && !isSuperAdmin) {
      return res.status(403).json({ success: false, error: { message: 'You cannot view other admin/president profiles' } });
    }

    res.json({ success: true, data: targetUser });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch user' } });
  }
});

// Update user profile (admin)
usersRouter.put('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const parsed = adminProfileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { message: parsed.error.errors[0]?.message || 'Invalid user update payload' },
      });
    }

    const {
      name,
      bio,
      phone,
      course,
      branch,
      year,
      avatarUrl,
      githubUrl,
      linkedinUrl,
      twitterUrl,
      websiteUrl,
      password,
    } = parsed.data;

    const targetUser = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, role: true, email: true, phone: true, course: true, branch: true, year: true },
    });

    if (!targetUser) {
      return res.status(404).json({ success: false, error: { message: 'User not found' } });
    }

    if (targetUser.role === 'NETWORK') {
      return res.status(404).json({
        success: false,
        error: { message: 'Network profiles are managed in Network Management' },
      });
    }

    // Check permissions: Super admin can edit everyone, other admins cannot edit other admins
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    const isSuperAdmin = authUser.email === superAdminEmail;
    
    if ((targetUser.role === 'ADMIN' || targetUser.role === 'PRESIDENT') && !isSuperAdmin) {
      return res.status(403).json({ success: false, error: { message: 'You cannot edit other admin/president profiles' } });
    }

    // Prevent editing super admin unless you are super admin
    if (targetUser.email === superAdminEmail && !isSuperAdmin) {
      return res.status(403).json({ success: false, error: { message: 'Cannot modify super admin' } });
    }

    const nextPhone = normalizeOptionalText(phone === undefined ? targetUser.phone : phone);
    const nextCourse = normalizeOptionalText(course === undefined ? targetUser.course : course);
    const nextBranch = normalizeOptionalText(branch === undefined ? targetUser.branch : branch);
    const nextYear = normalizeOptionalText(year === undefined ? targetUser.year : year);
    const isProfileCompletion = Boolean(nextPhone && nextCourse && nextBranch && nextYear);

    let hashedPassword: string | undefined;
    if (password) {
        hashedPassword = await bcrypt.hash(password, 12);
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(bio !== undefined && { bio: normalizeOptionalText(bio) }),
        ...(avatarUrl !== undefined && { avatar: normalizeOptionalText(avatarUrl) }),
        ...(githubUrl !== undefined && { githubUrl: normalizeOptionalText(githubUrl) }),
        ...(linkedinUrl !== undefined && { linkedinUrl: normalizeOptionalText(linkedinUrl) }),
        ...(twitterUrl !== undefined && { twitterUrl: normalizeOptionalText(twitterUrl) }),
        ...(websiteUrl !== undefined && { websiteUrl: normalizeOptionalText(websiteUrl) }),
        ...(phone !== undefined && { phone: nextPhone }),
        ...(course !== undefined && { course: nextCourse }),
        ...(branch !== undefined && { branch: nextBranch }),
        ...(year !== undefined && { year: nextYear }),
        profileCompleted: isProfileCompletion,
        ...(hashedPassword && { password: hashedPassword }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        bio: true,
        phone: true,
        course: true,
        branch: true,
        year: true,
        profileCompleted: true,
        githubUrl: true,
        linkedinUrl: true,
        twitterUrl: true,
        websiteUrl: true,
      },
    });

    await auditLog(authUser.id, 'UPDATE', 'user', user.id, { updatedBy: 'admin' });
    
    // Emit socket event for real-time updates
    socketEvents.userUpdated(user.id);
    
    res.json({ success: true, data: user, message: 'User profile updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to update user profile' } });
  }
});

// Update user role — admin-deep-control:
//   - ADMIN can change USER/MEMBER/CORE_MEMBER only.
//   - PRESIDENT or superAdmin can change any role except the env-derived superAdmin account.
usersRouter.put('/:id/role', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    if (req.params.id === authUser.id) {
      return ApiResponse.forbidden(res, 'You cannot change your own role. Ask another administrator.');
    }

    const parsed = roleUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid role');
    }
    const { role: newRole } = parsed.data;

    const targetUser = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, role: true, email: true, name: true },
    });
    if (!targetUser) return ApiResponse.notFound(res, 'User not found');
    if (targetUser.role === 'NETWORK') {
      return ApiResponse.notFound(res, 'Network profiles are managed in Network Management');
    }

    const actorIsSuper = isSuperAdmin(authUser);
    const actorIsAdmin = authUser.role === 'ADMIN';
    const actorIsPresident = authUser.role === 'PRESIDENT';
    const targetIsSuper = isSuperAdmin(targetUser);

    // Nobody can touch the superAdmin account's role (it's env-derived anyway).
    if (targetIsSuper) {
      return ApiResponse.forbidden(res, 'The super admin role is determined by environment and cannot be changed here.');
    }

    // PRESIDENT and superAdmin can edit ADMIN/PRESIDENT accounts.
    // ADMIN can only edit users below ADMIN and can never assign privileged roles.
    if (!actorIsSuper && !actorIsPresident && !actorIsAdmin) {
      return ApiResponse.forbidden(res, 'Only ADMIN, PRESIDENT, or super admin can change roles.');
    }
    if (!actorIsSuper) {
      if (targetUser.role === 'ADMIN' || targetUser.role === 'PRESIDENT') {
        return ApiResponse.forbidden(res, 'Only president or super admin can edit ADMIN or PRESIDENT accounts.');
      }
      if (newRole === 'ADMIN' || newRole === 'PRESIDENT') {
        return ApiResponse.forbidden(res, 'Only president or super admin can promote to ADMIN or PRESIDENT.');
      }
    }

    if (targetUser.role === newRole) {
      return ApiResponse.success(res, { id: targetUser.id, name: targetUser.name, email: targetUser.email, role: targetUser.role }, 'No change');
    }

    const before = targetUser.role;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: newRole },
      select: { id: true, name: true, email: true, role: true },
    });

    await auditLog(authUser.id, 'UPDATE_ROLE', 'user', user.id, { before, after: newRole });
    socketEvents.userUpdated(user.id);
    return ApiResponse.success(res, user, 'User role updated successfully');
  } catch (error) {
    logger.error('Failed to update user role', { err: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to update user role');
  }
});

// Delete user — admin-deep-control:
//   default = soft delete (isDeleted=true, tokenVersion++, auto-block all features).
//             Permission: PRESIDENT or superAdmin (admin-only refused).
//   ?hard=true = HARD delete (DB row gone). Permission: superAdmin only.
//                Pre-flight: refuses with 409 if any Restrict-FK relations exist.
usersRouter.delete('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const hard = req.query.hard === 'true' || req.query.hard === '1';

    if (req.params.id === authUser.id) {
      return ApiResponse.badRequest(res, 'You cannot delete your own account from this surface.');
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, role: true, email: true, name: true, isDeleted: true },
    });

    if (!targetUser) return ApiResponse.notFound(res, 'User not found');
    if (targetUser.role === 'NETWORK') {
      return ApiResponse.notFound(res, 'Network profiles are managed in Network Management');
    }
    if (isSuperAdmin(targetUser)) {
      return ApiResponse.forbidden(res, 'Cannot delete super admin account');
    }

    const actorIsSuper = isSuperAdmin(authUser);
    const actorIsPresident = isPresidentOrSuperAdmin(authUser);

    if (hard) {
      if (!actorIsSuper) {
        return ApiResponse.forbidden(res, 'Only super admin can hard-delete users.');
      }
      // Pre-flight: count Restrict-FK relations that would block the delete.
      const [
        ledTeamsCount, announcementsCount, eventsCount, invitationsCount,
        pollsCount, problemsCount, ledTeamsSample,
      ] = await prisma.$transaction([
        prisma.eventTeam.count({ where: { leaderId: targetUser.id } }),
        prisma.announcement.count({ where: { createdBy: targetUser.id } }),
        prisma.event.count({ where: { createdBy: targetUser.id } }),
        prisma.eventInvitation.count({ where: { invitedById: targetUser.id } }),
        prisma.poll.count({ where: { createdBy: targetUser.id } }),
        prisma.problem.count({ where: { createdBy: targetUser.id } }),
        prisma.eventTeam.findMany({
          where: { leaderId: targetUser.id },
          select: { teamName: true, event: { select: { title: true } } },
          take: 3,
        }),
      ]);

      const blockers = {
        ledTeams: ledTeamsCount,
        announcements: announcementsCount,
        events: eventsCount,
        invitations: invitationsCount,
        polls: pollsCount,
        problems: problemsCount,
      };
      const total = Object.values(blockers).reduce((s, n) => s + n, 0);

      if (total > 0) {
        const teamNames = ledTeamsSample.map(t => `"${t.teamName}" (${t.event.title})`);
        return res.status(409).json({
          success: false,
          error: {
            message: 'Cannot hard-delete: this user owns records with Restrict FK relations. Reassign or delete those first.',
            code: 'HARD_DELETE_BLOCKED',
            blockers,
            sample: { ledTeams: teamNames },
          },
        });
      }

      // Write audit FIRST (entityId snapshot), THEN delete in the same transaction.
      await prisma.$transaction([
        prisma.auditLog.create({
          data: {
            userId: authUser.id,
            action: 'HARD_DELETE',
            entity: 'user',
            entityId: targetUser.id,
            metadata: { email: targetUser.email, role: targetUser.role, name: targetUser.name } as Prisma.InputJsonValue,
          },
        }),
        prisma.user.delete({ where: { id: targetUser.id } }),
      ]);

      void disconnectUserSockets(targetUser.id);
      socketEvents.userDeleted(targetUser.id);
      return ApiResponse.success(res, { id: targetUser.id }, 'User hard-deleted');
    }

    // ─── Soft delete path ────────────────────────────────────────────────
    // Design note (re: GDPR / right-to-be-forgotten):
    //   Soft-delete is reversible and intentionally preserves `email` /
    //   profile fields so the restore handler can bring the account back.
    //   For irreversible erasure (GDPR-style "forget me") use `?hard=true`
    //   on this same endpoint — that path purges the User row entirely and
    //   only the audit log retains an identifier snapshot for forensics.
    if (!actorIsPresident) {
      return ApiResponse.forbidden(res, 'Only PRESIDENT or super admin can delete users.');
    }
    if (!actorIsSuper && (targetUser.role === 'ADMIN' || targetUser.role === 'PRESIDENT')) {
      return ApiResponse.forbidden(res, 'Only super admin can delete ADMIN or PRESIDENT accounts.');
    }
    if (targetUser.isDeleted) {
      return ApiResponse.badRequest(res, 'User is already deleted. Use restore to undo.');
    }

    // Snapshot any manual blocks that exist BEFORE we overwrite them, so
    // restore can re-apply them if the admin wants to keep enforcement.
    const existingBlocks = await prisma.userBlock.findMany({
      where: { userId: targetUser.id },
      select: { feature: true, reason: true, expiresAt: true, blockedBy: true },
    });
    const manualSnapshot = existingBlocks
      .filter((b) => b.reason !== SOFT_DELETE_AUTO_REASON)
      .map((b) => ({ feature: b.feature, reason: b.reason, expiresAt: b.expiresAt, blockedBy: b.blockedBy }));

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetUser.id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: authUser.id,
          tokenVersion: { increment: 1 },
        },
      });
      // Auto-block every feature so any cached session can't act.
      // Always write the sentinel reason on `update` so restore can match
      // deterministically. Pre-existing manual block state is captured in the
      // audit-log metadata below for forensic reference.
      for (const feature of USER_BLOCK_FEATURES) {
        await tx.userBlock.upsert({
          where: { userId_feature: { userId: targetUser.id, feature: feature as UserBlockFeature } },
          create: {
            userId: targetUser.id,
            feature: feature as UserBlockFeature,
            blockedBy: authUser.id,
            reason: SOFT_DELETE_AUTO_REASON,
          },
          update: {
            blockedBy: authUser.id,
            blockedAt: new Date(),
            reason: SOFT_DELETE_AUTO_REASON,
            expiresAt: null,
          },
        });
      }
    });

    await auditLog(authUser.id, 'SOFT_DELETE', 'user', targetUser.id, {
      email: targetUser.email,
      role: targetUser.role,
      manualBlocksOverwritten: manualSnapshot,
    });
    void disconnectUserSockets(targetUser.id);
    socketEvents.userDeleted(targetUser.id);
    return ApiResponse.success(res, { id: targetUser.id, isDeleted: true }, 'User soft-deleted');
  } catch (error) {
    logger.error('Failed to delete user', { err: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to delete user');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// admin-deep-control: deep detail + admin power actions
// ═══════════════════════════════════════════════════════════════════════════

/** Shared guard: ADMIN can read, PRESIDENT/superAdmin can act. Refuses
 *  cross-PRESIDENT actions and self-actions. */
function gateAdminActionOnUser(
  authUser: { id: string; email: string; role: string },
  target: { id: string; email: string; role: string },
  opts: { requireMutate?: boolean } = {},
): { ok: true } | { ok: false; status: number; message: string } {
  if (authUser.id === target.id) {
    return { ok: false, status: 403, message: 'You cannot act on your own account from this surface.' };
  }
  if (isSuperAdmin(target) && !isSuperAdmin(authUser)) {
    return { ok: false, status: 403, message: 'Only super admin can act on the super admin account.' };
  }
  if (opts.requireMutate) {
    if (!isPresidentOrSuperAdmin(authUser)) {
      return { ok: false, status: 403, message: 'Only PRESIDENT or super admin can perform this action.' };
    }
    if (!isSuperAdmin(authUser) && (target.role === 'ADMIN' || target.role === 'PRESIDENT')) {
      return { ok: false, status: 403, message: 'Only super admin can act on ADMIN or PRESIDENT accounts.' };
    }
  }
  return { ok: true };
}

// GET /api/users/:id/full — deep detail aggregator (admin)
usersRouter.get('/:id/full', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const targetId = req.params.id;

    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true, name: true, email: true, role: true, avatar: true, bio: true,
        phone: true, course: true, branch: true, year: true, profileCompleted: true,
        oauthProvider: true, githubUrl: true, linkedinUrl: true, twitterUrl: true,
        websiteUrl: true, createdAt: true, updatedAt: true,
        lastLoginAt: true, lastLoginIp: true,
        currentStreak: true, longestStreak: true, longestStreakAt: true,
        isDeleted: true, deletedAt: true, deletedBy: true,
        tokenVersion: true,
        networkProfile: {
          select: {
            id: true, slug: true, fullName: true, designation: true, company: true,
            industry: true, status: true, isPublic: true, isFeatured: true,
            connectionType: true, createdAt: true, verifiedAt: true,
          },
        },
        hiringApplications: {
          select: { id: true, applyingRole: true, status: true, department: true, year: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        blocks: {
          select: { feature: true, blockedAt: true, blockedBy: true, reason: true, expiresAt: true },
          orderBy: { blockedAt: 'desc' },
        },
      },
    });

    if (!target) return ApiResponse.notFound(res, 'User not found');
    if (target.role === 'NETWORK') {
      return ApiResponse.notFound(res, 'Network profiles are managed in Network Management');
    }

    const gate = gateAdminActionOnUser(authUser, target);
    if (!gate.ok) return res.status(gate.status).json({ success: false, error: { message: gate.message } });

    // Hide IP from non-superAdmin viewers (PII discipline).
    if (!isSuperAdmin(authUser)) {
      (target as Record<string, unknown>).lastLoginIp = null;
    }

    // not N+1: single $transaction, all caps explicit
    const [
      eventRegistrations,
      certificates,
      qotdSubmissions,
      executionsCount,
      snippetsCount,
      playgroundUsage,
      quizParticipants,
      competitionSubsCount,
      pollVotesCount,
      pollFeedbackCount,
      createdPollsCount,
      auditCount,
      ledTeamsCount,
      teamMembershipsCount,
    ] = await prisma.$transaction([
      prisma.eventRegistration.findMany({
        where: { userId: targetId },
        select: {
          id: true, eventId: true, timestamp: true, attended: true, scannedAt: true,
          registrationType: true,
          event: { select: { id: true, title: true, slug: true, startDate: true, status: true } },
        },
        orderBy: { timestamp: 'desc' },
        take: 100,
      }),
      prisma.certificate.findMany({
        where: { recipientId: targetId },
        select: { id: true, certId: true, type: true, eventName: true, issuedAt: true, isRevoked: true, viewCount: true },
        orderBy: { issuedAt: 'desc' },
        take: 50,
      }),
      prisma.qOTDSubmission.findMany({
        where: { userId: targetId },
        select: { id: true, timestamp: true, qotd: { select: { id: true, date: true, difficulty: true, question: true } } },
        orderBy: { timestamp: 'desc' },
        take: 100,
      }),
      prisma.execution.count({ where: { userId: targetId } }),
      prisma.snippet.count({ where: { userId: targetId } }),
      prisma.playgroundDailyUsage.findMany({
        where: { userId: targetId },
        select: { usageDate: true, count: true },
        orderBy: { usageDate: 'desc' },
        take: 30,
      }),
      prisma.quizParticipant.findMany({
        where: { userId: targetId },
        select: {
          id: true, finalScore: true, finalRank: true, joinedAt: true,
          quiz: { select: { id: true, title: true, status: true } },
        },
        orderBy: { joinedAt: 'desc' },
        take: 50,
      }),
      prisma.competitionSubmission.count({ where: { userId: targetId } }),
      prisma.pollVote.count({ where: { userId: targetId } }),
      prisma.pollFeedback.count({ where: { userId: targetId } }),
      prisma.poll.count({ where: { createdBy: targetId } }),
      prisma.auditLog.count({ where: { OR: [{ userId: targetId }, { entityId: targetId, entity: { in: ['user', 'user_block'] } }] } }),
      prisma.eventTeam.count({ where: { leaderId: targetId } }),
      prisma.eventTeamMember.count({ where: { userId: targetId } }),
    ]);

    return ApiResponse.success(res, {
      user: target,
      counts: {
        eventRegistrations: eventRegistrations.length,
        certificates: certificates.length,
        qotdSubmissions: qotdSubmissions.length,
        executions: executionsCount,
        snippets: snippetsCount,
        quizParticipants: quizParticipants.length,
        competitionSubmissions: competitionSubsCount,
        pollVotes: pollVotesCount,
        pollFeedback: pollFeedbackCount,
        createdPolls: createdPollsCount,
        ledTeams: ledTeamsCount,
        teamMemberships: teamMembershipsCount,
        auditEntries: auditCount,
      },
      eventRegistrations,
      certificates,
      qotdSubmissions,
      playgroundUsage,
      quizParticipants,
    });
  } catch (error) {
    logger.error('Failed to fetch user full detail', { err: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to fetch user details');
  }
});

// GET /api/users/:id/audit — paginated audit feed (as actor + as target)
// Audit logs are restricted to PRESIDENT or superAdmin only — same gate as
// /api/audit-logs. Plain ADMIN must not see audit metadata for any user.
usersRouter.get('/:id/audit', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    if (!isPresidentOrSuperAdmin(authUser)) {
      return ApiResponse.forbidden(res, 'Only PRESIDENT or super admin can view audit logs.');
    }
    const targetId = req.params.id;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
    const as = req.query.as === 'target' ? 'target' : 'actor';
    const take = Math.min(100, Math.max(1, Number(req.query.take) || 50));

    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, role: true, email: true } });
    if (!target) return ApiResponse.notFound(res, 'User not found');
    const gate = gateAdminActionOnUser(authUser, target);
    if (!gate.ok) return res.status(gate.status).json({ success: false, error: { message: gate.message } });

    const where: Prisma.AuditLogWhereInput = as === 'target'
      ? { entityId: targetId, entity: { in: ['user', 'user_block'] } }
      : { userId: targetId };

    const entries = await prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, userId: true, action: true, entity: true, entityId: true, metadata: true, timestamp: true },
    });

    const hasMore = entries.length > take;
    const slice = hasMore ? entries.slice(0, take) : entries;
    return ApiResponse.success(res, {
      entries: slice,
      meta: { hasMore, nextCursor: hasMore ? slice[slice.length - 1]?.id ?? null : null, as },
    });
  } catch (error) {
    logger.error('Failed to fetch user audit', { err: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to fetch user audit');
  }
});

// GET /api/users/:id/activity — paginated mixed-source activity timeline
usersRouter.get('/:id/activity', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const targetId = req.params.id;
    const take = Math.min(100, Math.max(1, Number(req.query.take) || 50));

    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, role: true, email: true } });
    if (!target) return ApiResponse.notFound(res, 'User not found');
    const gate = gateAdminActionOnUser(authUser, target);
    if (!gate.ok) return res.status(gate.status).json({ success: false, error: { message: gate.message } });

    // Pull capped slices from each source; merge + sort by timestamp desc; trim to `take`.
    // not N+1: 5 batched queries in one $transaction, all bounded.
    const [registrations, qotdSubs, certs, quizParts, executions] = await prisma.$transaction([
      prisma.eventRegistration.findMany({
        where: { userId: targetId },
        select: { id: true, timestamp: true, event: { select: { id: true, title: true } }, registrationType: true },
        orderBy: { timestamp: 'desc' },
        take,
      }),
      prisma.qOTDSubmission.findMany({
        where: { userId: targetId },
        select: { id: true, timestamp: true, qotd: { select: { id: true, date: true, question: true } } },
        orderBy: { timestamp: 'desc' },
        take,
      }),
      prisma.certificate.findMany({
        where: { recipientId: targetId },
        select: { id: true, issuedAt: true, eventName: true, type: true, certId: true },
        orderBy: { issuedAt: 'desc' },
        take,
      }),
      prisma.quizParticipant.findMany({
        where: { userId: targetId },
        select: { id: true, joinedAt: true, finalScore: true, finalRank: true, quiz: { select: { id: true, title: true } } },
        orderBy: { joinedAt: 'desc' },
        take,
      }),
      prisma.execution.findMany({
        where: { userId: targetId },
        select: { id: true, executedAt: true, language: true, status: true },
        orderBy: { executedAt: 'desc' },
        take,
      }),
    ]);

    type Item = { kind: string; ts: Date; data: unknown };
    const items: Item[] = [
      ...registrations.map((r): Item => ({ kind: r.registrationType === 'GUEST' ? 'invitation_accepted' : 'event_registered', ts: r.timestamp, data: r })),
      ...qotdSubs.map((q): Item => ({ kind: 'qotd_submitted', ts: q.timestamp, data: q })),
      ...certs.map((c): Item => ({ kind: 'certificate_issued', ts: c.issuedAt, data: c })),
      ...quizParts.map((q): Item => ({ kind: 'quiz_joined', ts: q.joinedAt, data: q })),
      ...executions.map((e): Item => ({ kind: 'playground_run', ts: e.executedAt, data: e })),
    ];

    items.sort((a, b) => b.ts.getTime() - a.ts.getTime());
    return ApiResponse.success(res, { items: items.slice(0, take) });
  } catch (error) {
    logger.error('Failed to fetch user activity', { err: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to fetch user activity');
  }
});

// ─── Streak controls (PRESIDENT/superAdmin) ───────────────────────────────
usersRouter.post('/:id/streak/reset-current', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true, email: true, currentStreak: true } });
    if (!target) return ApiResponse.notFound(res, 'User not found');
    const gate = gateAdminActionOnUser(authUser, target, { requireMutate: true });
    if (!gate.ok) return res.status(gate.status).json({ success: false, error: { message: gate.message } });
    const before = target.currentStreak;
    await prisma.user.update({ where: { id: target.id }, data: { currentStreak: 0 } });
    await auditLog(authUser.id, 'RESET_STREAK_CURRENT', 'user', target.id, { before, after: 0 });
    socketEvents.userUpdated(target.id);
    return ApiResponse.success(res, { id: target.id, currentStreak: 0 }, 'Streak reset to 0');
  } catch (error) {
    logger.error('Failed to reset streak', { err: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to reset streak');
  }
});

usersRouter.post('/:id/streak/restore-longest', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, role: true, email: true, currentStreak: true, longestStreak: true },
    });
    if (!target) return ApiResponse.notFound(res, 'User not found');
    const gate = gateAdminActionOnUser(authUser, target, { requireMutate: true });
    if (!gate.ok) return res.status(gate.status).json({ success: false, error: { message: gate.message } });
    const before = target.currentStreak;
    const value = target.longestStreak;
    await prisma.user.update({
      where: { id: target.id },
      data: { currentStreak: value, longestStreakAt: new Date() },
    });
    await auditLog(authUser.id, 'RESTORE_STREAK_LONGEST', 'user', target.id, { before, after: value });
    socketEvents.userUpdated(target.id);
    return ApiResponse.success(res, { id: target.id, currentStreak: value }, 'Streak restored to longest value');
  } catch (error) {
    logger.error('Failed to restore streak', { err: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to restore streak');
  }
});

// ─── Blocks ───────────────────────────────────────────────────────────────
usersRouter.get('/:id/blocks', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true, email: true } });
    if (!target) return ApiResponse.notFound(res, 'User not found');
    const gate = gateAdminActionOnUser(authUser, target);
    if (!gate.ok) return res.status(gate.status).json({ success: false, error: { message: gate.message } });
    const blocks = await prisma.userBlock.findMany({
      where: { userId: target.id },
      orderBy: { blockedAt: 'desc' },
      select: { id: true, feature: true, blockedAt: true, blockedBy: true, reason: true, expiresAt: true },
    });
    return ApiResponse.success(res, blocks);
  } catch (error) {
    logger.error('Failed to list user blocks', { err: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to list user blocks');
  }
});

const createBlockSchema = z.object({
  feature: z.enum(USER_BLOCK_FEATURES),
  reason: z.string().trim().min(1, 'Reason cannot be empty').max(2000).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

usersRouter.post('/:id/blocks', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const parsed = createBlockSchema.safeParse(req.body);
    if (!parsed.success) return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid block payload');
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true, email: true } });
    if (!target) return ApiResponse.notFound(res, 'User not found');
    const gate = gateAdminActionOnUser(authUser, target, { requireMutate: true });
    if (!gate.ok) return res.status(gate.status).json({ success: false, error: { message: gate.message } });

    const block = await prisma.userBlock.upsert({
      where: { userId_feature: { userId: target.id, feature: parsed.data.feature as UserBlockFeature } },
      create: {
        userId: target.id,
        feature: parsed.data.feature as UserBlockFeature,
        blockedBy: authUser.id,
        reason: parsed.data.reason ?? null,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      },
      update: {
        blockedBy: authUser.id,
        blockedAt: new Date(),
        reason: parsed.data.reason ?? null,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      },
    });
    await auditLog(authUser.id, 'BLOCK_USER', 'user_block', block.id, {
      userId: target.id, feature: parsed.data.feature, reason: parsed.data.reason ?? null, expiresAt: parsed.data.expiresAt ?? null,
    });
    socketEvents.userUpdated(target.id);
    return ApiResponse.success(res, block, 'Block applied');
  } catch (error) {
    logger.error('Failed to block user', { err: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to block user');
  }
});

usersRouter.delete('/:id/blocks/:feature', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const feature = String(req.params.feature || '').toUpperCase();
    if (!(USER_BLOCK_FEATURES as readonly string[]).includes(feature)) {
      return ApiResponse.badRequest(res, 'Unknown block feature');
    }
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true, email: true } });
    if (!target) return ApiResponse.notFound(res, 'User not found');
    const gate = gateAdminActionOnUser(authUser, target, { requireMutate: true });
    if (!gate.ok) return res.status(gate.status).json({ success: false, error: { message: gate.message } });

    // deleteMany so we never error when no row exists; idempotent.
    const result = await prisma.userBlock.deleteMany({
      where: { userId: target.id, feature: feature as UserBlockFeature },
    });
    await auditLog(authUser.id, 'UNBLOCK_USER', 'user_block', target.id, { feature, removed: result.count });
    socketEvents.userUpdated(target.id);
    return ApiResponse.success(res, { removed: result.count }, 'Block removed');
  } catch (error) {
    logger.error('Failed to unblock user', { err: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to unblock user');
  }
});

// ─── Force logout ────────────────────────────────────────────────────────
usersRouter.post('/:id/force-logout', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, role: true, email: true, tokenVersion: true },
    });
    if (!target) return ApiResponse.notFound(res, 'User not found');
    const gate = gateAdminActionOnUser(authUser, target, { requireMutate: true });
    if (!gate.ok) return res.status(gate.status).json({ success: false, error: { message: gate.message } });

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { tokenVersion: { increment: 1 } },
      select: { id: true, tokenVersion: true },
    });
    await auditLog(authUser.id, 'FORCE_LOGOUT', 'user', target.id, { newTokenVersion: updated.tokenVersion });
    // Sweep already-open socket sessions. Without this, the bumped tokenVersion
    // only blocks NEW handshakes — existing connections stay alive until the
    // user disconnects on their own.
    void disconnectUserSockets(target.id);
    socketEvents.userUpdated(target.id);
    return ApiResponse.success(res, updated, 'All sessions revoked');
  } catch (error) {
    logger.error('Failed to force logout', { err: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to force logout');
  }
});

// ─── Password reset (admin-initiated) ────────────────────────────────────
const PASSWORD_RESET_TTL_MIN = 30;

usersRouter.post('/:id/password-reset', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, role: true, email: true, name: true },
    });
    if (!target) return ApiResponse.notFound(res, 'User not found');
    const gate = gateAdminActionOnUser(authUser, target, { requireMutate: true });
    if (!gate.ok) return res.status(gate.status).json({ success: false, error: { message: gate.message } });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashed = hashPasswordResetToken(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MIN * 60 * 1000);

    await prisma.user.update({
      where: { id: target.id },
      data: { passwordResetToken: hashed, passwordResetExpiresAt: expiresAt },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const url = `${frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(target.email)}`;
    emailService.sendPasswordReset(target.email, target.name, url, PASSWORD_RESET_TTL_MIN, authUser.name).catch((err) => {
      logger.warn('Failed to send password-reset email', { userId: target.id, err: err instanceof Error ? err.message : String(err) });
    });

    await auditLog(authUser.id, 'PASSWORD_RESET_INITIATED', 'user', target.id, { ttlMinutes: PASSWORD_RESET_TTL_MIN });
    return ApiResponse.success(res, { sent: true, expiresAt }, 'Password-reset email sent');
  } catch (error) {
    logger.error('Failed to initiate password reset', { err: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to initiate password reset');
  }
});

// ─── Restore (un-soft-delete) ─────────────────────────────────────────────
usersRouter.post('/:id/restore', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    if (!isSuperAdmin(authUser)) {
      return ApiResponse.forbidden(res, 'Only super admin can restore deleted users.');
    }
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, role: true, email: true, isDeleted: true },
    });
    if (!target) return ApiResponse.notFound(res, 'User not found');
    if (!target.isDeleted) return ApiResponse.badRequest(res, 'User is not deleted');

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: { isDeleted: false, deletedAt: null, deletedBy: null },
      });
      // Remove the auto-blocks created on soft-delete. The sentinel reason is
      // always written by the soft-delete handler (both branches of upsert),
      // so this filter is deterministic. Pre-existing manual blocks were
      // captured in the SOFT_DELETE audit log entry — to keep them, the admin
      // can re-issue them after restore.
      await tx.userBlock.deleteMany({
        where: { userId: target.id, reason: SOFT_DELETE_AUTO_REASON },
      });
    });

    await auditLog(authUser.id, 'RESTORE_USER', 'user', target.id);
    socketEvents.userUpdated(target.id);
    return ApiResponse.success(res, { id: target.id, isDeleted: false }, 'User restored');
  } catch (error) {
    logger.error('Failed to restore user', { err: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to restore user');
  }
});
