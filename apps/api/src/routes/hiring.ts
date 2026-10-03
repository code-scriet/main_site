import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser, optionalAuthMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import { ApiResponse } from '../utils/response.js';
import { zodFieldErrors } from '../utils/zodErrors.js';
import { emailService, markdownToEmailHtml, htmlToPlainText } from '../utils/email.js';
import { logger } from '../utils/logger.js';
import { parsePaginationNumber, getQueryString } from '../utils/pagination.js';
import { requireUuid } from '../utils/idParams.js';
import { getClientIp } from '../utils/clientIp.js';
import { sanitizeText, sanitizeMarkdown } from '../utils/sanitize.js';
import { broadcastNotification } from '../utils/notifications.js';
import { socketEvents } from '../utils/socket.js';
import { getCachedSettings } from '../utils/settingsCache.js';
import { isValidTransition } from '../utils/interviewSlots.js';
import { issueSlotToken, revokeSlotToken } from '../utils/interviewSlotToken.js';
import { buildSlotMagicLink, formatDeadlineIST, notifyInterviewScheduledBell, sendSlotPickEmail } from '../utils/interviewEmail.js';

export const hiringRouter = Router();

// S10: /apply is public (optional auth) and previously rode only the general
// 500/15min limiter — spam could exhaust the unique-email namespace. Teams-join
// pattern: 15/15min per IP is generous for a form humans submit once.
const applyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { success: false, error: { message: 'Too many applications from this network. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
});

const applyingRoles = ['TECHNICAL', 'DSA_CHAMPS', 'DESIGNING', 'SOCIAL_MEDIA', 'MANAGEMENT'] as const;
const applicationStatuses = [
  'PENDING',
  'INTERVIEW_SCHEDULED',
  'SLOT_BOOKED',
  'INTERVIEWED',
  'SELECTED',
  'REJECTED',
] as const;

const DEFAULT_HIRING_CYCLE = '2026';

/** A11: the current hiring season label stamped onto new applications. Reads
 * Settings.hiringCycle (5-min cached); falls back to the default on any miss. */
async function getCurrentHiringCycle(): Promise<string> {
  try {
    const settings = await getCachedSettings();
    const cycle = (settings as { hiringCycle?: string } | null)?.hiringCycle?.trim();
    return cycle || DEFAULT_HIRING_CYCLE;
  } catch {
    return DEFAULT_HIRING_CYCLE;
  }
}

/** Optional long-answer field → trimmed string or null (empty collapses to null). */
const optionalEssay = z
  .string()
  .max(4000, 'Answer is too long')
  .optional()
  .nullable()
  .transform((v) => {
    const t = (v ?? '').trim();
    return t ? sanitizeText(t) : null;
  });

/**
 * Optional CV / résumé link. Accepts any http(s) URL; canonicalises Google Drive
 * file links to their shareable `/file/d/<id>/view` form so an admin (or the
 * candidate) can open them. The candidate is responsible for setting Drive
 * sharing to "anyone with the link" — we surface that hint in the UI.
 */
function canonicalizeDriveLink(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'drive.google.com' || host === 'docs.google.com') {
      const fileMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
      if (fileMatch) return `https://drive.google.com/file/d/${fileMatch[1]}/view`;
      const idParam = parsed.searchParams.get('id');
      if (idParam && (parsed.pathname === '/open' || parsed.pathname === '/uc')) {
        return `https://drive.google.com/file/d/${idParam}/view`;
      }
    }
  } catch {
    /* not a URL we can canonicalise — return as-is */
  }
  return url;
}

const cvLinkSchema = z
  .union([
    z.null(),
    z.literal(''),
    z.string().trim().url('CV link must be a valid URL (https://…)').max(2048, 'Link is too long'),
  ])
  .optional()
  .transform((v) => (v ? canonicalizeDriveLink(v) : null));

const hiringApplicationSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address').transform((value) => value.trim().toLowerCase()),
  phone: z.string().optional(),
  department: z.string().min(2, 'Department is required'),
  year: z.string().min(1, 'Year is required'),
  skills: z.string().optional(),
  applyingRole: z.enum(applyingRoles, {
    errorMap: () => ({ message: 'Please select a valid role' }),
  }),
  // Optional enhanced fields — never block a submission on these.
  cvLink: cvLinkSchema,
  whyJoin: optionalEssay,
  teamQuestion1: optionalEssay,
  teamQuestion2: optionalEssay,
});

const updateMyApplicationSchema = z
  .object({
    phone: z.string().trim().max(20).optional().nullable(),
    department: z.string().trim().min(2, 'Department is required').optional(),
    year: z.string().trim().min(1, 'Year is required').optional(),
    skills: z.string().trim().max(2000).optional().nullable(),
    cvLink: cvLinkSchema,
    whyJoin: optionalEssay,
    teamQuestion1: optionalEssay,
    teamQuestion2: optionalEssay,
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

const updateStatusSchema = z.object({
  status: z.enum(applicationStatuses),
});

const sendHiringStatusEmailAsync = (
  status: 'SELECTED' | 'REJECTED',
  payload: { email: string; name: string; applyingRole: (typeof applyingRoles)[number] }
) => {
  const promise = status === 'SELECTED'
    ? emailService.sendHiringSelected(payload.email, payload.name, payload.applyingRole)
    : emailService.sendHiringRejected(payload.email, payload.name, payload.applyingRole);

  promise
    .then(() => {
      logger.info('Hiring status email sent', { email: payload.email, status });
    })
    .catch((error) => {
      logger.error('Failed to send hiring status email', {
        email: payload.email,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
    });
};

// Submit a new hiring application (public or authenticated)
hiringRouter.post('/apply', applyRateLimiter, optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const validation = hiringApplicationSchema.safeParse(req.body);
    if (!validation.success) {
      return ApiResponse.validationError(res, zodFieldErrors(validation.error));
    }

    const { name, email, phone, department, year, skills, applyingRole, cvLink, whyJoin, teamQuestion1, teamQuestion2 } =
      validation.data;

    // A11: applications are scoped to the current hiring cycle. Read it once
    // from Settings (default '2026' when unset) — bumping it re-opens hiring
    // so previous applicants can apply again.
    const cycle = await getCurrentHiringCycle();

    // Check if an application already exists FOR THIS CYCLE.
    const existingApplication = await prisma.hiringApplication.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        cycle,
      },
    });

    if (existingApplication) {
      return ApiResponse.conflict(res, `You already applied in the ${cycle} hiring cycle.`);
    }

    // Get user ID if authenticated
    let userId: string | null = null;
    try {
      const authUser = getAuthUser(req);
      userId = authUser?.id || null;
    } catch {
      // Not authenticated, that's fine
    }

    // Create the application
    const application = await prisma.hiringApplication.create({
      data: {
        name,
        email,
        phone,
        department,
        year,
        skills,
        applyingRole,
        cycle,
        userId,
        cvLink,
        whyJoin,
        teamQuestion1,
        teamQuestion2,
      },
    });

    // Send confirmation email asynchronously so application creation never fails due to email provider issues.
    emailService.sendHiringApplication(email, name, applyingRole).catch((error) => {
      logger.error('Failed to send hiring application email', {
        email,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Log the application
    if (userId) {
      await auditLog(userId, 'HIRING_APPLICATION_SUBMITTED', 'HiringApplication', application.id, {
        email,
        applyingRole,
      });
    }
    socketEvents.liveInvalidate('hiring');

    return ApiResponse.created(res, {
      message: 'Application submitted successfully! You will receive login credentials at your email.',
      application: {
        id: application.id,
        email: application.email,
        applyingRole: application.applyingRole,
        status: application.status,
      },
    });
  } catch (error) {
    logger.error('Hiring application error:', { error: error instanceof Error ? error.message : String(error) });

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // Lost the race to a concurrent submit for the same (email, cycle).
      return ApiResponse.conflict(res, 'You have already applied in the current hiring cycle.');
    }

    // Helpful error when backend enum is outdated (migration not applied)
    if (
      error instanceof Error &&
      (error.message.includes('ApplyingRole') || error.message.includes('invalid input value for enum'))
    ) {
      return ApiResponse.badRequest(
        res,
        'Hiring roles are out of date on server. Please run the latest database migrations and try again.'
      );
    }

    return ApiResponse.internal(res, 'Failed to submit application');
  }
});

// Get all applications (Admin only)
hiringRouter.get('/applications', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const page = parsePaginationNumber(req.query.page, 1, { min: 1, max: 1000000 });
    const limit = parsePaginationNumber(req.query.limit, 20, { min: 1, max: 100 });
    const status = getQueryString(req.query.status);
    const role = getQueryString(req.query.role);
    const search = getQueryString(req.query.search);
    const cycle = typeof req.query.cycle === 'string' ? req.query.cycle.trim() : '';

    if (page === null) {
      return ApiResponse.badRequest(res, 'page must be a positive integer');
    }

    if (limit === null) {
      return ApiResponse.badRequest(res, 'limit must be an integer between 1 and 100');
    }

    const where: any = {};

    if (status && !applicationStatuses.includes(status as (typeof applicationStatuses)[number])) {
      return ApiResponse.badRequest(res, 'Invalid status filter');
    }

    if (role && !applyingRoles.includes(role as (typeof applyingRoles)[number])) {
      return ApiResponse.badRequest(res, 'Invalid role filter');
    }
    
    if (status && applicationStatuses.includes(status as any)) {
      where.status = status;
    }
    
    if (role && applyingRoles.includes(role as any)) {
      where.applyingRole = role;
    }

    // A11: optional cycle filter so admins can view a single season's applicants.
    if (cycle) {
      where.cycle = cycle;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [applications, total] = await Promise.all([
      prisma.hiringApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, email: true, avatar: true },
          },
        },
      }),
      prisma.hiringApplication.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return ApiResponse.paginated(res, applications, {
      total,
      page,
      limit,
      totalPages,
    });
  } catch (error) {
    logger.error('Get applications error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to fetch applications');
  }
});

// Distinct hiring cycles + the current one (Admin only) — powers the cycle
// filter dropdown on the applications board. Cheap: one grouped read.
hiringRouter.get('/cycles', authMiddleware, requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const [rows, current] = await Promise.all([
      prisma.hiringApplication.groupBy({ by: ['cycle'], _count: { _all: true } }),
      getCurrentHiringCycle(),
    ]);
    const cycles = rows
      .map((row) => ({ cycle: row.cycle, count: row._count._all }))
      .sort((a, b) => b.cycle.localeCompare(a.cycle));
    return ApiResponse.success(res, { cycles, current });
  } catch (error) {
    logger.error('Get hiring cycles error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to fetch hiring cycles');
  }
});

// Get application by ID (Admin only)
hiringRouter.get('/applications/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!requireUuid(res, id, 'application ID')) {
      return;
    }

    const application = await prisma.hiringApplication.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar: true, role: true },
        },
      },
    });

    if (!application) {
      return ApiResponse.notFound(res, 'Application not found');
    }

    return ApiResponse.success(res, application);
  } catch (error) {
    logger.error('Get application error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to fetch application');
  }
});

// Update application status (Admin only) — enforces the §3 interview transition table.
hiringRouter.patch('/applications/:id/status', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!requireUuid(res, id, 'application ID')) {
      return;
    }
    const authUser = getAuthUser(req);

    const validation = updateStatusSchema.safeParse(req.body);
    if (!validation.success) {
      return ApiResponse.validationError(res, zodFieldErrors(validation.error));
    }

    const { status } = validation.data;

    // Get application before update to check previous status
    const existingApplication = await prisma.hiringApplication.findUnique({
      where: { id },
    });

    if (!existingApplication) {
      return ApiResponse.notFound(res, 'Application not found');
    }

    const from = existingApplication.status as string;
    const resend = (req.query as Record<string, unknown>).resend === 'true';

    // Same-status → 200 no-op unless ?resend=true (regenerate token + re-send pick email).
    if (from === status) {
      if (resend && status === 'INTERVIEW_SCHEDULED') {
        const rawToken = await issueSlotToken(id);
        const magicLink = buildSlotMagicLink(rawToken);
        const deadlineIST = formatDeadlineIST(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
        sendSlotPickEmail({
          to: existingApplication.email,
          name: existingApplication.name,
          role: existingApplication.applyingRole,
          magicLink,
          deadlineIST,
        }).catch((err) => {
          logger.error('Failed to re-send slot pick email', {
            applicationId: id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
        if (authUser) {
          await auditLog(authUser.id, 'HIRING_STATUS_UPDATED', 'HiringApplication', id, {
            previousStatus: from,
            newStatus: status,
            emailSent: true,
            resent: true,
          });
        }
        return ApiResponse.success(res, {
          message: 'Application status updated',
          application: existingApplication,
          emailSent: true,
        });
      }
      return ApiResponse.success(res, {
        message: 'Application status updated',
        application: existingApplication,
        emailSent: false,
      });
    }

    if (!isValidTransition(from, status)) {
      return ApiResponse.badRequest(res, `Invalid status transition from ${from} to ${status}`);
    }

    // Release a booking seat first when leaving SLOT_BOOKED for
    // INTERVIEW_SCHEDULED (admin cancel) or REJECTED, and defensively when
    // leaving INTERVIEW_SCHEDULED for REJECTED (no booking is expected there).
    const releasesSeat =
      (from === 'SLOT_BOOKED' && (status === 'INTERVIEW_SCHEDULED' || status === 'REJECTED')) ||
      (from === 'INTERVIEW_SCHEDULED' && status === 'REJECTED');
    if (releasesSeat) {
      const booking = (await prisma.interviewSlotBooking.findUnique({
        where: { applicationId: id },
      })) as unknown as { id: string; slotId: string } | null;
      if (booking) {
        await prisma.interviewSlotBooking.delete({ where: { id: booking.id } }).catch(() => undefined);
        await prisma.interviewSlot
          .update({ where: { id: booking.slotId }, data: { bookedCount: { decrement: 1 } } })
          .catch(() => undefined);
      }
    }

    const application = await prisma.hiringApplication.update({
      where: { id },
      data: { status },
    });

    let emailSent = false;

    // Entering INTERVIEW_SCHEDULED from any other status (PENDING, SLOT_BOOKED
    // cancel, or a REJECTED/SELECTED reversal): mint a fresh pick token + send
    // the pick email + bell, so the candidate can pick a slot.
    if (status === 'INTERVIEW_SCHEDULED' && from !== 'INTERVIEW_SCHEDULED') {
      const rawToken = await issueSlotToken(id);
      const magicLink = buildSlotMagicLink(rawToken);
      const deadlineIST = formatDeadlineIST(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
      sendSlotPickEmail({
        to: application.email,
        name: application.name,
        role: application.applyingRole,
        magicLink,
        deadlineIST,
      }).catch((err) => {
        logger.error('Failed to send slot pick email', {
          applicationId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
      // In-app bell for linked accounts — fire-and-forget, never breaks the request.
      notifyInterviewScheduledBell({
        userId: (application as { userId?: string | null }).userId ?? null,
        deadlineIST,
        applicationId: id,
      });
      emailSent = true;
    }

    // Token revoke on every REJECT.
    if (status === 'REJECTED') {
      await revokeSlotToken(id);
    }

    // Send notification email in background if status changed to SELECTED or REJECTED.
    if (status === 'SELECTED') {
      sendHiringStatusEmailAsync('SELECTED', {
        email: application.email,
        name: application.name,
        applyingRole: application.applyingRole,
      });
      emailSent = true;
    } else if (status === 'REJECTED') {
      sendHiringStatusEmailAsync('REJECTED', {
        email: application.email,
        name: application.name,
        applyingRole: application.applyingRole,
      });
      emailSent = true;
    }

    if (authUser) {
      await auditLog(authUser.id, 'HIRING_STATUS_UPDATED', 'HiringApplication', id, {
        previousStatus: from,
        newStatus: status,
        emailSent,
      });
    }
    socketEvents.liveInvalidate('hiring');

    return ApiResponse.success(res, {
      message: 'Application status updated',
      application,
      emailSent,
    });
  } catch (error) {
    logger.error('Update application status error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to update application status');
  }
});

// Delete application (Admin only)
hiringRouter.delete('/applications/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!requireUuid(res, id, 'application ID')) {
      return;
    }
    const authUser = getAuthUser(req);

    await prisma.hiringApplication.delete({
      where: { id },
    });

    if (authUser) {
      await auditLog(authUser.id, 'HIRING_APPLICATION_DELETED', 'HiringApplication', id);
    }

    return ApiResponse.success(res, { message: 'Application deleted successfully' });
  } catch (error) {
    logger.error('Delete application error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to delete application');
  }
});

// Get current user's application (full record — powers the dashboard "My
// Application" tab, which both displays and lets the candidate edit it).
async function findOwnApplication(authUser: { id: string; email: string }) {
  return prisma.hiringApplication.findFirst({
    where: {
      OR: [
        { userId: authUser.id },
        { email: { equals: authUser.email, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
}

// Candidate-editable window: while the application is PENDING. Once an admin
// moves it into the interview pipeline (INTERVIEW_SCHEDULED) the answers lock —
// at that point the candidate's job is to pick a slot, not edit the form.
const EDITABLE_STATUSES = ['PENDING'] as const;

hiringRouter.get('/my-application', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return ApiResponse.unauthorized(res);
    }

    const application = await findOwnApplication(authUser);

    if (!application) {
      return ApiResponse.success(res, { hasApplication: false, hasApplied: false });
    }

    return ApiResponse.success(res, {
      hasApplication: true,
      hasApplied: true,
      editable: (EDITABLE_STATUSES as readonly string[]).includes(application.status),
      application: {
        id: application.id,
        name: application.name,
        email: application.email,
        phone: application.phone,
        department: application.department,
        year: application.year,
        skills: application.skills,
        applyingRole: application.applyingRole,
        status: application.status,
        cycle: application.cycle,
        cvLink: application.cvLink,
        whyJoin: application.whyJoin,
        teamQuestion1: application.teamQuestion1,
        teamQuestion2: application.teamQuestion2,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Get my application error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to fetch application');
  }
});

// Edit own application (candidate, authenticated) — only while PENDING.
hiringRouter.patch('/my-application', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) {
      return ApiResponse.unauthorized(res);
    }

    const validation = updateMyApplicationSchema.safeParse(req.body);
    if (!validation.success) {
      return ApiResponse.validationError(res, zodFieldErrors(validation.error));
    }

    const application = await findOwnApplication(authUser);
    if (!application) {
      return ApiResponse.notFound(res, 'You have not applied yet.');
    }

    if (!(EDITABLE_STATUSES as readonly string[]).includes(application.status)) {
      return ApiResponse.badRequest(
        res,
        'Your application can no longer be edited now that the interview is scheduled. Contact the hiring team for changes.',
      );
    }

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(validation.data)) {
      if (value !== undefined) patch[key] = value;
    }

    const updated = await prisma.hiringApplication.update({
      where: { id: application.id },
      data: patch,
    });

    await auditLog(authUser.id, 'HIRING_APPLICATION_UPDATED', 'HiringApplication', application.id, {
      fields: Object.keys(patch),
    });
    socketEvents.liveInvalidate('hiring');

    return ApiResponse.success(res, {
      message: 'Application updated',
      application: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        department: updated.department,
        year: updated.year,
        skills: updated.skills,
        applyingRole: updated.applyingRole,
        status: updated.status,
        cycle: updated.cycle,
        cvLink: updated.cvLink,
        whyJoin: updated.whyJoin,
        teamQuestion1: updated.teamQuestion1,
        teamQuestion2: updated.teamQuestion2,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Update my application error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to update application');
  }
});

// Messages the hiring team sent to the candidate (candidate, authenticated) —
// surfaced in the "My Club Application" dashboard tab.
hiringRouter.get('/my-application/messages', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return ApiResponse.unauthorized(res);

    const application = await findOwnApplication(authUser);
    if (!application) {
      return ApiResponse.success(res, { messages: [] });
    }

    const messages = await prisma.hiringMessage.findMany({
      where: { applicationId: application.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        subject: true,
        body: true,
        emailSent: true,
        bellSent: true,
        createdAt: true,
      },
    });

    return ApiResponse.success(res, { messages });
  } catch (error) {
    logger.error('Get my application messages error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to fetch messages');
  }
});

// Get hiring statistics (Admin only)
hiringRouter.get('/stats', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const [total, byStatus, byRole] = await Promise.all([
      prisma.hiringApplication.count(),
      prisma.hiringApplication.groupBy({
        by: ['status'],
        _count: true,
      }),
      prisma.hiringApplication.groupBy({
        by: ['applyingRole'],
        _count: true,
      }),
    ]);

    return ApiResponse.success(res, {
      total,
      byStatus: byStatus.reduce((acc: Record<string, number>, item: any) => {
        acc[item.status] = item._count;
        return acc;
      }, {} as Record<string, number>),
      byRole: byRole.reduce((acc: Record<string, number>, item: any) => {
        acc[item.applyingRole] = item._count;
        return acc;
      }, {} as Record<string, number>),
    });
  } catch (error) {
    logger.error('Get hiring stats error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to fetch hiring statistics');
  }
});

// Export applications to Excel (Admin only)
hiringRouter.get('/export', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { status, role } = req.query;

    if (typeof status === 'string' && !applicationStatuses.includes(status as (typeof applicationStatuses)[number])) {
      return ApiResponse.badRequest(res, 'Invalid status filter');
    }

    if (typeof role === 'string' && !applyingRoles.includes(role as (typeof applyingRoles)[number])) {
      return ApiResponse.badRequest(res, 'Invalid role filter');
    }

    // Build filter conditions
    const where: any = {};
    if (status && typeof status === 'string') {
      where.status = status;
    }
    if (role && typeof role === 'string') {
      where.applyingRole = role;
    }

    // Fetch applications
    const applications = await prisma.hiringApplication.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    // Build workbook with exceljs (safer than xlsx package)
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.default.Workbook();
    workbook.creator = 'code.scriet';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Applications');
    worksheet.columns = [
      { header: 'Application ID', key: 'applicationId', width: 40 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Email', key: 'email', width: 34 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Year', key: 'year', width: 12 },
      { header: 'Skills', key: 'skills', width: 42 },
      { header: 'CV / Resume Link', key: 'cvLink', width: 48 },
      { header: 'Why Join', key: 'whyJoin', width: 48 },
      { header: 'Team Q1', key: 'teamQuestion1', width: 42 },
      { header: 'Team Q2', key: 'teamQuestion2', width: 42 },
      { header: 'Applying Role', key: 'applyingRole', width: 18 },
      { header: 'Status', key: 'status', width: 22 },
      { header: 'Applied On', key: 'appliedOn', width: 28 },
      { header: 'User Account', key: 'userAccount', width: 14 },
    ];

    applications.forEach((app) => {
      worksheet.addRow({
        applicationId: app.id,
        name: app.name,
        email: app.email,
        phone: app.phone || 'Not provided',
        department: app.department,
        year: app.year,
        skills: app.skills || 'Not provided',
        cvLink: app.cvLink || '',
        whyJoin: app.whyJoin || '',
        teamQuestion1: app.teamQuestion1 || '',
        teamQuestion2: app.teamQuestion2 || '',
        applyingRole: app.applyingRole,
        status: app.status,
        appliedOn: new Date(app.createdAt).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        userAccount: app.user ? 'Yes' : 'No',
      });
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD97706' },
    };

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

    const summary = workbook.addWorksheet('Summary');
    summary.addRow(['Generated At', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })]);
    summary.addRow(['Total Applications', applications.length]);
    summary.addRow(['Status Filter', typeof status === 'string' ? status : 'All']);
    summary.addRow(['Role Filter', typeof role === 'string' ? role : 'All']);
    summary.getColumn(1).width = 20;
    summary.getColumn(2).width = 30;
    summary.getColumn(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();

    // Generate filename with filters
    let filename = 'hiring_applications';
    if (role && typeof role === 'string') filename += `_${role.toLowerCase()}`;
    if (status && typeof status === 'string') filename += `_${status.toLowerCase()}`;
    filename += `_${new Date().toISOString().split('T')[0]}.xlsx`;

    // Set headers and send file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));

    // Log audit
    const user = getAuthUser(req);
    if (user) {
      await auditLog(user.id, 'EXPORT', 'hiring_applications', 'bulk', {
        filters: { status, role },
        count: applications.length,
      });
    }

    return;
  } catch (error) {
    logger.error('Export applications error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to export applications');
  }
});

// ─── Hiring communication: direct messages from the hiring team ───────────────
const hiringMessageSchema = z
  .object({
    applicationIds: z.array(z.string().uuid('Invalid application id')).min(1, 'Select at least one applicant').max(100),
    subject: z.string().trim().min(1, 'Subject is required').max(200, 'Subject is too long'),
    body: z.string().trim().min(1, 'Message cannot be empty').max(5000, 'Message is too long'),
    email: z.boolean().optional().default(true),
    bell: z.boolean().optional().default(true),
  })
  .refine((data) => data.email || data.bell, { message: 'Choose at least one delivery channel (email or in-app)' });

// Send a message to one or more selected applicants (Admin only).
hiringRouter.post('/message', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return ApiResponse.unauthorized(res);

    const validation = hiringMessageSchema.safeParse(req.body);
    if (!validation.success) {
      return ApiResponse.validationError(res, zodFieldErrors(validation.error));
    }
    const { applicationIds, email, bell } = validation.data;
    const subject = sanitizeText(validation.data.subject);
    // Body supports Markdown + a safe HTML subset: stored server-side sanitized
    // (allowlist) and re-sanitized client-side (DOMPurify) on render.
    const body = sanitizeMarkdown(validation.data.body);

    const apps = (await prisma.hiringApplication.findMany({
      where: { id: { in: applicationIds } },
    })) as unknown as Array<{ id: string; email: string; name: string; userId: string | null }>;
    if (apps.length === 0) {
      return ApiResponse.notFound(res, 'No matching applications found');
    }
    const byId = new Map(apps.map((a) => [a.id, a]));

    let emailed = 0;
    let belled = 0;
    for (const id of applicationIds) {
      const app = byId.get(id);
      if (!app) continue;

      let emailSent = false;
      let bellSent = false;

      if (email && app.email) {
        try {
          const emailHtml = markdownToEmailHtml(body);
          emailSent = await emailService.send({
            to: app.email,
            subject,
            html: emailHtml,
            text: htmlToPlainText(emailHtml),
            category: 'recruitment',
          });
        } catch (err) {
          logger.error('Hiring message email failed', { applicationId: id, error: err instanceof Error ? err.message : String(err) });
        }
      }

      if (bell && app.userId) {
        try {
          const created = await broadcastNotification({
            source: 'SYSTEM',
            audience: 'CUSTOM',
            audienceUserIds: [app.userId],
            category: 'hiring',
            icon: 'mail',
            title: subject,
            body,
            link: '/dashboard/application',
            refEntity: 'hiring-application',
            refEntityId: app.id,
            createdById: authUser.id,
          });
          bellSent = Boolean(created);
        } catch (err) {
          logger.error('Hiring message bell failed', { applicationId: id, error: err instanceof Error ? err.message : String(err) });
        }
      }

      await prisma.hiringMessage.create({
        data: { applicationId: app.id, subject, body, emailSent, bellSent, createdById: authUser.id },
      });

      if (emailSent) emailed += 1;
      if (bellSent) belled += 1;
    }

    await auditLog(authUser.id, 'HIRING_MESSAGE_SENT', 'HiringApplication', 'bulk', {
      recipients: apps.length,
      subject,
      channels: { email, bell },
    });
    socketEvents.liveInvalidate('hiring');

    return ApiResponse.success(res, {
      message: 'Message sent',
      total: apps.length,
      emailed,
      belled,
      // Applicants with no linked account can't get the in-app bell — surface so
      // the admin knows delivery wasn't possible on that channel for everyone.
      bellSkipped: bell ? apps.filter((a) => !a.userId).length : 0,
    });
  } catch (error) {
    logger.error('Send hiring message error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to send message');
  }
});

// Message history for one applicant (Admin only).
hiringRouter.get('/applications/:id/messages', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!requireUuid(res, id, 'application ID')) return;

    const messages = await prisma.hiringMessage.findMany({
      where: { applicationId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        subject: true,
        body: true,
        emailSent: true,
        bellSent: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return ApiResponse.success(res, { messages });
  } catch (error) {
    logger.error('Get hiring messages error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to fetch message history');
  }
});
