import { Router, Request, Response } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ApiResponse } from '../utils/response.js';
import { auditLog } from '../utils/audit.js';
import { logger } from '../utils/logger.js';
import { getIO } from '../utils/socket.js';
import { emailService } from '../utils/email.js';
import { verifyToken } from '../utils/jwt.js';
import { withRetry } from '../lib/prisma.js';
import { generateAttendanceToken, verifyAttendanceToken } from '../utils/attendanceToken.js';
import { getCachedSettings } from '../utils/settingsCache.js';
import {
  AttendanceBulkUpdateConflictError,
  CLIENT_SCAN_FUTURE_TOLERANCE_MS,
  CLIENT_SCAN_MAX_AGE_MS,
  isRegistrationBoundToPayload,
  markDayAttendanceAtomic,
  normalizeEventDays,
  parseDayLabels,
  parseRequestedDayNumber,
  resolveAttendancePayloadFromToken,
  resolveClientScannedAt,
  resolveEffectiveDayNumber,
  resolveStoredAttendanceTokenPayloads,
  syncRegistrationAttendance,
  unmarkDayAttendanceAtomic,
  type AttendanceTokenPayload,
} from '../utils/attendanceDomain.js';
import { isGuest, isParticipant, participantsOnly } from '../utils/registrationFilters.js';
import { sanitizeHtml } from '../utils/sanitize.js';

const router = Router();

const beaconLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const uuidSchema = z.string().uuid();
const jwtLikePattern = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
const ATTENDANCE_FULL_LIST_LIMIT = 5000;
const ATTENDANCE_EXPORT_LIMIT = 10000;
const ATTENDANCE_BACKFILL_BATCH_SIZE = 1000;
const ATTENDANCE_REGENERATE_BATCH_SIZE = 200;

function requireUuid(res: Response, value: unknown, label: string): value is string {
  if (typeof value !== 'string' || !uuidSchema.safeParse(value).success) {
    ApiResponse.badRequest(res, `Invalid ${label} format`);
    return false;
  }

  return true;
}

function getCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) {
    return undefined;
  }

  const match = raw
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  if (!match) {
    return undefined;
  }

  return decodeURIComponent(match.split('=').slice(1).join('='));
}

// ────────────────────────────────────────────────────────────
// 1. GET /my-qr/:eventId — Get user's attendance QR token
// ────────────────────────────────────────────────────────────
router.get('/my-qr/:eventId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) {
      return ApiResponse.unauthorized(res);
    }
    const { eventId } = req.params;
    if (!requireUuid(res, eventId, 'event ID')) {
      return;
    }

    const registration = await prisma.eventRegistration.findUnique({
      where: {
        userId_eventId: {
          userId: user.id,
          eventId,
        },
      },
      include: {
        event: {
          select: {
            title: true,
            startDate: true,
            endDate: true,
            eventDays: true,
            dayLabels: true,
          },
        },
        dayAttendances: {
          orderBy: { dayNumber: 'asc' },
          select: {
            dayNumber: true,
            attended: true,
            scannedAt: true,
          },
        },
      },
    });

    if (!registration) {
      return ApiResponse.notFound(res, 'Registration not found for this event');
    }

    const eventDays = normalizeEventDays(registration.event.eventDays);
    const dayLabels = parseDayLabels(registration.event.dayLabels, eventDays);
    const daysAttended = registration.dayAttendances.filter((dayAttendance) => dayAttendance.attended).length;
    const allDaysAttended = eventDays > 1 ? daysAttended >= eventDays : registration.attended;

    return ApiResponse.success(res, {
      attendanceToken: registration.attendanceToken,
      attended: registration.attended,
      scannedAt: registration.scannedAt,
      event: registration.event,
      eventDays,
      dayLabels,
      dayAttendances: registration.dayAttendances,
      daysAttended,
      allDaysAttended,
    });
  } catch (error) {
    logger.error('Failed to get attendance QR', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to get attendance QR');
  }
});

// ────────────────────────────────────────────────────────────
// 2. POST /scan — Scan a single attendance token
// ────────────────────────────────────────────────────────────
router.post('/scan', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) {
      return ApiResponse.unauthorized(res);
    }

    const { token, bypassWindow, dayNumber } = req.body as { token?: string; bypassWindow?: boolean; dayNumber?: number };

    if (!token || typeof token !== 'string') {
      return ApiResponse.badRequest(res, 'Token is required');
    }

    const normalizedToken = token.trim();
    if (!normalizedToken) {
      return ApiResponse.badRequest(res, 'Invalid or expired attendance token');
    }

    const payload = await resolveAttendancePayloadFromToken(normalizedToken);
    if (!payload) {
      return ApiResponse.badRequest(res, 'Invalid or expired attendance token');
    }

    const registration = await prisma.eventRegistration.findUnique({
      where: { id: payload.registrationId },
      include: {
        user: {
          select: { id: true, name: true },
        },
        event: {
          select: { title: true, startDate: true, endDate: true, status: true, eventDays: true },
        },
      },
    });

    if (!registration) {
      return ApiResponse.notFound(res, 'Registration not found');
    }

    if (!isRegistrationBoundToPayload(registration, payload)) {
      logger.warn('Attendance token payload mismatch during scan', {
        registrationId: registration.id,
        registrationUserId: registration.userId,
        registrationEventId: registration.eventId,
        tokenRegistrationId: payload.registrationId,
        tokenUserId: payload.userId,
        tokenEventId: payload.eventId,
      });
      return ApiResponse.badRequest(res, 'Invalid or expired attendance token');
    }

    const eventDays = normalizeEventDays(registration.event.eventDays);
    const effectiveDayNumber = resolveEffectiveDayNumber(dayNumber, eventDays, true);
    if (!effectiveDayNumber || Number.isNaN(effectiveDayNumber)) {
      return ApiResponse.badRequest(res, `dayNumber must be between 1 and ${eventDays}`);
    }

    // Event status check: only allow scans for ONGOING events.
    // Admins can bypass to scan UPCOMING events only when explicitly requested.
    const isOngoingEvent = registration.event.status === 'ONGOING';
    const canBypassUpcoming = bypassWindow === true && registration.event.status === 'UPCOMING';
    if (!isOngoingEvent && !canBypassUpcoming) {
      return ApiResponse.forbidden(res, 'Attendance scanning is allowed only for ongoing events');
    }

    // Scan window check: allow startDate - 30min to endDate || startDate + 4h
    if (bypassWindow !== true) {
      const now = new Date();
      const windowStart = new Date(registration.event.startDate.getTime() - 30 * 60 * 1000);
      const windowEnd = registration.event.endDate
        ? new Date(registration.event.endDate)
        : new Date(registration.event.startDate.getTime() + 4 * 60 * 60 * 1000);

      if (now < windowStart || now > windowEnd) {
        return ApiResponse.forbidden(res, `Scan window is ${windowStart.toISOString()} to ${windowEnd.toISOString()}. Current time is outside the allowed window.`);
      }
    }

    const scannedAt = new Date();
    const outcome = await withRetry(() => markDayAttendanceAtomic(prisma, {
      registrationId: registration.id,
      dayNumber: effectiveDayNumber,
      scannedAt,
      scannedBy: admin.id,
    }));

    if (outcome === 'duplicate') {
      return ApiResponse.conflict(res, `${registration.user.name} is already marked present for day ${effectiveDayNumber}`);
    }

    await syncRegistrationAttendance(registration.id);

    // Socket emit
    getIO()?.of('/attendance').to(`event:${registration.eventId}`).emit('attendance:marked', {
      registrationId: registration.id,
      userId: payload.userId,
      userName: registration.user.name,
      dayNumber: effectiveDayNumber,
      scannedAt,
      scannedBy: admin.id,
    });

    await auditLog(admin.id, 'ATTENDANCE_SCAN', 'eventRegistration', registration.id, {
      eventId: registration.eventId,
      userId: payload.userId,
      userName: registration.user.name,
      dayNumber: effectiveDayNumber,
    });

    return ApiResponse.success(res, {
      registrationId: registration.id,
      userName: registration.user.name,
      dayNumber: effectiveDayNumber,
      scannedAt,
    });
  } catch (error) {
    logger.error('Failed to scan attendance', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to scan attendance');
  }
});

// ────────────────────────────────────────────────────────────
// 3. POST /scan-batch — Batch scan multiple tokens
// ────────────────────────────────────────────────────────────
router.post('/scan-batch', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) {
      return ApiResponse.unauthorized(res);
    }

    const { scans, eventId, bypassWindow } = req.body as {
      scans?: Array<{ token: string; scannedAtLocal?: string; localId: string; dayNumber?: number }>;
      eventId?: string;
      bypassWindow?: boolean;
    };

    if (!scans || !Array.isArray(scans) || scans.length === 0) {
      return ApiResponse.badRequest(res, 'scans array is required and must not be empty');
    }
    // Cap batch size — a 10k-scan POST would balloon memory on the free tier.
    if (scans.length > 500) {
      return ApiResponse.badRequest(res, 'scans array is limited to 500 entries per batch');
    }

    if (!eventId || typeof eventId !== 'string') {
      return ApiResponse.badRequest(res, 'eventId is required');
    }
    if (!requireUuid(res, eventId, 'event ID')) {
      return;
    }

    const results: Array<{ localId: string; status: 'ok' | 'duplicate' | 'error'; name?: string; message?: string }> = [];

    let okCount = 0;
    let dupCount = 0;
    let errCount = 0;

    // ── Phase 1: Verify all tokens (CPU only, no DB) ──
    const verified: Array<{
      localId: string;
      scannedAtLocal?: string;
      dayNumber?: number;
      payload: { userId: string; eventId: string; registrationId: string };
    }> = [];
    const fallbackCandidates: Array<{ localId: string; token: string; scannedAtLocal?: string; dayNumber?: number }> = [];

    for (const scan of scans) {
      if (!scan || typeof scan !== 'object' || typeof scan.token !== 'string' || typeof scan.localId !== 'string') {
        results.push({ localId: typeof scan?.localId === 'string' ? scan.localId : 'unknown', status: 'error', message: 'Invalid scan payload' });
        errCount++;
        continue;
      }

      const normalizedToken = scan.token.trim();
      if (!normalizedToken) {
        results.push({ localId: scan.localId, status: 'error', message: 'Invalid or expired token' });
        errCount++;
        continue;
      }

      let payload;
      try {
        payload = verifyAttendanceToken(normalizedToken);
      } catch {
        fallbackCandidates.push({
          localId: scan.localId,
          token: normalizedToken,
          scannedAtLocal: scan.scannedAtLocal,
          dayNumber: scan.dayNumber,
        });
        continue;
      }

      if (payload.eventId !== eventId) {
        results.push({ localId: scan.localId, status: 'error', message: 'Token does not match event' });
        errCount++;
        continue;
      }

      verified.push({ localId: scan.localId, scannedAtLocal: scan.scannedAtLocal, dayNumber: scan.dayNumber, payload });
    }

    if (fallbackCandidates.length > 0) {
      const fallbackPayloadMap = await resolveStoredAttendanceTokenPayloads(
        fallbackCandidates.map((scan) => scan.token),
      );

      for (const scan of fallbackCandidates) {
        const payload = fallbackPayloadMap.get(scan.token);
        if (!payload) {
          results.push({ localId: scan.localId, status: 'error', message: 'Invalid or expired token' });
          errCount++;
          continue;
        }

        if (payload.eventId !== eventId) {
          results.push({ localId: scan.localId, status: 'error', message: 'Token does not match event' });
          errCount++;
          continue;
        }

        verified.push({ localId: scan.localId, scannedAtLocal: scan.scannedAtLocal, dayNumber: scan.dayNumber, payload });
      }
    }

    if (verified.length === 0) {
      await auditLog(admin.id, 'ATTENDANCE_BATCH_SCAN', 'eventRegistration', eventId, {
        total: scans.length, ok: 0, duplicate: dupCount, error: errCount,
      });
      return ApiResponse.success(res, { results });
    }

    // ── Phase 2: Single batched read ──
    const regIds = verified.map((v) => v.payload.registrationId);
    const registrations = await prisma.eventRegistration.findMany({
      where: { id: { in: regIds } },
      include: {
        user: { select: { name: true } },
        event: { select: { startDate: true, endDate: true, status: true, eventDays: true } },
      },
    });
    const regMap = new Map(registrations.map((r) => [r.id, r]));

    // ── Phase 3: Individual atomic writes + socket emit ──
    for (const item of verified) {
      const registration = regMap.get(item.payload.registrationId);

      if (!registration) {
        results.push({ localId: item.localId, status: 'error', message: 'Registration not found' });
        errCount++;
        continue;
      }

      if (!isRegistrationBoundToPayload(registration, item.payload)) {
        logger.warn('Attendance token payload mismatch during batch scan', {
          registrationId: registration.id,
          registrationUserId: registration.userId,
          registrationEventId: registration.eventId,
          tokenRegistrationId: item.payload.registrationId,
          tokenUserId: item.payload.userId,
          tokenEventId: item.payload.eventId,
        });
        results.push({ localId: item.localId, status: 'error', message: 'Invalid or expired token' });
        errCount++;
        continue;
      }

      const isOngoingEvent = registration.event.status === 'ONGOING';
      const canBypassUpcoming = bypassWindow === true && registration.event.status === 'UPCOMING';
      if (!isOngoingEvent && !canBypassUpcoming) {
        results.push({ localId: item.localId, status: 'error', message: 'Attendance scanning is allowed only for ongoing events' });
        errCount++;
        continue;
      }

      // Scan window check using event data from batched read
      if (bypassWindow !== true) {
        const now = new Date();
        const windowStart = new Date(registration.event.startDate.getTime() - 30 * 60 * 1000);
        const windowEnd = registration.event.endDate
          ? new Date(registration.event.endDate)
          : new Date(registration.event.startDate.getTime() + 4 * 60 * 60 * 1000);

        if (now < windowStart || now > windowEnd) {
          results.push({ localId: item.localId, status: 'error', message: 'Outside scan window' });
          errCount++;
          continue;
        }
      }

      const scannedAt = resolveClientScannedAt(item.scannedAtLocal);
      const eventDays = normalizeEventDays(registration.event.eventDays);
      const effectiveDayNumber = resolveEffectiveDayNumber(item.dayNumber, eventDays, true);
      if (!effectiveDayNumber || Number.isNaN(effectiveDayNumber)) {
        results.push({ localId: item.localId, status: 'error', message: `Invalid dayNumber. Allowed range: 1-${eventDays}` });
        errCount++;
        continue;
      }

      const outcome = await withRetry(() => markDayAttendanceAtomic(prisma, {
        registrationId: registration.id,
        dayNumber: effectiveDayNumber,
        scannedAt,
        scannedBy: admin.id,
      }));

      if (outcome === 'duplicate') {
        results.push({ localId: item.localId, status: 'duplicate', name: registration.user.name, message: `Already present for day ${effectiveDayNumber}` });
        dupCount++;
        continue;
      }

      await syncRegistrationAttendance(registration.id);

      getIO()?.of('/attendance').to(`event:${eventId}`).emit('attendance:marked', {
        registrationId: registration.id,
        userId: item.payload.userId,
        userName: registration.user.name,
        dayNumber: effectiveDayNumber,
        scannedAt,
        scannedBy: admin.id,
      });

      results.push({ localId: item.localId, status: 'ok', name: registration.user.name });
      okCount++;
    }

    await auditLog(admin.id, 'ATTENDANCE_BATCH_SCAN', 'eventRegistration', eventId, {
      total: scans.length,
      ok: okCount,
      duplicate: dupCount,
      error: errCount,
    });

    return ApiResponse.success(res, { results });
  } catch (error) {
    logger.error('Failed to batch scan attendance', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to batch scan attendance');
  }
});

// ────────────────────────────────────────────────────────────
// 4. POST /scan-beacon — Fire-and-forget beacon scan (no auth header)
// ────────────────────────────────────────────────────────────
router.post('/scan-beacon', beaconLimiter, express.text({ type: '*/*' }), async (req: Request, res: Response) => {
  try {
    let body: {
      authToken?: string;
      scans?: Array<{ token: string; scannedAtLocal?: string; localId: string; dayNumber?: number }>;
      eventId?: string;
      bypassWindow?: boolean;
    };
    try {
      body = JSON.parse(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    } catch {
      return res.status(400).send();
    }

    const { authToken, scans, eventId, bypassWindow } = body;

    if (
      !Array.isArray(scans) ||
      scans.length === 0 ||
      typeof eventId !== 'string'
    ) {
      return res.status(400).send();
    }
    if (!uuidSchema.safeParse(eventId).success) {
      return res.status(400).send();
    }

    // Verify the auth token manually (beacon cannot set Authorization header)
    const cookieToken = getCookie(req, 'scriet_session');
    const bodyToken = typeof authToken === 'string' && jwtLikePattern.test(authToken)
      ? authToken
      : undefined;
    const effectiveToken = cookieToken || bodyToken;

    if (!effectiveToken) {
      return res.status(401).send();
    }

    let decoded;
    try {
      decoded = verifyToken(effectiveToken);
    } catch {
      return res.status(401).send();
    }

    const role = decoded.role;
    if (role !== 'ADMIN' && role !== 'PRESIDENT' && role !== 'CORE_MEMBER') {
      return res.status(403).send();
    }

    // DB-backed user check — JWT role claims can be stale
    const user = await prisma.user.findUnique({ where: { id: decoded.userId || decoded.id || '' }, select: { id: true, role: true } });
    if (!user || !['ADMIN', 'PRESIDENT', 'CORE_MEMBER'].includes(user.role)) {
      return res.status(403).send();
    }

    // Return 204 immediately — process fire-and-forget
    res.status(204).send();

    const adminId = user.id;
    let processedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const fallbackPayloadMap = await resolveStoredAttendanceTokenPayloads(
      scans
        .filter((scan): scan is { token: string; scannedAtLocal?: string; localId: string; dayNumber?: number } =>
          Boolean(scan && typeof scan === 'object' && typeof scan.token === 'string'),
        )
        .map((scan) => scan.token),
    );

    try {
      // sendBeacon is intentionally fire-and-forget, so per-item failures are logged
      // server-side and not surfaced back to the client after the 204 response.
      for (const scan of scans) {
        try {
          if (!scan || typeof scan !== 'object' || typeof scan.token !== 'string') {
            failedCount++;
            continue;
          }

          const normalizedToken = scan.token.trim();
          if (!normalizedToken) {
            failedCount++;
            continue;
          }

          let payload;
          try {
            payload = verifyAttendanceToken(normalizedToken);
          } catch {
            payload = fallbackPayloadMap.get(normalizedToken);
            if (!payload) {
              failedCount++;
              continue;
            }
          }

          if (payload.eventId !== eventId) {
            failedCount++;
            continue;
          }

          const registration = await prisma.eventRegistration.findUnique({
            where: { id: payload.registrationId },
            select: {
              id: true,
              userId: true,
              eventId: true,
              event: { select: { startDate: true, endDate: true, status: true, eventDays: true } },
              user: { select: { name: true } },
            },
          });

          if (!registration || !isRegistrationBoundToPayload(registration, payload)) {
            failedCount++;
            continue;
          }

          const isOngoingEvent = registration.event.status === 'ONGOING';
          const canBypassUpcoming = bypassWindow === true && registration.event.status === 'UPCOMING';
          if (!isOngoingEvent && !canBypassUpcoming) {
            failedCount++;
            continue;
          }

          if (bypassWindow !== true) {
            const now = new Date();
            const windowStart = new Date(registration.event.startDate.getTime() - 30 * 60 * 1000);
            const windowEnd = registration.event.endDate
              ? new Date(registration.event.endDate)
              : new Date(registration.event.startDate.getTime() + 4 * 60 * 60 * 1000);

            if (now < windowStart || now > windowEnd) {
              failedCount++;
              continue;
            }
          }

          const scannedAt = resolveClientScannedAt(
            typeof scan.scannedAtLocal === 'string' ? scan.scannedAtLocal : undefined,
          );
          const eventDays = normalizeEventDays(registration.event.eventDays);
          const effectiveDayNumber = resolveEffectiveDayNumber(scan.dayNumber, eventDays, true);
          if (!effectiveDayNumber || Number.isNaN(effectiveDayNumber)) {
            failedCount++;
            continue;
          }

          const outcome = await withRetry(() => markDayAttendanceAtomic(prisma, {
            registrationId: registration.id,
            dayNumber: effectiveDayNumber,
            scannedAt,
            scannedBy: adminId,
          }));

          if (outcome === 'duplicate') {
            skippedCount++;
            continue;
          }

          await syncRegistrationAttendance(registration.id);
          processedCount++;

          if (registration.user.name) {
            getIO()?.of('/attendance').to(`event:${eventId}`).emit('attendance:marked', {
              registrationId: registration.id,
              userId: payload.userId,
              userName: registration.user.name,
              dayNumber: effectiveDayNumber,
              scannedAt,
              scannedBy: adminId,
            });
          }
        } catch (err) {
          failedCount++;
          logger.error('Beacon scan item failed', { error: err instanceof Error ? err.message : String(err) });
        }
      }
    } finally {
      try {
        await auditLog(adminId, 'ATTENDANCE_BEACON_SCAN', 'eventRegistration', eventId, {
          total: scans.length,
          processed: processedCount,
          skipped: skippedCount,
          failed: failedCount,
        });
      } catch (auditError) {
        logger.error('Failed to write beacon attendance audit log', {
          error: auditError instanceof Error ? auditError.message : String(auditError),
        });
      }
    }
  } catch (error) {
    logger.error('Failed to process beacon scan', { error: error instanceof Error ? error.message : String(error) });
    if (!res.headersSent) {
      return res.status(500).send();
    }
  }
});

// ────────────────────────────────────────────────────────────
// 5. POST /manual-checkin — Manually check in a registration
// ────────────────────────────────────────────────────────────
router.post('/manual-checkin', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) {
      return ApiResponse.unauthorized(res);
    }

    const { registrationId, dayNumber } = req.body as { registrationId?: string; dayNumber?: number };

    if (!requireUuid(res, registrationId, 'registration ID')) {
      return;
    }

    const registration = await prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: {
        user: { select: { id: true, name: true } },
        event: { select: { eventDays: true } },
      },
    });

    if (!registration) {
      return ApiResponse.notFound(res, 'Registration not found');
    }

    const eventDays = normalizeEventDays(registration.event.eventDays);
    const effectiveDayNumber = resolveEffectiveDayNumber(dayNumber, eventDays, true);
    if (!effectiveDayNumber || Number.isNaN(effectiveDayNumber)) {
      return ApiResponse.badRequest(res, `dayNumber must be between 1 and ${eventDays}`);
    }

    const scannedAt = new Date();
    const outcome = await withRetry(() => markDayAttendanceAtomic(prisma, {
      registrationId,
      dayNumber: effectiveDayNumber,
      scannedAt,
      scannedBy: admin.id,
      manualOverride: true,
    }));

    if (outcome === 'duplicate') {
      return ApiResponse.conflict(res, `${registration.user.name} is already checked in for day ${effectiveDayNumber}`);
    }

    await syncRegistrationAttendance(registrationId);

    getIO()?.of('/attendance').to(`event:${registration.eventId}`).emit('attendance:marked', {
      registrationId: registration.id,
      userId: registration.user.id,
      userName: registration.user.name,
      dayNumber: effectiveDayNumber,
      scannedAt,
      scannedBy: admin.id,
    });

    await auditLog(admin.id, 'ATTENDANCE_MANUAL', 'eventRegistration', registrationId, {
      eventId: registration.eventId,
      userId: registration.user.id,
      userName: registration.user.name,
      dayNumber: effectiveDayNumber,
    });

    return ApiResponse.success(res, {
      registrationId: registration.id,
      userName: registration.user.name,
      dayNumber: effectiveDayNumber,
      scannedAt,
      manualOverride: true,
    });
  } catch (error) {
    logger.error('Failed to manual check-in', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to manual check-in');
  }
});

// ────────────────────────────────────────────────────────────
// 6. PATCH /unmark — Unmark attendance
// ────────────────────────────────────────────────────────────
router.patch('/unmark', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) {
      return ApiResponse.unauthorized(res);
    }

    const { registrationId, dayNumber } = req.body as { registrationId?: string; dayNumber?: number };

    if (!requireUuid(res, registrationId, 'registration ID')) {
      return;
    }

    const registration = await prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: {
        user: { select: { id: true, name: true } },
        event: { select: { eventDays: true } },
      },
    });

    if (!registration) {
      return ApiResponse.notFound(res, 'Registration not found');
    }

    const eventDays = normalizeEventDays(registration.event.eventDays);
    const effectiveDayNumber = resolveEffectiveDayNumber(dayNumber, eventDays, true);
    if (!effectiveDayNumber || Number.isNaN(effectiveDayNumber)) {
      return ApiResponse.badRequest(res, `dayNumber must be between 1 and ${eventDays}`);
    }

    const outcome = await withRetry(() => unmarkDayAttendanceAtomic(prisma, {
      registrationId,
      dayNumber: effectiveDayNumber,
    }));
    if (outcome === 'not-marked') {
      return ApiResponse.badRequest(res, `${registration.user.name} is not marked as attended for day ${effectiveDayNumber}`);
    }

    await syncRegistrationAttendance(registrationId);

    getIO()?.of('/attendance').to(`event:${registration.eventId}`).emit('attendance:unmarked', {
      registrationId,
      userId: registration.user.id,
      userName: registration.user.name,
      dayNumber: effectiveDayNumber,
    });

    await auditLog(admin.id, 'ATTENDANCE_UNMARK', 'eventRegistration', registrationId, {
      eventId: registration.eventId,
      userId: registration.user.id,
      userName: registration.user.name,
      dayNumber: effectiveDayNumber,
    });

    return ApiResponse.success(res, {
      registrationId,
      userName: registration.user.name,
      attended: false,
      dayNumber: effectiveDayNumber,
    });
  } catch (error) {
    logger.error('Failed to unmark attendance', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to unmark attendance');
  }
});

// ────────────────────────────────────────────────────────────
// 7. PATCH /bulk-update — Bulk mark/unmark attendance
// ────────────────────────────────────────────────────────────
router.patch('/bulk-update', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) {
      return ApiResponse.unauthorized(res);
    }

    const { registrationIds, action, dayNumber } = req.body as { registrationIds?: string[]; action?: 'mark' | 'unmark'; dayNumber?: number };

    if (!registrationIds || !Array.isArray(registrationIds) || registrationIds.length === 0) {
      return ApiResponse.badRequest(res, 'registrationIds array is required and must not be empty');
    }

    if (action !== 'mark' && action !== 'unmark') {
      return ApiResponse.badRequest(res, 'action must be "mark" or "unmark"');
    }
    const requestedDayNumber = parseRequestedDayNumber(dayNumber);
    if (Number.isNaN(requestedDayNumber)) {
      return ApiResponse.badRequest(res, 'dayNumber must be a positive integer');
    }
    const defaultDayNumber = requestedDayNumber ?? 1;

    const invalidRegistrationId = registrationIds.find((registrationId) => !uuidSchema.safeParse(registrationId).success);
    if (invalidRegistrationId) {
      return ApiResponse.badRequest(res, `Invalid registration ID format: ${invalidRegistrationId}`);
    }

    const registrations = await prisma.eventRegistration.findMany({
      where: { id: { in: registrationIds } },
      include: {
        user: { select: { id: true, name: true } },
        event: { select: { eventDays: true } },
        dayAttendances: {
          where: { dayNumber: defaultDayNumber },
          select: { dayNumber: true, attended: true },
        },
      },
    });

    const regMap = new Map(registrations.map((registration) => [registration.id, registration]));
    const registrationsWithDay = registrationIds
      .map((registrationId) => regMap.get(registrationId))
      .filter((registration): registration is (typeof registrations)[number] => !!registration)
      .map((registration) => {
        const eventDays = normalizeEventDays(registration.event.eventDays);
        const effectiveDayNumber = resolveEffectiveDayNumber(defaultDayNumber, eventDays, true);
        return { registration, effectiveDayNumber };
      });

    const invalidDayTarget = registrationsWithDay.find((item) => !item.effectiveDayNumber || Number.isNaN(item.effectiveDayNumber));
    if (invalidDayTarget) {
      const maxEventDays = normalizeEventDays(invalidDayTarget.registration.event.eventDays);
      return ApiResponse.badRequest(
        res,
        `dayNumber must be between 1 and ${maxEventDays} for ${invalidDayTarget.registration.user.name}`,
      );
    }

    const registrationsToUpdate = registrationIds
      .map((registrationId) => regMap.get(registrationId))
      .filter((registration): registration is (typeof registrations)[number] => {
        if (!registration) {
          return false;
        }

        const currentDay = registration.dayAttendances[0];
        return action === 'mark'
          ? !currentDay?.attended
          : !!currentDay?.attended;
      });

    const skipped = registrationIds.length - registrationsToUpdate.length;
    const markScannedAt = action === 'mark' ? new Date() : null;
    const applied: Array<{ registration: (typeof registrations)[number]; dayNumber: number }> = [];

    try {
      await withRetry(() => prisma.$transaction(async (tx) => {
        for (const registration of registrationsToUpdate) {
          const eventDays = normalizeEventDays(registration.event.eventDays);
          const effectiveDayNumber = resolveEffectiveDayNumber(defaultDayNumber, eventDays, true);
          if (!effectiveDayNumber || Number.isNaN(effectiveDayNumber)) {
            throw new AttendanceBulkUpdateConflictError('Invalid day number for one or more selected registrations');
          }

          if (action === 'mark' && markScannedAt) {
            const outcome = await markDayAttendanceAtomic(tx, {
              registrationId: registration.id,
              dayNumber: effectiveDayNumber,
              scannedAt: markScannedAt,
              scannedBy: admin.id,
              manualOverride: true,
            });
            if (outcome === 'duplicate') {
              throw new AttendanceBulkUpdateConflictError('Attendance state changed during bulk update');
            }
          } else {
            const outcome = await unmarkDayAttendanceAtomic(tx, {
              registrationId: registration.id,
              dayNumber: effectiveDayNumber,
            });
            if (outcome === 'not-marked') {
              throw new AttendanceBulkUpdateConflictError('Attendance state changed during bulk update');
            }
          }

          applied.push({ registration, dayNumber: effectiveDayNumber });
        }
      }));
    } catch (error) {
      if (error instanceof AttendanceBulkUpdateConflictError) {
        return ApiResponse.conflict(res, 'Attendance changed while the bulk update was running. Please retry.');
      }

      throw error;
    }

    for (const item of applied) {
      await syncRegistrationAttendance(item.registration.id);
      if (action === 'mark' && markScannedAt) {
        getIO()?.of('/attendance').to(`event:${item.registration.eventId}`).emit('attendance:marked', {
          registrationId: item.registration.id,
          userId: item.registration.user.id,
          userName: item.registration.user.name,
          dayNumber: item.dayNumber,
          scannedAt: markScannedAt,
          scannedBy: admin.id,
        });
      } else {
        getIO()?.of('/attendance').to(`event:${item.registration.eventId}`).emit('attendance:unmarked', {
          registrationId: item.registration.id,
          userId: item.registration.user.id,
          userName: item.registration.user.name,
          dayNumber: item.dayNumber,
        });
      }
    }

    const updated = applied.length;
    if (applied.length > 0) {
      const byEvent = new Map<string, string[]>();
      for (const item of applied) {
        const ids = byEvent.get(item.registration.eventId) || [];
        ids.push(item.registration.id);
        byEvent.set(item.registration.eventId, ids);
      }
      for (const [eventKey, ids] of byEvent.entries()) {
        getIO()?.of('/attendance').to(`event:${eventKey}`).emit('attendance:bulk', {
          registrationIds: ids,
          action,
          dayNumber: defaultDayNumber,
        });
      }
    }

    await auditLog(admin.id, 'ATTENDANCE_BULK_UPDATE', 'eventRegistration', undefined, {
      action,
      dayNumber: defaultDayNumber,
      total: registrationIds.length,
      updated,
      skipped,
    });

    return ApiResponse.success(res, {
      action,
      total: registrationIds.length,
      updated,
      skipped,
    });
  } catch (error) {
    logger.error('Failed to bulk update attendance', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to bulk update attendance');
  }
});

// ────────────────────────────────────────────────────────────
// 8. PATCH /edit/:registrationId — Edit attendance record
// ────────────────────────────────────────────────────────────
router.patch('/edit/:registrationId', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) {
      return ApiResponse.unauthorized(res);
    }

    const { registrationId } = req.params;
    if (!requireUuid(res, registrationId, 'registration ID')) {
      return;
    }

    const registration = await prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: {
        event: { select: { eventDays: true } },
      },
    });

    if (!registration) {
      return ApiResponse.notFound(res, 'Registration not found');
    }

    const { scannedAt, manualOverride, dayNumber } = req.body as { scannedAt?: string | null; manualOverride?: boolean; dayNumber?: number };
    const eventDays = normalizeEventDays(registration.event.eventDays);
    const effectiveDayNumber = resolveEffectiveDayNumber(dayNumber, eventDays, true);
    if (!effectiveDayNumber || Number.isNaN(effectiveDayNumber)) {
      return ApiResponse.badRequest(res, `dayNumber must be between 1 and ${eventDays}`);
    }

    const updateData: Record<string, unknown> = {};
    let shouldMarkAttended: boolean | undefined;

    if (scannedAt !== undefined) {
      if (scannedAt === null || scannedAt === '') {
        updateData.scannedAt = null;
        shouldMarkAttended = false;
      } else if (typeof scannedAt !== 'string') {
        return ApiResponse.badRequest(res, 'scannedAt must be an ISO string, empty string, or null');
      } else {
        const parsed = new Date(scannedAt);
        if (Number.isNaN(parsed.getTime())) {
          return ApiResponse.badRequest(res, 'scannedAt must be a valid ISO date string');
        }

        const nowMs = Date.now();
        const parsedMs = parsed.getTime();
        if (
          parsedMs > nowMs + CLIENT_SCAN_FUTURE_TOLERANCE_MS ||
          parsedMs < nowMs - CLIENT_SCAN_MAX_AGE_MS
        ) {
          return ApiResponse.badRequest(res, 'scannedAt must be within the last 24 hours and not in the future');
        }

        updateData.scannedAt = parsed;
        shouldMarkAttended = true;
      }
    }

    if (manualOverride !== undefined) {
      updateData.manualOverride = manualOverride;
    }

    if (Object.keys(updateData).length === 0) {
      return ApiResponse.badRequest(res, 'At least one field (scannedAt, manualOverride) must be provided');
    }

    const existingDay = await prisma.dayAttendance.findUnique({
      where: {
        registrationId_dayNumber: {
          registrationId,
          dayNumber: effectiveDayNumber,
        },
      },
    });

    if (!existingDay) {
      await prisma.dayAttendance.create({
        data: {
          registrationId,
          dayNumber: effectiveDayNumber,
          attended: shouldMarkAttended ?? false,
          scannedAt: (updateData.scannedAt as Date | null | undefined) ?? null,
          scannedBy: shouldMarkAttended ? admin.id : null,
          manualOverride: typeof updateData.manualOverride === 'boolean' ? updateData.manualOverride : false,
        },
      });
    } else {
      await prisma.dayAttendance.update({
        where: {
          registrationId_dayNumber: {
            registrationId,
            dayNumber: effectiveDayNumber,
          },
        },
        data: {
          ...(updateData.scannedAt !== undefined && { scannedAt: updateData.scannedAt as Date | null }),
          ...(updateData.manualOverride !== undefined && { manualOverride: updateData.manualOverride as boolean }),
          ...(shouldMarkAttended !== undefined && { attended: shouldMarkAttended }),
          ...(shouldMarkAttended === false && { scannedBy: null }),
          ...(shouldMarkAttended === true && { scannedBy: admin.id }),
        },
      });
    }

    await syncRegistrationAttendance(registrationId);

    const updated = await prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: {
        dayAttendances: {
          orderBy: { dayNumber: 'asc' },
        },
      },
    });

    await auditLog(admin.id, 'ATTENDANCE_EDIT', 'eventRegistration', registrationId, {
      eventId: registration.eventId,
      dayNumber: effectiveDayNumber,
      changes: updateData,
    });

    return ApiResponse.success(res, updated);
  } catch (error) {
    logger.error('Failed to edit attendance record', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to edit attendance record');
  }
});

// ────────────────────────────────────────────────────────────
// 9. POST /regenerate-token/:registrationId — Regenerate token
// ────────────────────────────────────────────────────────────
router.post('/regenerate-token/:registrationId', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) {
      return ApiResponse.unauthorized(res);
    }

    const { registrationId } = req.params;

    const registration = await prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    if (!registration) {
      return ApiResponse.notFound(res, 'Registration not found');
    }

    const newToken = generateAttendanceToken(registration.userId, registration.eventId, registration.id);

    await prisma.eventRegistration.update({
      where: { id: registrationId },
      data: {
        attendanceToken: newToken,
      },
    });

    await auditLog(admin.id, 'ATTENDANCE_REGENERATE_TOKEN', 'eventRegistration', registrationId, {
      eventId: registration.eventId,
      userId: registration.userId,
      userName: registration.user.name,
    });

    return ApiResponse.success(res, {
      registrationId,
      attendanceToken: newToken,
      userName: registration.user.name,
    });
  } catch (error) {
    logger.error('Failed to regenerate attendance token', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to regenerate attendance token');
  }
});

// ────────────────────────────────────────────────────────────
// 10. POST /regenerate-tokens/event/:eventId — Regenerate all tokens for an event
// ────────────────────────────────────────────────────────────
router.post('/regenerate-tokens/event/:eventId', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) {
      return ApiResponse.unauthorized(res);
    }

    const { eventId } = req.params;
    if (!requireUuid(res, eventId, 'event ID')) {
      return;
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true },
    });

    if (!event) {
      return ApiResponse.notFound(res, 'Event not found');
    }

    const registrations = await prisma.eventRegistration.findMany({
      where: { eventId },
      select: {
        id: true,
        userId: true,
        eventId: true,
      },
    });

    if (registrations.length === 0) {
      return ApiResponse.success(res, {
        eventId,
        regenerated: 0,
        total: 0,
        message: 'No registrations found for this event',
      });
    }

    let regenerated = 0;
    for (let index = 0; index < registrations.length; index += ATTENDANCE_REGENERATE_BATCH_SIZE) {
      const batch = registrations.slice(index, index + ATTENDANCE_REGENERATE_BATCH_SIZE);

      await prisma.$transaction(
        batch.map((registration) =>
          prisma.eventRegistration.update({
            where: { id: registration.id },
            data: {
              attendanceToken: generateAttendanceToken(
                registration.userId,
                registration.eventId,
                registration.id,
              ),
            },
          }),
        ),
      );

      regenerated += batch.length;
    }

    await auditLog(admin.id, 'ATTENDANCE_REGENERATE_ALL_TOKENS', 'event', eventId, {
      eventTitle: event.title,
      regenerated,
      total: registrations.length,
    });

    return ApiResponse.success(res, {
      eventId,
      regenerated,
      total: registrations.length,
    });
  } catch (error) {
    logger.error('Failed to regenerate all attendance tokens', {
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to regenerate all attendance tokens');
  }
});

// ────────────────────────────────────────────────────────────
// 11. GET /search — Search registrations by name or email
// ────────────────────────────────────────────────────────────
router.get('/search', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const { q, eventId, page: pageParam } = req.query as { q?: string; eventId?: string; page?: string };

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return ApiResponse.badRequest(res, 'Search query (q) is required');
    }

    if (!eventId || typeof eventId !== 'string') {
      return ApiResponse.badRequest(res, 'eventId is required');
    }
    if (!requireUuid(res, eventId, 'event ID')) {
      return;
    }

    const searchTerm = q.trim();
    const page = Math.max(1, parseInt(pageParam || '1') || 1);
    const take = 15;
    const skip = (page - 1) * take;

    const where = {
      eventId,
      user: {
        OR: [
          { name: { contains: searchTerm, mode: 'insensitive' as const } },
          { email: { contains: searchTerm, mode: 'insensitive' as const } },
        ],
      },
    };

    const [registrations, total] = await Promise.all([
      prisma.eventRegistration.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, email: true, avatar: true },
          },
        },
        take,
        skip,
      }),
      prisma.eventRegistration.count({ where }),
    ]);

    const mapped = registrations.map((reg) => ({
      registrationId: reg.id,
      userName: reg.user.name,
      userEmail: reg.user.email,
      userAvatar: reg.user.avatar,
      registrationType: reg.registrationType,
      attended: reg.attended,
      scannedAt: reg.scannedAt,
      manualOverride: reg.manualOverride,
    }));

    return ApiResponse.success(res, { results: mapped, total, page, totalPages: Math.ceil(total / take) });
  } catch (error) {
    logger.error('Failed to search attendance', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to search attendance');
  }
});

// ────────────────────────────────────────────────────────────
// 11. GET /live/:eventId — Live attendance stats
// ────────────────────────────────────────────────────────────
router.get('/live/:eventId', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    if (!requireUuid(res, eventId, 'event ID')) {
      return;
    }

    const [event, total, attended, dayStats, recentScans] = await Promise.all([
      prisma.event.findUnique({
        where: { id: eventId },
        select: { eventDays: true, dayLabels: true },
      }),
      // Hard Constraint #11: live attendance reflects participant lane only.
      prisma.eventRegistration.count({
        where: { eventId, ...participantsOnly },
      }),
      prisma.eventRegistration.count({
        where: { eventId, ...participantsOnly, attended: true },
      }),
      prisma.dayAttendance.groupBy({
        by: ['dayNumber'],
        where: {
          attended: true,
          // Hard Constraint #11: keep day stats consistent with the participant-only total/attended counts above.
          registration: { eventId, ...participantsOnly },
        },
        _count: { id: true },
        orderBy: { dayNumber: 'asc' },
      }),
      prisma.dayAttendance.findMany({
        where: {
          // Hard Constraint #11: recent-scans surface only participant lane to match dashboard totals.
          registration: { eventId, ...participantsOnly },
          attended: true,
        },
        include: {
          registration: {
            select: {
              id: true,
              user: {
                select: { id: true, name: true, avatar: true },
              },
            },
          },
        },
        orderBy: { scannedAt: 'desc' },
        take: 10,
      }),
    ]);

    if (!event) {
      return ApiResponse.notFound(res, 'Event not found');
    }

    const eventDays = normalizeEventDays(event.eventDays);
    const dayLabels = parseDayLabels(event.dayLabels, eventDays);
    const notAttended = total - attended;
    const attendanceRate = total > 0 ? Math.round((attended / total) * 100 * 100) / 100 : 0;

    return ApiResponse.success(res, {
      total,
      attended,
      notAttended,
      eventDays,
      dayLabels,
      dayStats: dayStats.map((day) => ({
        dayNumber: day.dayNumber,
        count: day._count.id,
      })),
      recentScans: recentScans.map((r) => ({
        registrationId: r.registration.id,
        userId: r.registration.user.id,
        userName: r.registration.user.name,
        userAvatar: r.registration.user.avatar,
        dayNumber: r.dayNumber,
        scannedAt: r.scannedAt,
        manualOverride: r.manualOverride,
      })),
      attendanceRate,
    });
  } catch (error) {
    logger.error('Failed to get live attendance', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to get live attendance');
  }
});

// ────────────────────────────────────────────────────────────
// 12. GET /event/:eventId/full — Full attendance list
// ────────────────────────────────────────────────────────────
router.get('/event/:eventId/full', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    if (!requireUuid(res, eventId, 'event ID')) {
      return;
    }

    const [event, totalRegistrations] = await Promise.all([
      prisma.event.findUnique({
        where: { id: eventId },
        select: { eventDays: true, dayLabels: true },
      }),
      prisma.eventRegistration.count({ where: { eventId } }),
    ]);

    if (!event) {
      return ApiResponse.notFound(res, 'Event not found');
    }

    if (totalRegistrations > ATTENDANCE_FULL_LIST_LIMIT) {
      return ApiResponse.badRequest(
        res,
        `Full attendance list is limited to ${ATTENDANCE_FULL_LIST_LIMIT} registrations. Use search or export for larger events.`,
      );
    }

    const registrations = await prisma.eventRegistration.findMany({
      where: { eventId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            branch: true,
            year: true,
          },
        },
        dayAttendances: {
          orderBy: { dayNumber: 'asc' },
        },
        invitation: {
          select: {
            role: true,
          },
        },
      },
      orderBy: [
        { attended: 'desc' },
        { scannedAt: 'desc' },
        { timestamp: 'desc' },
      ],
    });

    const eventDays = normalizeEventDays(event.eventDays);
    const dayLabels = parseDayLabels(event.dayLabels, eventDays);

    return ApiResponse.success(res, { registrations, eventDays, dayLabels });
  } catch (error) {
    logger.error('Failed to get full attendance list', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to get full attendance list');
  }
});

// ────────────────────────────────────────────────────────────
// 13. GET /event/:eventId/export — Export attendance to Excel
// ────────────────────────────────────────────────────────────
router.get('/event/:eventId/export', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    if (!requireUuid(res, eventId, 'event ID')) {
      return;
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { title: true, eventDays: true, dayLabels: true },
    });

    if (!event) {
      return ApiResponse.notFound(res, 'Event not found');
    }

    const eventDays = normalizeEventDays(event.eventDays);
    const dayLabels = parseDayLabels(event.dayLabels, eventDays);
    const requestedDayNumber = resolveEffectiveDayNumber(req.query.dayNumber, eventDays, false);
    if (Number.isNaN(requestedDayNumber)) {
      return ApiResponse.badRequest(res, `dayNumber must be between 1 and ${eventDays}`);
    }

    const totalRegistrations = await prisma.eventRegistration.count({ where: { eventId } });
    if (totalRegistrations > ATTENDANCE_EXPORT_LIMIT) {
      return ApiResponse.badRequest(
        res,
        `Attendance export is limited to ${ATTENDANCE_EXPORT_LIMIT} registrations per request.`,
      );
    }

    const registrations = await prisma.eventRegistration.findMany({
      where: { eventId },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            branch: true,
            year: true,
            phone: true,
          },
        },
        dayAttendances: {
          orderBy: { dayNumber: 'asc' },
        },
        invitation: {
          select: {
            role: true,
          },
        },
      },
      orderBy: [
        { attended: 'desc' },
        { scannedAt: 'desc' },
        { timestamp: 'desc' },
      ],
    });

    const workbook = new ExcelJS.Workbook();

    const columns: Array<{ header: string; key: string; width: number }> = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Year', key: 'year', width: 10 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Registration Type', key: 'registrationType', width: 18 },
      { header: 'Guest Role', key: 'guestRole', width: 22 },
      { header: 'Attended', key: 'attended', width: 12 },
      { header: 'Scanned At', key: 'scannedAt', width: 22 },
      { header: 'Manual Override', key: 'manualOverride', width: 16 },
      { header: 'Registered At', key: 'registeredAt', width: 22 },
    ];

    const includeDayColumns = eventDays > 1 || !!requestedDayNumber;
    const targetDays = requestedDayNumber
      ? [requestedDayNumber]
      : Array.from({ length: eventDays }, (_, index) => index + 1);

    if (includeDayColumns) {
      for (const dayNumber of targetDays) {
        const dayKeyPrefix = `day${dayNumber}`;
        const dayLabel = dayLabels[dayNumber - 1] || `Day ${dayNumber}`;
        columns.push(
          { header: `${dayLabel} Present`, key: `${dayKeyPrefix}Attended`, width: 16 },
          { header: `${dayLabel} Scanned At`, key: `${dayKeyPrefix}ScannedAt`, width: 24 },
          { header: `${dayLabel} Manual`, key: `${dayKeyPrefix}Manual`, width: 16 },
        );
      }
      if (!requestedDayNumber && eventDays > 1) {
        columns.push({ header: 'Days Attended', key: 'daysAttended', width: 14 });
      }
    }

    const buildWorksheet = (
      sheetName: string,
      rows: typeof registrations,
    ) => {
      const worksheet = workbook.addWorksheet(sheetName);
      worksheet.columns = columns;

      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.commit();

      for (const reg of rows) {
        const row: Record<string, string> = {
          name: reg.user.name,
          email: reg.user.email,
          branch: reg.user.branch || '',
          year: reg.user.year || '',
          phone: reg.user.phone || '',
          attended: reg.attended ? 'Yes' : 'No',
          scannedAt: reg.scannedAt ? reg.scannedAt.toISOString() : '',
          manualOverride: reg.manualOverride ? 'Yes' : 'No',
          registeredAt: reg.timestamp.toISOString(),
          registrationType: reg.registrationType,
          guestRole: reg.invitation?.role || '',
        };

        if (includeDayColumns) {
          const dayMap = new Map(reg.dayAttendances.map((dayAttendance) => [dayAttendance.dayNumber, dayAttendance]));
          let daysAttended = 0;
          for (const dayNumber of targetDays) {
            const dayKeyPrefix = `day${dayNumber}`;
            const dayAttendance = dayMap.get(dayNumber);
            const isAttended = dayAttendance?.attended === true;
            if (isAttended) {
              daysAttended += 1;
            }
            row[`${dayKeyPrefix}Attended`] = isAttended ? 'Yes' : 'No';
            row[`${dayKeyPrefix}ScannedAt`] = dayAttendance?.scannedAt ? dayAttendance.scannedAt.toISOString() : '';
            row[`${dayKeyPrefix}Manual`] = dayAttendance?.manualOverride ? 'Yes' : 'No';
          }
          if (!requestedDayNumber && eventDays > 1) {
            row.daysAttended = String(daysAttended);
          }
        }

        worksheet.addRow(row);
      }
    };

    buildWorksheet('Participants', registrations.filter(isParticipant));
    buildWorksheet('Guests', registrations.filter(isGuest));

    const safeTitle = event.title.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    const daySuffix = requestedDayNumber ? `_day_${requestedDayNumber}` : '';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="attendance_${safeTitle}${daySuffix}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('Failed to export attendance', { error: error instanceof Error ? error.message : String(error) });
    if (!res.headersSent) {
      return ApiResponse.internal(res, 'Failed to export attendance');
    }
  }
});

// ────────────────────────────────────────────────────────────
// 14. POST /email-absentees/:eventId — Email absentees
// ────────────────────────────────────────────────────────────
router.post('/email-absentees/:eventId', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) {
      return ApiResponse.unauthorized(res);
    }

    const { eventId } = req.params;
    const { subject, body, dayNumber } = req.body as { subject?: string; body?: string; dayNumber?: number };
    if (!requireUuid(res, eventId, 'event ID')) {
      return;
    }

    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      return ApiResponse.badRequest(res, 'subject is required');
    }

    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return ApiResponse.badRequest(res, 'body is required');
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { eventDays: true },
    });
    if (!event) {
      return ApiResponse.notFound(res, 'Event not found');
    }

    const eventDays = normalizeEventDays(event.eventDays);
    const effectiveDayNumber = resolveEffectiveDayNumber(dayNumber, eventDays, false);
    if (Number.isNaN(effectiveDayNumber)) {
      return ApiResponse.badRequest(res, `dayNumber must be between 1 and ${eventDays}`);
    }

    const settings = await getCachedSettings();
    if (settings && settings.mailingEnabled === false) {
      return ApiResponse.forbidden(res, 'Mailing is currently disabled');
    }

    const absentees = await prisma.eventRegistration.findMany({
      // Absentee outreach defaults to participant registrations so invited guests are not emailed like students.
      where: {
        eventId,
        ...participantsOnly,
        ...(effectiveDayNumber
          ? {
              dayAttendances: {
                none: {
                  dayNumber: effectiveDayNumber,
                  attended: true,
                },
              },
            }
          : {
              attended: false,
            }),
      },
      include: {
        user: {
          select: { name: true, email: true },
        },
        event: {
          select: { title: true },
        },
      },
    });

    if (absentees.length === 0) {
      return ApiResponse.success(res, {
        emailed: 0,
        sent: 0,
        message: 'No absentees found',
        ...(effectiveDayNumber ? { dayNumber: effectiveDayNumber } : {}),
      });
    }

    // Safety cap to prevent accidental mass email
    if (absentees.length > 250) {
      return ApiResponse.badRequest(res, `Too many absentees (${absentees.length}). Maximum 250 emails per request.`);
    }

    let sentCount = 0;
    let failedCount = 0;
    const failedEmails: Array<{ email: string; error: string }> = [];

    // Batched concurrent sending (batches of 10) to respect Brevo rate limits
    const BATCH_SIZE = 10;
    for (let i = 0; i < absentees.length; i += BATCH_SIZE) {
      const batch = absentees.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (reg) => {
          const personalizedBody = sanitizeHtml(body)
            .replace(/\{\{name\}\}/g, reg.user.name)
            .replace(/\{\{event\}\}/g, reg.event.title);

          const sent = await emailService.send({
            to: reg.user.email,
            subject: subject.trim(),
            html: personalizedBody,
            category: 'admin_mail',
          });
          if (!sent) {
            throw new Error('Email delivery is currently unavailable');
          }

          return reg.user.email;
        }),
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          sentCount++;
        } else {
          const email = batch[j].user.email;
          const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
          logger.error('Failed to send absentee email', { email, error: errorMsg });
          failedEmails.push({ email, error: errorMsg });
          failedCount++;
        }
      }
    }

    await auditLog(admin.id, 'ATTENDANCE_EMAIL_ABSENTEES', 'event', eventId, {
      totalAbsentees: absentees.length,
      sent: sentCount,
      failed: failedCount,
      subject: subject.trim(),
      ...(effectiveDayNumber ? { dayNumber: effectiveDayNumber } : {}),
    });

    return ApiResponse.success(res, {
      emailed: sentCount,
      sent: sentCount,
      totalAbsentees: absentees.length,
      failed: failedCount,
      failedEmails,
      ...(effectiveDayNumber ? { dayNumber: effectiveDayNumber } : {}),
    });
  } catch (error) {
    logger.error('Failed to email absentees', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to email absentees');
  }
});

// ────────────────────────────────────────────────────────────
// 15. GET /event/:eventId/certificate-recipients — Get recipients for certificates
// ────────────────────────────────────────────────────────────
router.get('/event/:eventId/certificate-recipients', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    if (!requireUuid(res, eventId, 'event ID')) {
      return;
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { eventDays: true, dayLabels: true },
    });

    if (!event) {
      return ApiResponse.notFound(res, 'Event not found');
    }

    const eventDays = normalizeEventDays(event.eventDays);
    const dayLabels = parseDayLabels(event.dayLabels, eventDays);
    const minDaysValue = resolveEffectiveDayNumber(req.query.minDays, eventDays, false);
    const includeGuestNonAttendees = String(req.query.includeGuestNonAttendees || '').toLowerCase() === 'true';
    if (Number.isNaN(minDaysValue)) {
      return ApiResponse.badRequest(res, `minDays must be between 1 and ${eventDays}`);
    }

    const [registrations, guestInvitations, existingCerts] = await Promise.all([
      prisma.eventRegistration.findMany({
        // Certificate participants remain the participant lane; guests are returned in a dedicated payload below.
        where: {
          eventId,
          ...participantsOnly,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          dayAttendances: {
            orderBy: { dayNumber: 'asc' },
          },
        },
      }),
      prisma.eventInvitation.findMany({
        where: {
          eventId,
          status: 'ACCEPTED',
          registrationId: { not: null },
        },
        include: {
          inviteeUser: {
            select: {
              id: true,
              email: true,
              networkProfile: {
                select: {
                  fullName: true,
                  designation: true,
                  company: true,
                },
              },
            },
          },
          registration: {
            select: {
              id: true,
              attended: true,
            },
          },
        },
      }),
      prisma.certificate.findMany({
        where: {
          eventId,
          isRevoked: false,
        },
        orderBy: { issuedAt: 'desc' },
        select: {
          id: true,
          recipientEmail: true,
          certId: true,
          type: true,
          pdfUrl: true,
          emailSent: true,
          emailSentAt: true,
        },
      }),
    ]);

    // Map existing certs by email for quick lookup
    const certsByEmail = new Map<string, (typeof existingCerts)[number]>();
    for (const cert of existingCerts) {
      const normalizedEmail = cert.recipientEmail.toLowerCase();
      if (!certsByEmail.has(normalizedEmail)) {
        certsByEmail.set(normalizedEmail, cert);
      }
    }

    const allRecipients = registrations.map((reg) => {
      const existingCert = certsByEmail.get(reg.user.email.toLowerCase()) || null;
      const daysAttended = reg.dayAttendances.filter((attendanceDay) => attendanceDay.attended).length;
      return {
        registrationId: reg.id,
        userId: reg.user.id,
        userName: reg.user.name,
        userEmail: reg.user.email,
        userAvatar: reg.user.avatar,
        attended: reg.attended,
        scannedAt: reg.scannedAt,
        manualOverride: reg.manualOverride,
        dayAttendances: reg.dayAttendances,
        daysAttended,
        hasCertificate: !!existingCert,
        certificateId: existingCert?.certId || null,
        certificateType: existingCert?.type || null,
        certificateDbId: existingCert?.id || null,
        certificatePdfUrl: existingCert?.pdfUrl || null,
        emailSent: existingCert?.emailSent || false,
        emailSentAt: existingCert?.emailSentAt || null,
      };
    });

    const recipients = minDaysValue
      ? allRecipients.filter((recipient) => recipient.daysAttended >= minDaysValue)
      : allRecipients;

    const guests = guestInvitations
      .filter((invitation) => Boolean(invitation.inviteeUserId && invitation.inviteeUser && invitation.registration))
      .filter((invitation) => includeGuestNonAttendees || invitation.registration?.attended)
      .map((invitation) => {
        const email = invitation.inviteeUser!.email.toLowerCase();
        const existingCert = certsByEmail.get(email) || null;
        return {
          invitationId: invitation.id,
          userId: invitation.inviteeUserId!,
          name: invitation.inviteeUser?.networkProfile?.fullName || invitation.inviteeNameSnapshot || invitation.inviteeUser?.email || 'Guest',
          email: invitation.inviteeUser!.email,
          designation: invitation.inviteeUser?.networkProfile?.designation || invitation.inviteeDesignationSnapshot || null,
          role: invitation.role,
          attended: invitation.registration?.attended || false,
          certificateEnabled: invitation.certificateEnabled,
          certificateType: invitation.certificateType,
          existingCertificateId: existingCert?.id || null,
          certificateId: existingCert?.certId || null,
          emailSent: existingCert?.emailSent || false,
          emailSentAt: existingCert?.emailSentAt || null,
        };
      });

    const totalRegistered = registrations.length;
    const totalAttended = registrations.filter((r) => r.attended).length;
    const alreadyCertified = certsByEmail.size;

    return ApiResponse.success(res, {
      participants: recipients,
      guests,
      recipients,
      stats: {
        totalRegistered,
        totalAttended,
        alreadyCertified,
        eligibleRecipients: recipients.length,
        guestCount: guests.length,
      },
      eventDays,
      dayLabels,
      ...(minDaysValue ? { minDays: minDaysValue } : {}),
      ...(includeGuestNonAttendees ? { includeGuestNonAttendees: true } : {}),
    });
  } catch (error) {
    logger.error('Failed to get certificate recipients', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to get certificate recipients');
  }
});

// ────────────────────────────────────────────────────────────
// 16. GET /my-history — User's attended events history
// ────────────────────────────────────────────────────────────
router.get('/my-history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) {
      return ApiResponse.unauthorized(res);
    }

    const registrations = await prisma.eventRegistration.findMany({
      where: {
        userId: user.id,
        dayAttendances: {
          some: { attended: true },
        },
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            startDate: true,
            imageUrl: true,
            eventDays: true,
            dayLabels: true,
          },
        },
        dayAttendances: {
          where: { attended: true },
          orderBy: { dayNumber: 'asc' },
        },
      },
      orderBy: { scannedAt: 'desc' },
    });

    const events = registrations.map((reg) => ({
      ...(() => {
        const eventDays = normalizeEventDays(reg.event.eventDays);
        const dayLabels = parseDayLabels(reg.event.dayLabels, eventDays);
        const latestScannedAt = reg.dayAttendances
          .filter((dayAttendance) => dayAttendance.scannedAt)
          .sort((a, b) => (b.scannedAt?.getTime() || 0) - (a.scannedAt?.getTime() || 0))[0]?.scannedAt;
        return {
          eventDays,
          dayLabels,
          dayAttendances: reg.dayAttendances,
          daysAttended: reg.dayAttendances.length,
          scannedAt: (latestScannedAt ?? reg.scannedAt ?? reg.event.startDate),
        };
      })(),
      id: reg.id,
      event: {
        id: reg.event.id,
        title: reg.event.title,
        slug: reg.event.slug ?? reg.event.id,
        startDate: reg.event.startDate,
        imageUrl: reg.event.imageUrl,
      },
    }));

    return ApiResponse.success(res, { events });
  } catch (error) {
    logger.error('Failed to get attendance history', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to get attendance history');
  }
});

// ────────────────────────────────────────────────────────────
// 17. GET /event/:eventId/summary — Attendance summary (CORE_MEMBER+ only)
// ────────────────────────────────────────────────────────────
router.get('/event/:eventId/summary', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    if (!requireUuid(res, eventId, 'event ID')) {
      return;
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { eventDays: true, dayLabels: true },
    });

    if (!event) {
      return ApiResponse.notFound(res, 'Event not found');
    }

    const eventDays = normalizeEventDays(event.eventDays);
    const dayLabels = parseDayLabels(event.dayLabels, eventDays);

    const [total, attended, daySummary] = await Promise.all([
      // Hard Constraint #11: summary KPIs reflect the participant lane only.
      prisma.eventRegistration.count({
        where: { eventId, ...participantsOnly },
      }),
      prisma.eventRegistration.count({
        where: { eventId, ...participantsOnly, attended: true },
      }),
      Promise.all(
        Array.from({ length: eventDays }, (_, index) => index + 1).map(async (dayNumber) => ({
          dayNumber,
          attended: await prisma.dayAttendance.count({
            where: {
              dayNumber,
              attended: true,
              registration: { eventId, ...participantsOnly },
            },
          }),
        })),
      ),
    ]);

    return ApiResponse.success(res, { total, attended, eventDays, dayLabels, daySummary });
  } catch (error) {
    logger.error('Failed to get attendance summary', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to get attendance summary');
  }
});

// ────────────────────────────────────────────────────────────
// 18. POST /backfill-tokens — Backfill missing attendance tokens
// ────────────────────────────────────────────────────────────
router.post('/backfill-tokens', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const admin = getAuthUser(req);
    if (!admin) {
      return ApiResponse.unauthorized(res);
    }

    const registrations = await prisma.eventRegistration.findMany({
      where: {
        attendanceToken: null,
      },
      take: ATTENDANCE_BACKFILL_BATCH_SIZE + 1,
      include: {
        user: {
          select: { id: true },
        },
      },
    });

    const hasMore = registrations.length > ATTENDANCE_BACKFILL_BATCH_SIZE;
    const batch = hasMore
      ? registrations.slice(0, ATTENDANCE_BACKFILL_BATCH_SIZE)
      : registrations;

    if (batch.length === 0) {
      return ApiResponse.success(res, { backfilled: 0, message: 'No registrations need token backfill' });
    }

    let backfilled = 0;

    // Sequential to avoid overwhelming the DB
    // N+1: acceptable for one-time admin backfill operation
    for (const reg of batch) {
      const token = generateAttendanceToken(reg.userId, reg.eventId, reg.id);

      await prisma.eventRegistration.update({
        where: { id: reg.id },
        data: { attendanceToken: token },
      });

      backfilled++;
    }

    await auditLog(admin.id, 'ATTENDANCE_BACKFILL', 'eventRegistration', undefined, {
      totalBackfilled: backfilled,
      hasMore,
    });

    return ApiResponse.success(res, {
      backfilled,
      hasMore,
      message: hasMore
        ? `Backfilled ${backfilled} attendance tokens. Run this again to continue.`
        : `Backfilled ${backfilled} attendance tokens`,
    });
  } catch (error) {
    logger.error('Failed to backfill attendance tokens', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to backfill attendance tokens');
  }
});

export const attendanceRouter = router;
