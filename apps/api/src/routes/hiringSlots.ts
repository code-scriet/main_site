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
import { logger } from '../utils/logger.js';
import { getClientIp } from '../utils/clientIp.js';
import { getQueryString } from '../utils/pagination.js';
import { requireUuid } from '../utils/idParams.js';
import { getCachedSettings } from '../utils/settingsCache.js';
import { executeSerializableTransaction, isSerializationConflict } from '../utils/transactionRetry.js';
import { parseISTDateTime, slotsOverlap, buildSlotSeries } from '../utils/interviewSlots.js';
import {
  issueSlotToken,
  resolveSlotToken,
  SlotTokenError,
} from '../utils/interviewSlotToken.js';
import {
  buildSlotMagicLink,
  formatDeadlineIST,
  notifyInterviewScheduledBell,
  sendSlotPickEmail,
  sendSlotConfirmedEmail,
} from '../utils/interviewEmail.js';

export const hiringSlotsRouter = Router();

const DEFAULT_HIRING_CYCLE = '2026';

async function getCurrentHiringCycle(): Promise<string> {
  try {
    const settings = await getCachedSettings();
    const cycle = (settings as { hiringCycle?: string } | null)?.hiringCycle?.trim();
    return cycle || DEFAULT_HIRING_CYCLE;
  } catch {
    return DEFAULT_HIRING_CYCLE;
  }
}

// Basic per-IP limiter for candidate magic-link endpoints.
// Strict tuning happens in Phase 5 — this only stops trivial abuse.
const slotCandidateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: { message: 'Too many requests. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
});

const applyingRoleEnum = z.enum(['TECHNICAL', 'DSA_CHAMPS', 'DESIGNING', 'SOCIAL_MEDIA', 'MANAGEMENT']);

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const timeRe = /^\d{2}:\d{2}$/;

function conflictWithType(res: Response, errorType: string, message: string) {
  return res.status(409).json({
    success: false,
    error: { message, code: 'CONFLICT', error_type: errorType },
    error_type: errorType,
  });
}

interface CandidateContext {
  application: {
    id: string;
    name: string;
    email: string;
    applyingRole: string;
    status: string;
    cycle: string;
    userId: string | null;
  };
  rawToken?: string;
}

async function resolveCandidateApplication(req: Request): Promise<CandidateContext> {
  const fromQuery = getQueryString(req.query.token);
  const bodyToken =
    req.body && typeof (req.body as { token?: unknown }).token === 'string'
      ? ((req.body as { token: string }).token as string)
      : undefined;
  const rawToken = fromQuery ?? bodyToken;
  if (rawToken) {
    const { application } = await resolveSlotToken(rawToken);
    return { application: application as unknown as CandidateContext['application'], rawToken };
  }
  const authUser = getAuthUser(req);
  if (!authUser) {
    throw new SlotTokenError(401, 'unauthorized', 'Authentication or slot token required');
  }
  const application = (await prisma.hiringApplication.findFirst({
    where: {
      OR: [{ userId: authUser.id }, { email: { equals: authUser.email, mode: 'insensitive' } }],
    },
    orderBy: { createdAt: 'desc' },
  })) as unknown as CandidateContext['application'] | null;
  if (!application) {
    throw new SlotTokenError(404, 'not_found', 'No hiring application found');
  }
  return { application };
}

function handleSlotTokenError(res: Response, error: unknown) {
  if (error instanceof SlotTokenError) {
    if (error.status === 410) {
      return res.status(410).json({ success: false, error: { message: error.message, code: 'TOKEN_EXPIRED' } });
    }
    if (error.status === 404) {
      return ApiResponse.notFound(res, error.message);
    }
    return ApiResponse.unauthorized(res, error.message);
  }
  throw error;
}

class BookingHttpError extends Error {
  status: number;
  errorType: string;
  responseMessage: string;

  constructor(status: number, errorType: string, message: string) {
    super(message);
    this.status = status;
    this.errorType = errorType;
    this.responseMessage = message;
  }
}

// ─── ADMIN: POST /slots — create a single slot ──────────────────────────────
const createSlotSchema = z.object({
  cycle: z.string().trim().min(1, 'cycle is required'),
  date: z.string().regex(dateRe, 'date must be YYYY-MM-DD'),
  startTime: z.string().regex(timeRe, 'startTime must be HH:mm'),
  endTime: z.string().regex(timeRe, 'endTime must be HH:mm'),
  capacity: z.number().int().min(1).optional().default(1),
  applyingRole: applyingRoleEnum.optional(),
  venue: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});

hiringSlotsRouter.post('/slots', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const validation = createSlotSchema.safeParse(req.body);
    if (!validation.success) {
      return ApiResponse.validationError(res, zodFieldErrors(validation.error));
    }
    const { cycle, date, startTime, endTime, capacity, applyingRole, venue, notes } = validation.data;

    let startsAt: Date;
    let endsAt: Date;
    try {
      startsAt = parseISTDateTime(date, startTime);
      endsAt = parseISTDateTime(date, endTime);
    } catch {
      return ApiResponse.badRequest(res, 'Invalid date or time');
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      return ApiResponse.badRequest(res, 'End time must be after start time');
    }
    if (startsAt.getTime() <= Date.now()) {
      return ApiResponse.badRequest(res, 'Cannot create a slot in the past');
    }

    const existing = (await prisma.interviewSlot.findMany({
      where: { cycle, isOpen: true },
      select: { startsAt: true, endsAt: true },
    })) as unknown as Array<{ startsAt: Date; endsAt: Date }>;
    const clash = existing.find((e) => slotsOverlap(startsAt, endsAt, e.startsAt, e.endsAt));
    if (clash) {
      return conflictWithType(res, 'slot_overlap', 'Slot overlaps with an existing open slot');
    }

    const slot = (await prisma.interviewSlot.create({
      data: {
        cycle,
        startsAt,
        endsAt,
        capacity: capacity ?? 1,
        applyingRole: (applyingRole as unknown as never) ?? undefined,
        venue: venue || undefined,
        notes: notes || undefined,
        createdById: authUser.id,
      },
    })) as unknown as Record<string, unknown>;

    await auditLog(authUser.id, 'CREATE_SLOT', 'InterviewSlot', slot.id as string, {
      cycle,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      capacity: capacity ?? 1,
    });

    return ApiResponse.created(res, slot);
  } catch (error) {
    logger.error('Create interview slot error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to create interview slot');
  }
});

// ─── ADMIN: POST /slots/preview — dry-run the series generator ───────────────
const seriesSchema = z
  .object({
    cycle: z.string().trim().min(1, 'cycle is required'),
    date: z.string().regex(dateRe, 'date must be YYYY-MM-DD'),
    startTime: z.string().regex(timeRe, 'startTime must be HH:mm'),
    slotMinutes: z.number().int().min(15).max(480),
    count: z.number().int().min(1).max(200).optional(),
    endTime: z.string().regex(timeRe, 'endTime must be HH:mm').optional(),
    breakMinutes: z.number().int().min(0).max(480).optional().default(0),
  })
  .refine((d) => (d.count !== undefined) !== (d.endTime !== undefined), {
    message: 'Exactly one of count or endTime must be provided',
    path: ['form'],
  });

hiringSlotsRouter.post(
  '/slots/preview',
  authMiddleware,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const validation = seriesSchema.safeParse(req.body);
      if (!validation.success) {
        return ApiResponse.validationError(res, zodFieldErrors(validation.error));
      }
      const { cycle, date, startTime, slotMinutes, count, endTime, breakMinutes } = validation.data;
      const existing = (await prisma.interviewSlot.findMany({
        where: { cycle },
        select: { startsAt: true, endsAt: true },
      })) as unknown as Array<{ startsAt: Date; endsAt: Date }>;

      let series;
      try {
        series = buildSlotSeries({
          date,
          startTime,
          slotMinutes,
          count,
          endTime,
          breakMinutes: breakMinutes ?? 0,
          existing,
        });
      } catch (e) {
        return ApiResponse.badRequest(res, e instanceof Error ? e.message : 'Invalid series input');
      }

      const slots = series.map((s) => ({
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        status: s.status,
        ...(s.conflictsWith
          ? {
              conflictsWith: {
                startsAt: s.conflictsWith.startsAt.toISOString(),
                endsAt: s.conflictsWith.endsAt.toISOString(),
              },
            }
          : {}),
      }));
      const okCount = series.filter((s) => s.status === 'ok').length;
      const skipCount = series.length - okCount;
      return ApiResponse.success(res, { slots, okCount, skipCount });
    } catch (error) {
      logger.error('Preview interview slots error:', {
        error: error instanceof Error ? error.message : String(error),
      });
      return ApiResponse.internal(res, 'Failed to preview interview slots');
    }
  },
);

// ─── ADMIN: POST /slots/bulk — create only non-conflicting ───────────────────
hiringSlotsRouter.post('/slots/bulk', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const validation = seriesSchema.safeParse(req.body);
    if (!validation.success) {
      return ApiResponse.validationError(res, zodFieldErrors(validation.error));
    }
    const { cycle, date, startTime, slotMinutes, count, endTime, breakMinutes } = validation.data;
    const existing = (await prisma.interviewSlot.findMany({
      where: { cycle },
      select: { startsAt: true, endsAt: true },
    })) as unknown as Array<{ startsAt: Date; endsAt: Date }>;

    let series;
    try {
      series = buildSlotSeries({
        date,
        startTime,
        slotMinutes,
        count,
        endTime,
        breakMinutes: breakMinutes ?? 0,
        existing,
      });
    } catch (e) {
      return ApiResponse.badRequest(res, e instanceof Error ? e.message : 'Invalid series input');
    }

    let created = 0;
    const skipped: Array<{ startsAt: string; endsAt: string; reason: string }> = [];
    for (const s of series) {
      if (s.status === 'conflict') {
        skipped.push({
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
          reason: 'conflict',
        });
        continue;
      }
      await prisma.interviewSlot.create({
        data: {
          cycle,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          capacity: 1,
          createdById: authUser.id,
        },
      });
      created += 1;
    }

    await auditLog(authUser.id, 'CREATE_BULK_SLOTS', 'InterviewSlot', 'bulk', {
      cycle,
      created,
      skipped: skipped.length,
    });

    return ApiResponse.created(res, { created, skipped });
  } catch (error) {
    logger.error('Bulk create interview slots error:', {
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to bulk create interview slots');
  }
});

// ─── ADMIN: GET /slots — list with spotsLeft + bookings ──────────────────────
hiringSlotsRouter.get('/slots', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const cycle = getQueryString(req.query.cycle);
    const where: Record<string, unknown> = {};
    if (cycle) where.cycle = cycle;
    const slots = (await prisma.interviewSlot.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      include: {
        bookings: {
          include: {
            application: { select: { id: true, name: true, email: true, applyingRole: true } },
          },
        },
      },
    })) as unknown as Array<{
      id: string;
      cycle: string;
      startsAt: Date;
      endsAt: Date;
      capacity: number;
      bookedCount: number;
      isOpen: boolean;
      applyingRole: string | null;
      venue: string | null;
      notes: string | null;
      bookings: Array<{
        id: string;
        applicationId: string;
        bookedAt: Date;
        application: { id: string; name: string; email: string; applyingRole: string };
      }>;
    }>;

    const data = slots.map((s) => ({
      id: s.id,
      cycle: s.cycle,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      capacity: s.capacity,
      bookedCount: s.bookedCount,
      isOpen: s.isOpen,
      applyingRole: s.applyingRole,
      venue: s.venue,
      notes: s.notes,
      spotsLeft: Math.max(0, s.capacity - s.bookedCount),
      bookings: s.bookings.map((b) => ({
        id: b.id,
        applicationId: b.applicationId,
        bookedAt: b.bookedAt,
        name: b.application.name,
        email: b.application.email,
        applyingRole: b.application.applyingRole,
      })),
    }));
    return ApiResponse.success(res, { slots: data });
  } catch (error) {
    logger.error('List interview slots error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to list interview slots');
  }
});

// ─── ADMIN: PATCH /slots/:id — venue/notes/isOpen/capacity (times immutable) ─
const updateSlotSchema = z
  .object({
    isOpen: z.boolean().optional(),
    capacity: z.number().int().min(1).optional(),
    venue: z.string().trim().max(500).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field is required' });

hiringSlotsRouter.patch('/slots/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!requireUuid(res, id, 'slot ID')) return;
    const authUser = getAuthUser(req)!;

    const body = (req.body ?? {}) as Record<string, unknown>;
    if (
      'startsAt' in body ||
      'endsAt' in body ||
      'date' in body ||
      'startTime' in body ||
      'endTime' in body ||
      'starts_at' in body ||
      'ends_at' in body
    ) {
      return ApiResponse.badRequest(res, 'Slot times are immutable via this endpoint');
    }

    const validation = updateSlotSchema.safeParse(req.body);
    if (!validation.success) {
      return ApiResponse.validationError(res, zodFieldErrors(validation.error));
    }

    const slot = (await prisma.interviewSlot.findUnique({ where: { id } })) as unknown as {
      id: string;
      bookedCount: number;
      capacity: number;
    } | null;
    if (!slot) {
      return ApiResponse.notFound(res, 'Slot not found');
    }

    const { capacity, isOpen, venue, notes } = validation.data;
    if (capacity !== undefined) {
      if (capacity < slot.bookedCount) {
        return conflictWithType(res, 'capacity_below_booked', 'Cannot lower capacity below booked count');
      }
      if (slot.bookedCount > 0 && capacity < slot.capacity) {
        return conflictWithType(res, 'capacity_locked', 'Capacity may only be raised while bookings exist');
      }
    }

    const updated = await prisma.interviewSlot.update({
      where: { id },
      data: {
        ...(isOpen !== undefined ? { isOpen } : {}),
        ...(capacity !== undefined ? { capacity } : {}),
        ...(venue !== undefined ? { venue: venue || null } : {}),
        ...(notes !== undefined ? { notes: notes || null } : {}),
      },
    });

    await auditLog(authUser.id, 'UPDATE_SLOT', 'InterviewSlot', id, validation.data);
    return ApiResponse.success(res, updated);
  } catch (error) {
    logger.error('Update interview slot error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to update interview slot');
  }
});

// ─── ADMIN: DELETE /slots/:id ────────────────────────────────────────────────
hiringSlotsRouter.delete('/slots/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!requireUuid(res, id, 'slot ID')) return;
    const authUser = getAuthUser(req)!;

    const slot = (await prisma.interviewSlot.findUnique({ where: { id } })) as unknown as {
      id: string;
      bookedCount: number;
    } | null;
    if (!slot) {
      return ApiResponse.notFound(res, 'Slot not found');
    }
    if (slot.bookedCount > 0) {
      return conflictWithType(res, 'slot_booked', 'Cancel bookings first');
    }

    await prisma.interviewSlot.delete({ where: { id } });
    await auditLog(authUser.id, 'DELETE_SLOT', 'InterviewSlot', id);
    return ApiResponse.success(res, { message: 'Slot deleted successfully' });
  } catch (error) {
    logger.error('Delete interview slot error:', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to delete interview slot');
  }
});

// ─── ADMIN: POST /applications/schedule — PENDING → INTERVIEW_SCHEDULED ──────
const scheduleSchema = z.object({
  applicationIds: z.array(z.string().uuid()).min(1).max(100),
  deadlineDays: z.number().int().min(1).max(30).optional().default(7),
});

hiringSlotsRouter.post(
  '/applications/schedule',
  authMiddleware,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const authUser = getAuthUser(req)!;
      const validation = scheduleSchema.safeParse(req.body);
      if (!validation.success) {
        return ApiResponse.validationError(res, zodFieldErrors(validation.error));
      }
      const { applicationIds, deadlineDays } = validation.data;
      const now = new Date();

      const apps = (await prisma.hiringApplication.findMany({
        where: { id: { in: applicationIds } },
      })) as unknown as Array<{
        id: string;
        name: string;
        email: string;
        applyingRole: string;
        status: string;
        cycle: string;
        userId: string | null;
      }>;
      const byId = new Map(apps.map((a) => [a.id, a]));

      const cycles = [...new Set(apps.map((a) => a.cycle))];
      let cyclesToCheck = cycles;
      if (cyclesToCheck.length === 0) {
        cyclesToCheck = [await getCurrentHiringCycle()];
      }
      const openSlots = await prisma.interviewSlot.findMany({
        where: { cycle: { in: cyclesToCheck }, isOpen: true, startsAt: { gt: now } },
        take: 1,
        select: { id: true },
      });
      if (openSlots.length === 0) {
        return res.status(409).json({
          success: false,
          error: 'no_open_slots',
          message: 'Create interview slots for this cycle first',
        });
      }

      const results: Array<{ id: string; ok: boolean; error?: string }> = [];
      for (const appId of applicationIds) {
        const app = byId.get(appId);
        if (!app) {
          results.push({ id: appId, ok: false, error: 'not_found' });
          continue;
        }
        if (app.status !== 'PENDING') {
          results.push({ id: appId, ok: false, error: 'invalid_transition' });
          continue;
        }
        try {
          await prisma.hiringApplication.update({
            where: { id: appId },
            data: { status: 'INTERVIEW_SCHEDULED' },
          });
          const rawToken = await issueSlotToken(appId);
          const magicLink = buildSlotMagicLink(rawToken);
          const deadlineIST = formatDeadlineIST(
            new Date(now.getTime() + (deadlineDays ?? 7) * 24 * 60 * 60 * 1000),
          );
          sendSlotPickEmail({
            to: app.email,
            name: app.name,
            role: app.applyingRole,
            magicLink,
            deadlineIST,
          }).catch((err) => {
            logger.error('Failed to send slot pick email', {
              applicationId: appId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
          // In-app bell for linked accounts — fire-and-forget, never breaks the request.
          notifyInterviewScheduledBell({
            userId: app.userId ?? null,
            deadlineIST,
            applicationId: appId,
          });
          await auditLog(authUser.id, 'INTERVIEW_SCHEDULED', 'HiringApplication', appId, {
            cycle: app.cycle,
          });
          results.push({ id: appId, ok: true });
        } catch (err) {
          logger.error('Schedule application error:', {
            applicationId: appId,
            error: err instanceof Error ? err.message : String(err),
          });
          results.push({ id: appId, ok: false, error: 'internal' });
        }
      }

      return ApiResponse.success(res, { results });
    } catch (error) {
      logger.error('Schedule applications error:', {
        error: error instanceof Error ? error.message : String(error),
      });
      return ApiResponse.internal(res, 'Failed to schedule applications');
    }
  },
);

// ─── ADMIN: DELETE /bookings/:id — cancel + re-invite ─────────────────────────
const cancelBookingSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

hiringSlotsRouter.delete(
  '/bookings/:id',
  authMiddleware,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (!requireUuid(res, id, 'booking ID')) return;
      const authUser = getAuthUser(req)!;
      const validation = cancelBookingSchema.safeParse(req.body ?? {});
      if (!validation.success) {
        return ApiResponse.validationError(res, zodFieldErrors(validation.error));
      }

      const booking = (await prisma.interviewSlotBooking.findUnique({
        where: { id },
        include: { application: true, slot: true },
      })) as unknown as {
        id: string;
        slotId: string;
        applicationId: string;
        application: { id: string; name: string; email: string; applyingRole: string; cycle: string };
        slot: { id: string };
      } | null;
      if (!booking) {
        return ApiResponse.notFound(res, 'Booking not found');
      }

      await executeSerializableTransaction(async (tx) => {
        await tx.interviewSlotBooking.delete({ where: { id } });
        await tx.interviewSlot.update({
          where: { id: booking.slotId },
          data: { bookedCount: { decrement: 1 } },
        });
        await tx.hiringApplication.update({
          where: { id: booking.applicationId },
          data: { status: 'INTERVIEW_SCHEDULED' },
        });
      });

      const rawToken = await issueSlotToken(booking.applicationId);
      const magicLink = buildSlotMagicLink(rawToken);
      const deadlineIST = formatDeadlineIST(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
      sendSlotPickEmail({
        to: booking.application.email,
        name: booking.application.name,
        role: booking.application.applyingRole,
        magicLink,
        deadlineIST,
      }).catch((err) => {
        logger.error('Failed to send re-invite email', {
          applicationId: booking.applicationId,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      await auditLog(authUser.id, 'CANCEL_BOOKING', 'InterviewSlotBooking', id, {
        applicationId: booking.applicationId,
        reason: validation.data.reason,
      });

      return ApiResponse.success(res, { message: 'Booking cancelled and candidate re-invited' });
    } catch (error) {
      logger.error('Cancel booking error:', { error: error instanceof Error ? error.message : String(error) });
      return ApiResponse.internal(res, 'Failed to cancel booking');
    }
  },
);

// ─── CANDIDATE: GET /slots/available ──────────────────────────────────────────
hiringSlotsRouter.get(
  '/slots/available',
  slotCandidateLimiter,
  optionalAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      let ctx: CandidateContext;
      try {
        ctx = await resolveCandidateApplication(req);
      } catch (error) {
        return handleSlotTokenError(res, error);
      }
      const now = new Date();
      const slots = (await prisma.interviewSlot.findMany({
        where: { cycle: ctx.application.cycle, isOpen: true, startsAt: { gt: now } },
        orderBy: { startsAt: 'asc' },
      })) as unknown as Array<{
        id: string;
        cycle: string;
        startsAt: Date;
        endsAt: Date;
        capacity: number;
        bookedCount: number;
        isOpen: boolean;
        applyingRole: string | null;
        venue: string | null;
      }>;

      const available = slots
        .filter((s) => s.applyingRole === null || s.applyingRole === ctx.application.applyingRole)
        .map((s) => ({ ...s, spotsLeft: s.capacity - s.bookedCount }))
        .filter((s) => s.spotsLeft > 0)
        .map((s) => ({
          id: s.id,
          cycle: s.cycle,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          capacity: s.capacity,
          bookedCount: s.bookedCount,
          spotsLeft: s.spotsLeft,
          isOpen: s.isOpen,
          applyingRole: s.applyingRole,
          venue: s.venue,
        }));

      return ApiResponse.success(res, { slots: available });
    } catch (error) {
      logger.error('Available slots error:', { error: error instanceof Error ? error.message : String(error) });
      return ApiResponse.internal(res, 'Failed to fetch available slots');
    }
  },
);

// ─── CANDIDATE: GET /my-booking ──────────────────────────────────────────────
hiringSlotsRouter.get(
  '/my-booking',
  slotCandidateLimiter,
  optionalAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      let ctx: CandidateContext;
      try {
        ctx = await resolveCandidateApplication(req);
      } catch (error) {
        return handleSlotTokenError(res, error);
      }
      const booking = (await prisma.interviewSlotBooking.findUnique({
        where: { applicationId: ctx.application.id },
        include: { slot: true },
      })) as unknown as { id: string; bookedAt: Date; slot: unknown } | null;
      if (!booking) {
        return ApiResponse.success(res, { hasBooking: false });
      }
      return ApiResponse.success(res, { hasBooking: true, booking });
    } catch (error) {
      logger.error('My booking error:', { error: error instanceof Error ? error.message : String(error) });
      return ApiResponse.internal(res, 'Failed to fetch booking');
    }
  },
);

// ─── CANDIDATE: POST /slots/:id/book — the serializable tx ───────────────────
hiringSlotsRouter.post(
  '/slots/:id/book',
  slotCandidateLimiter,
  optionalAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id: slotId } = req.params;
      if (!requireUuid(res, slotId, 'slot ID')) return;
      let ctx: CandidateContext;
      try {
        ctx = await resolveCandidateApplication(req);
      } catch (error) {
        return handleSlotTokenError(res, error);
      }

      try {
        const result = await executeSerializableTransaction(async (tx) => {
          const slot = (await tx.interviewSlot.findUnique({
            where: { id: slotId },
          })) as unknown as {
            id: string;
            cycle: string;
            startsAt: Date;
            endsAt: Date;
            capacity: number;
            bookedCount: number;
            isOpen: boolean;
            venue: string | null;
          } | null;
          if (!slot || slot.cycle !== ctx.application.cycle) {
            throw new BookingHttpError(404, 'slot_not_found', 'Slot not found');
          }
          if (!slot.isOpen) {
            throw new BookingHttpError(409, 'slot_closed', 'This slot is closed');
          }
          if (slot.bookedCount >= slot.capacity) {
            throw new BookingHttpError(409, 'slot_full', 'This slot is full');
          }
          if (new Date(slot.startsAt).getTime() <= Date.now()) {
            throw new BookingHttpError(400, 'past_slot', 'Cannot book a past slot');
          }
          const existingBooking = await tx.interviewSlotBooking.findUnique({
            where: { applicationId: ctx.application.id },
          });
          if (existingBooking) {
            throw new BookingHttpError(409, 'already_booked', 'Application already has a booking');
          }
          const booking = await tx.interviewSlotBooking.create({
            data: { slotId, applicationId: ctx.application.id },
          });
          await tx.interviewSlot.update({
            where: { id: slotId },
            data: { bookedCount: { increment: 1 } },
          });
          await tx.hiringApplication.update({
            where: { id: ctx.application.id },
            data: { status: 'SLOT_BOOKED' },
          });
          return { booking, slot };
        });

        // Emails + audit AFTER commit.
        const authUser = getAuthUser(req);
        const auditUserId = authUser?.id ?? ctx.application.userId ?? undefined;
        const magicLink = ctx.rawToken
          ? buildSlotMagicLink(ctx.rawToken)
          : buildSlotMagicLink(await issueSlotToken(ctx.application.id));
        const slot = result.slot as { startsAt: Date; endsAt: Date; venue: string | null };
        sendSlotConfirmedEmail({
          to: ctx.application.email,
          name: ctx.application.name,
          role: ctx.application.applyingRole,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          venue: slot.venue,
          magicLink,
        }).catch((err) => {
          logger.error('Failed to send slot confirmation email', {
            applicationId: ctx.application.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
        if (auditUserId) {
          await auditLog(auditUserId, 'SLOT_BOOKED', 'InterviewSlotBooking', (result.booking as { id: string }).id, {
            slotId,
            applicationId: ctx.application.id,
          });
        }

        return ApiResponse.created(res, result);
      } catch (txError) {
        if (txError instanceof BookingHttpError) {
          if (txError.status === 404) return ApiResponse.notFound(res, txError.responseMessage);
          if (txError.status === 400) {
            return res.status(400).json({
              success: false,
              error: { message: txError.responseMessage, code: 'BAD_REQUEST', error_type: txError.errorType },
              error_type: txError.errorType,
            });
          }
          return conflictWithType(res, txError.errorType, txError.responseMessage);
        }
        if (txError instanceof Prisma.PrismaClientKnownRequestError && txError.code === 'P2002') {
          return conflictWithType(res, 'already_booked', 'Application already has a booking');
        }
        if (isSerializationConflict(txError)) {
          return conflictWithType(res, 'conflict', 'Please try again. The slot just changed.');
        }
        throw txError;
      }
    } catch (error) {
      logger.error('Book slot error:', { error: error instanceof Error ? error.message : String(error) });
      return ApiResponse.internal(res, 'Failed to book slot');
    }
  },
);

// ─── CANDIDATE: POST /my-booking/cancel — 24h cutoff ─────────────────────────
hiringSlotsRouter.post(
  '/my-booking/cancel',
  slotCandidateLimiter,
  optionalAuthMiddleware,
  async (req: Request, res: Response) => {
    try {
      let ctx: CandidateContext;
      try {
        ctx = await resolveCandidateApplication(req);
      } catch (error) {
        return handleSlotTokenError(res, error);
      }

      const booking = (await prisma.interviewSlotBooking.findUnique({
        where: { applicationId: ctx.application.id },
        include: { slot: true },
      })) as unknown as {
        id: string;
        slotId: string;
        slot: { id: string; startsAt: Date };
      } | null;
      if (!booking) {
        return ApiResponse.notFound(res, 'No booking found');
      }
      if (new Date(booking.slot.startsAt).getTime() - Date.now() < 24 * 60 * 60 * 1000) {
        return res.status(400).json({
          success: false,
          error: { message: 'Cancellation cutoff passed (24h before the slot)', code: 'BAD_REQUEST', error_type: 'cancel_cutoff' },
          error_type: 'cancel_cutoff',
        });
      }

      await executeSerializableTransaction(async (tx) => {
        await tx.interviewSlotBooking.delete({ where: { id: booking.id } });
        await tx.interviewSlot.update({
          where: { id: booking.slotId },
          data: { bookedCount: { decrement: 1 } },
        });
        await tx.hiringApplication.update({
          where: { id: ctx.application.id },
          data: { status: 'INTERVIEW_SCHEDULED' },
        });
      });

      const rawToken = await issueSlotToken(ctx.application.id);
      const magicLink = buildSlotMagicLink(rawToken);
      const deadlineIST = formatDeadlineIST(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
      sendSlotPickEmail({
        to: ctx.application.email,
        name: ctx.application.name,
        role: ctx.application.applyingRole,
        magicLink,
        deadlineIST,
      }).catch((err) => {
        logger.error('Failed to send re-invite email', {
          applicationId: ctx.application.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      const authUser = getAuthUser(req);
      const auditUserId = authUser?.id ?? ctx.application.userId ?? undefined;
      if (auditUserId) {
        await auditLog(auditUserId, 'CANCEL_BOOKING', 'InterviewSlotBooking', booking.id, {
          applicationId: ctx.application.id,
        });
      }

      return ApiResponse.success(res, { message: 'Booking cancelled' });
    } catch (error) {
      logger.error('Cancel my booking error:', { error: error instanceof Error ? error.message : String(error) });
      return ApiResponse.internal(res, 'Failed to cancel booking');
    }
  },
);
