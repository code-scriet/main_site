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
const CLIENT_SCAN_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const CLIENT_SCAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ATTENDANCE_FULL_LIST_LIMIT = 5000;
const ATTENDANCE_EXPORT_LIMIT = 10000;
const ATTENDANCE_BACKFILL_BATCH_SIZE = 1000;

class AttendanceBulkUpdateConflictError extends Error {}

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

function resolveClientScannedAt(scannedAtLocal?: string): Date {
  const now = new Date();
  if (!scannedAtLocal?.trim()) {
    return now;
  }

  const parsed = new Date(scannedAtLocal);
  if (Number.isNaN(parsed.getTime())) {
    return now;
  }

  const nowMs = now.getTime();
  const parsedMs = parsed.getTime();
  if (
    parsedMs > nowMs + CLIENT_SCAN_FUTURE_TOLERANCE_MS ||
    parsedMs < nowMs - CLIENT_SCAN_MAX_AGE_MS
  ) {
    return now;
  }

  return parsed;
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
          },
        },
      },
    });

    if (!registration) {
      return ApiResponse.notFound(res, 'Registration not found for this event');
    }

    return ApiResponse.success(res, {
      attendanceToken: registration.attendanceToken,
      attended: registration.attended,
      scannedAt: registration.scannedAt,
      event: registration.event,
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

    const { token, bypassWindow } = req.body as { token?: string; bypassWindow?: boolean };

    if (!token || typeof token !== 'string') {
      return ApiResponse.badRequest(res, 'Token is required');
    }

    let payload;
    try {
      payload = verifyAttendanceToken(token);
    } catch {
      return ApiResponse.badRequest(res, 'Invalid or expired attendance token');
    }

    const registration = await prisma.eventRegistration.findUnique({
      where: { id: payload.registrationId },
      include: {
        user: {
          select: { name: true },
        },
        event: {
          select: { title: true, startDate: true, endDate: true, status: true },
        },
      },
    });

    if (!registration) {
      return ApiResponse.notFound(res, 'Registration not found');
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

    // ATOMIC: check + update in one DB call. Zero race window.
    const scannedAt = new Date();
    const updated = await withRetry(() => prisma.eventRegistration.updateMany({
      where: { id: registration.id, attended: false },
      data: { attended: true, scannedAt },
    }));
    if (updated.count === 0) {
      return ApiResponse.conflict(res, `${registration.user.name} has already been scanned`);
    }

    // Socket emit
    getIO()?.of('/attendance').to(`event:${registration.eventId}`).emit('attendance:marked', {
      userId: payload.userId,
      userName: registration.user.name,
      scannedAt,
    });

    await auditLog(admin.id, 'ATTENDANCE_SCAN', 'eventRegistration', registration.id, {
      eventId: registration.eventId,
      userId: payload.userId,
      userName: registration.user.name,
    });

    return ApiResponse.success(res, {
      registrationId: registration.id,
      userName: registration.user.name,
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
      scans?: Array<{ token: string; scannedAtLocal?: string; localId: string }>;
      eventId?: string;
      bypassWindow?: boolean;
    };

    if (!scans || !Array.isArray(scans) || scans.length === 0) {
      return ApiResponse.badRequest(res, 'scans array is required and must not be empty');
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
      payload: { userId: string; eventId: string; registrationId: string };
    }> = [];

    for (const scan of scans) {
      let payload;
      try {
        payload = verifyAttendanceToken(scan.token);
      } catch {
        results.push({ localId: scan.localId, status: 'error', message: 'Invalid or expired token' });
        errCount++;
        continue;
      }

      if (payload.eventId !== eventId) {
        results.push({ localId: scan.localId, status: 'error', message: 'Token does not match event' });
        errCount++;
        continue;
      }

      verified.push({ localId: scan.localId, scannedAtLocal: scan.scannedAtLocal, payload });
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
        event: { select: { startDate: true, endDate: true, status: true } },
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

      // ATOMIC: check + update in one DB call. Zero race window.
      const updated = await withRetry(() => prisma.eventRegistration.updateMany({
        where: { id: registration.id, attended: false },
        data: { attended: true, scannedAt },
      }));

      if (updated.count === 0) {
        results.push({ localId: item.localId, status: 'duplicate', name: registration.user.name, message: 'Already scanned' });
        dupCount++;
        continue;
      }

      getIO()?.of('/attendance').to(`event:${eventId}`).emit('attendance:marked', {
        userId: item.payload.userId,
        userName: registration.user.name,
        scannedAt,
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
    let body: { authToken?: string; scans?: Array<{ token: string; scannedAtLocal?: string; localId: string }>; eventId?: string };
    try {
      body = JSON.parse(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    } catch {
      return res.status(400).send();
    }

    const { authToken, scans, eventId } = body;

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

    try {
      // sendBeacon is intentionally fire-and-forget, so per-item failures are logged
      // server-side and not surfaced back to the client after the 204 response.
      for (const scan of scans) {
        try {
          if (!scan || typeof scan !== 'object' || typeof scan.token !== 'string') {
            failedCount++;
            continue;
          }

          let payload;
          try {
            payload = verifyAttendanceToken(scan.token);
          } catch {
            failedCount++;
            continue;
          }

          if (payload.eventId !== eventId) {
            failedCount++;
            continue;
          }

          const scannedAt = resolveClientScannedAt(
            typeof scan.scannedAtLocal === 'string' ? scan.scannedAtLocal : undefined,
          );

          // ATOMIC: check + update in one DB call. Zero race window.
          const atomicResult = await withRetry(() => prisma.eventRegistration.updateMany({
            where: { id: payload.registrationId, attended: false },
            data: { attended: true, scannedAt },
          }));

          if (atomicResult.count === 0) {
            skippedCount++;
            continue;
          }

          processedCount++;

          // Fetch user name for socket emit (only for successful updates)
          const reg = await prisma.eventRegistration.findUnique({
            where: { id: payload.registrationId },
            select: { user: { select: { name: true } } },
          });

          if (reg?.user.name) {
            getIO()?.of('/attendance').to(`event:${eventId}`).emit('attendance:marked', {
              userId: payload.userId,
              userName: reg.user.name,
              scannedAt,
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

    const { registrationId } = req.body as { registrationId?: string };

    if (!requireUuid(res, registrationId, 'registration ID')) {
      return;
    }

    const registration = await prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    if (!registration) {
      return ApiResponse.notFound(res, 'Registration not found');
    }

    // ATOMIC: check + update in one DB call. Zero race window.
    const scannedAt = new Date();
    const updated = await withRetry(() => prisma.eventRegistration.updateMany({
      where: { id: registrationId, attended: false },
      data: { attended: true, scannedAt, manualOverride: true },
    }));
    if (updated.count === 0) {
      return ApiResponse.conflict(res, `${registration.user.name} has already been checked in`);
    }

    getIO()?.of('/attendance').to(`event:${registration.eventId}`).emit('attendance:marked', {
      userId: registration.user.id,
      userName: registration.user.name,
      scannedAt,
    });

    await auditLog(admin.id, 'ATTENDANCE_MANUAL', 'eventRegistration', registrationId, {
      eventId: registration.eventId,
      userId: registration.user.id,
      userName: registration.user.name,
    });

    return ApiResponse.success(res, {
      registrationId: registration.id,
      userName: registration.user.name,
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

    const { registrationId } = req.body as { registrationId?: string };

    if (!requireUuid(res, registrationId, 'registration ID')) {
      return;
    }

    const registration = await prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    if (!registration) {
      return ApiResponse.notFound(res, 'Registration not found');
    }

    if (!registration.attended) {
      return ApiResponse.badRequest(res, `${registration.user.name} is not marked as attended`);
    }

    const updated = await withRetry(() => prisma.eventRegistration.updateMany({
      where: { id: registrationId, attended: true },
      data: {
        attended: false,
        scannedAt: null,
        manualOverride: false,
      },
    }));
    if (updated.count === 0) {
      return ApiResponse.conflict(res, 'Attendance state changed while unmarking. Please retry.');
    }

    getIO()?.of('/attendance').to(`event:${registration.eventId}`).emit('attendance:unmarked', {
      userId: registration.user.id,
      userName: registration.user.name,
    });

    await auditLog(admin.id, 'ATTENDANCE_UNMARK', 'eventRegistration', registrationId, {
      eventId: registration.eventId,
      userId: registration.user.id,
      userName: registration.user.name,
    });

    return ApiResponse.success(res, {
      registrationId,
      userName: registration.user.name,
      attended: false,
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

    const { registrationIds, action } = req.body as { registrationIds?: string[]; action?: 'mark' | 'unmark' };

    if (!registrationIds || !Array.isArray(registrationIds) || registrationIds.length === 0) {
      return ApiResponse.badRequest(res, 'registrationIds array is required and must not be empty');
    }

    if (action !== 'mark' && action !== 'unmark') {
      return ApiResponse.badRequest(res, 'action must be "mark" or "unmark"');
    }
    const invalidRegistrationId = registrationIds.find((registrationId) => !uuidSchema.safeParse(registrationId).success);
    if (invalidRegistrationId) {
      return ApiResponse.badRequest(res, `Invalid registration ID format: ${invalidRegistrationId}`);
    }

    // Batch read all registrations upfront to avoid N+1
    const registrations = await prisma.eventRegistration.findMany({
      where: { id: { in: registrationIds } },
      include: { user: { select: { id: true, name: true } } },
    });
    const regMap = new Map(registrations.map((registration) => [registration.id, registration]));
    const registrationsToUpdate = registrationIds
      .map((registrationId) => regMap.get(registrationId))
      .filter((registration): registration is (typeof registrations)[number] => {
        if (!registration) {
          return false;
        }

        return action === 'mark' ? !registration.attended : registration.attended;
      });

    const skipped = registrationIds.length - registrationsToUpdate.length;
    const markScannedAt = action === 'mark' ? new Date() : null;

    try {
      await withRetry(() => prisma.$transaction(async (tx) => {
        for (const registration of registrationsToUpdate) {
          const result = await tx.eventRegistration.updateMany({
            where: {
              id: registration.id,
              attended: action === 'mark' ? false : true,
            },
            data: action === 'mark'
              ? {
                  attended: true,
                  scannedAt: markScannedAt,
                  manualOverride: true,
                }
              : {
                  attended: false,
                  scannedAt: null,
                  manualOverride: false,
                },
          });

          if (result.count === 0) {
            throw new AttendanceBulkUpdateConflictError('Attendance state changed during bulk update');
          }
        }
      }));
    } catch (error) {
      if (error instanceof AttendanceBulkUpdateConflictError) {
        return ApiResponse.conflict(res, 'Attendance changed while the bulk update was running. Please retry.');
      }

      throw error;
    }

    for (const registration of registrationsToUpdate) {
      if (action === 'mark' && markScannedAt) {
        getIO()?.of('/attendance').to(`event:${registration.eventId}`).emit('attendance:marked', {
          userId: registration.user.id,
          userName: registration.user.name,
          scannedAt: markScannedAt,
        });
      } else {
        getIO()?.of('/attendance').to(`event:${registration.eventId}`).emit('attendance:unmarked', {
          userId: registration.user.id,
          userName: registration.user.name,
        });
      }
    }

    const updated = registrationsToUpdate.length;

    await auditLog(admin.id, 'ATTENDANCE_BULK_UPDATE', 'eventRegistration', undefined, {
      action,
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
    });

    if (!registration) {
      return ApiResponse.notFound(res, 'Registration not found');
    }

    const { scannedAt, manualOverride } = req.body as { scannedAt?: string | null; manualOverride?: boolean };

    const updateData: Record<string, unknown> = {};

    if (scannedAt !== undefined) {
      if (scannedAt === null || scannedAt === '') {
        updateData.scannedAt = null;
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
      }
    }

    if (manualOverride !== undefined) {
      updateData.manualOverride = manualOverride;
    }

    if (Object.keys(updateData).length === 0) {
      return ApiResponse.badRequest(res, 'At least one field (scannedAt, manualOverride) must be provided');
    }

    const updated = await prisma.eventRegistration.update({
      where: { id: registrationId },
      data: updateData,
    });

    await auditLog(admin.id, 'ATTENDANCE_EDIT', 'eventRegistration', registrationId, {
      eventId: registration.eventId,
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
// 10. GET /search — Search registrations by name or email
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

    const [total, attended, recentScans] = await Promise.all([
      prisma.eventRegistration.count({
        where: { eventId },
      }),
      prisma.eventRegistration.count({
        where: { eventId, attended: true },
      }),
      prisma.eventRegistration.findMany({
        where: { eventId, attended: true },
        include: {
          user: {
            select: { id: true, name: true, avatar: true },
          },
        },
        orderBy: { scannedAt: 'desc' },
        take: 10,
      }),
    ]);

    const notAttended = total - attended;
    const attendanceRate = total > 0 ? Math.round((attended / total) * 100 * 100) / 100 : 0;

    return ApiResponse.success(res, {
      total,
      attended,
      notAttended,
      recentScans: recentScans.map((r) => ({
        registrationId: r.id,
        userId: r.user.id,
        userName: r.user.name,
        userAvatar: r.user.avatar,
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

    const totalRegistrations = await prisma.eventRegistration.count({ where: { eventId } });
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
      },
      orderBy: [
        { attended: 'desc' },
        { scannedAt: 'desc' },
        { timestamp: 'desc' },
      ],
    });

    return ApiResponse.success(res, { registrations });
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
      select: { title: true },
    });

    if (!event) {
      return ApiResponse.notFound(res, 'Event not found');
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
      },
      orderBy: [
        { attended: 'desc' },
        { scannedAt: 'desc' },
        { timestamp: 'desc' },
      ],
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance');

    worksheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Year', key: 'year', width: 10 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Attended', key: 'attended', width: 12 },
      { header: 'Scanned At', key: 'scannedAt', width: 22 },
      { header: 'Manual Override', key: 'manualOverride', width: 16 },
      { header: 'Registered At', key: 'registeredAt', width: 22 },
    ];

    // Style header row bold
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.commit();

    for (const reg of registrations) {
      worksheet.addRow({
        name: reg.user.name,
        email: reg.user.email,
        branch: reg.user.branch || '',
        year: reg.user.year || '',
        phone: reg.user.phone || '',
        attended: reg.attended ? 'Yes' : 'No',
        scannedAt: reg.scannedAt ? reg.scannedAt.toISOString() : '',
        manualOverride: reg.manualOverride ? 'Yes' : 'No',
        registeredAt: reg.timestamp.toISOString(),
      });
    }

    const safeTitle = event.title.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="attendance_${safeTitle}.xlsx"`);

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
    const { subject, body } = req.body as { subject?: string; body?: string };
    if (!requireUuid(res, eventId, 'event ID')) {
      return;
    }

    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      return ApiResponse.badRequest(res, 'subject is required');
    }

    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return ApiResponse.badRequest(res, 'body is required');
    }

    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { mailingEnabled: true },
    });
    if (settings && settings.mailingEnabled === false) {
      return ApiResponse.forbidden(res, 'Mailing is currently disabled');
    }

    const absentees = await prisma.eventRegistration.findMany({
      where: {
        eventId,
        attended: false,
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
      return ApiResponse.success(res, { sent: 0, message: 'No absentees found' });
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
    });

    return ApiResponse.success(res, {
      totalAbsentees: absentees.length,
      sent: sentCount,
      failed: failedCount,
      failedEmails,
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

    const [registrations, existingCerts] = await Promise.all([
      prisma.eventRegistration.findMany({
        where: { eventId },
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

    const recipients = registrations.map((reg) => {
      const existingCert = certsByEmail.get(reg.user.email.toLowerCase()) || null;
      return {
        registrationId: reg.id,
        userId: reg.user.id,
        userName: reg.user.name,
        userEmail: reg.user.email,
        userAvatar: reg.user.avatar,
        attended: reg.attended,
        scannedAt: reg.scannedAt,
        manualOverride: reg.manualOverride,
        hasCertificate: !!existingCert,
        certificateId: existingCert?.certId || null,
        certificateType: existingCert?.type || null,
        certificateDbId: existingCert?.id || null,
        certificatePdfUrl: existingCert?.pdfUrl || null,
        emailSent: existingCert?.emailSent || false,
        emailSentAt: existingCert?.emailSentAt || null,
      };
    });

    const totalRegistered = registrations.length;
    const totalAttended = registrations.filter((r) => r.attended).length;
    const alreadyCertified = certsByEmail.size;

    return ApiResponse.success(res, {
      recipients,
      stats: {
        totalRegistered,
        totalAttended,
        alreadyCertified,
      },
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
        attended: true,
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            startDate: true,
            imageUrl: true,
          },
        },
      },
      orderBy: { scannedAt: 'desc' },
    });

    const events = registrations.map((reg) => ({
      id: reg.id,
      scannedAt: reg.scannedAt ?? reg.event.startDate,
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
// 17. GET /event/:eventId/summary — Public attendance summary
// ────────────────────────────────────────────────────────────
router.get('/event/:eventId/summary', async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    if (!requireUuid(res, eventId, 'event ID')) {
      return;
    }

    const [total, attended] = await Promise.all([
      prisma.eventRegistration.count({
        where: { eventId },
      }),
      prisma.eventRegistration.count({
        where: { eventId, attended: true },
      }),
    ]);

    return ApiResponse.success(res, { total, attended });
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
