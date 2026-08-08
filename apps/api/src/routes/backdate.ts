// Backdate console — retroactive event records, restricted to PRESIDENT / super admin.
//
// Why this exists: the club regularly needs to certify something that already
// happened — a guest who spoke at a workshop two years ago, a member whose
// attendance was never scanned because the QR flow didn't exist yet. Every organic
// path refuses that work by design: solo registration rejects a past event
// (routes/registrations.ts), guest invitation rejects a past event
// (routes/invitations.ts), and invitation-accept can only be performed by the invitee
// themselves. Those refusals are correct for members and must stay. This router is
// the narrow, audited, PRES/SA-only escape hatch that reconstructs the record instead.
//
// Design rules this router holds to:
//   1. Only the record's OWN effective date moves (registration.timestamp,
//      dayAttendance.scannedAt, invitation.invitedAt/respondedAt). createdAt columns
//      and every AuditLog row keep true wall-clock time, so a reconstruction is
//      always distinguishable from an organic record and always traceable.
//   2. Every backdated row carries `backdatedBy` — the acting admin, as a plain
//      string snapshot (audit A3) so it survives that admin's deletion.
//   3. No email, no bell notification, no socket push. These records describe the
//      past; announcing them to the member would be nonsense. Certificates are the
//      one thing the member should hear about, and those go through the normal
//      certificate flow (which keeps its own sendEmail toggle).
//   4. Capacity, registration windows and maxEventsPerUser are deliberately NOT
//      enforced. They govern live intake into an upcoming event; a finished event
//      has no seats left to protect and its registrations no longer count toward a
//      member's active-event limit anyway (see assertWithinActiveEventLimitInTx).

import { Router, Response } from 'express';
import type { Request } from '../lib/http.js';
import { z } from 'zod';
import { CertType, Prisma, RegistrationType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ApiResponse, ErrorCodes } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { auditLog } from '../utils/audit.js';
import { isPresidentOrSuperAdmin } from '../utils/superAdmin.js';
import { resolveBackdate } from '../utils/backdate.js';
import { createEventRegistrationInTx } from '../utils/registrationIntake.js';
import {
  editDayAttendance,
  normalizeEventDays,
  parseDayLabels,
  syncRegistrationAttendance,
} from '../utils/attendanceDomain.js';
import { executeSerializableTransaction, isSerializationConflict } from '../utils/transactionRetry.js';
import { requireUuid } from '../utils/idParams.js';
import { sanitizeText } from '../utils/sanitize.js';

export const backdateRouter = Router();

const certTypes = ['PARTICIPATION', 'COMPLETION', 'WINNER', 'SPEAKER', 'APPRECIATION'] as const;

/**
 * PRES/SA gate. `requireRole('ADMIN')` already admits PRESIDENT, so this is the real
 * authority check — a plain ADMIN must not be able to rewrite history. Applied as
 * router-level middleware so a future endpoint cannot be added without it.
 */
function requirePresidentOrSuperAdmin(req: Request, res: Response, next: () => void) {
  const authUser = getAuthUser(req);
  if (!isPresidentOrSuperAdmin(authUser)) {
    return ApiResponse.error(res, {
      code: ErrorCodes.FORBIDDEN,
      message: 'Backdated records can only be created by the President or super admin',
      status: 403,
    });
  }
  return next();
}

backdateRouter.use(authMiddleware, requireRole('ADMIN'), requirePresidentOrSuperAdmin);

const optionalText = (max: number) => z.string().max(max).optional().nullable();

/**
 * Describe exactly what a retro-registration write did. Worth spelling out because
 * the reuse path deliberately does NOT apply the requested date: telling the admin
 * "records were updated" while silently keeping the old timestamp would send them
 * away believing a correction landed when it didn't.
 */
function buildRetroRegistrationMessage(
  reused: boolean,
  retypedFrom: RegistrationType | null,
  markedDayCount: number,
): string {
  if (!reused) {
    return markedDayCount > 0
      ? `Registration recorded, and marked present on ${markedDayCount} day${markedDayCount === 1 ? '' : 's'}.`
      : 'Registration recorded.';
  }

  const parts = ['That person was already registered, so their existing registration date was kept'];
  if (retypedFrom) parts.push(`their type was changed from ${retypedFrom} to match`);
  if (markedDayCount > 0) parts.push(`attendance was recorded for ${markedDayCount} day${markedDayCount === 1 ? '' : 's'}`);
  return `${parts.join('; ')}. Remove and re-add them if the registration date itself needs to change.`;
}

const retroRegistrationSchema = z.object({
  // Identify the person by account id or by email — the console resolves whichever
  // the admin has. An email with no matching account is rejected rather than
  // inventing a user: a registration must point at a real User row.
  userId: z.string().uuid().optional().nullable(),
  email: z.string().email().transform((v) => v.trim().toLowerCase()).optional().nullable(),
  registrationType: z.enum(['PARTICIPANT', 'GUEST']).default('PARTICIPANT'),
  registeredAt: z.string().min(4).max(40),
  reason: optionalText(300),

  // GUEST only — reconstructs the matching EventInvitation so the person shows up in
  // the event's guest list, not just as an unexplained registration.
  guestRole: optionalText(50),
  guestDesignation: optionalText(200),
  guestCompany: optionalText(200),
  certificateType: z.enum(certTypes).optional().nullable(),

  // Optional attendance to record in the same operation — the common case is
  // "this speaker was there on day 1", and making it one call keeps the two records
  // consistent instead of relying on the admin to remember a second step.
  attendedDays: z.array(z.number().int().min(1).max(10)).max(10).optional(),
}).refine((value) => Boolean(value.userId || value.email), {
  message: 'Either userId or email is required',
  path: ['email'],
});

const retroAttendanceSchema = z.object({
  dayNumber: z.number().int().min(1).max(10),
  attended: z.boolean(),
  // Required when attended=true; ignored on an unmark.
  scannedAt: z.string().min(4).max(40).optional().nullable(),
  reason: optionalText(300),
});

// ──────────────────────────────────────────────────────────────────
// GET /api/backdate/event/:eventId
// The console's single read: the event, its registrations (with per-day attendance
// and retro markers) and its guest invitations.
// ──────────────────────────────────────────────────────────────────
backdateRouter.get('/event/:eventId', async (req: Request, res: Response) => {
  const { eventId } = req.params;
  if (!requireUuid(res, eventId, 'event ID')) {
    return;
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        startDate: true,
        endDate: true,
        eventDays: true,
        dayLabels: true,
      },
    });

    if (!event) {
      return ApiResponse.notFound(res, 'Event not found');
    }

    const eventDays = normalizeEventDays(event.eventDays);

    const [registrations, invitations] = await Promise.all([
      prisma.eventRegistration.findMany({
        where: { eventId },
        // Bounded: the console is a surgical tool, not a bulk browser. The full
        // registrant table already lives at /admin/event-registrations/:eventId.
        take: 500,
        orderBy: { timestamp: 'asc' },
        select: {
          id: true,
          timestamp: true,
          registrationType: true,
          attended: true,
          backdatedBy: true,
          user: { select: { id: true, name: true, email: true, avatar: true } },
          dayAttendances: {
            orderBy: { dayNumber: 'asc' },
            select: { dayNumber: true, attended: true, scannedAt: true, backdatedBy: true },
          },
        },
      }),
      prisma.eventInvitation.findMany({
        where: { eventId },
        take: 200,
        orderBy: { invitedAt: 'asc' },
        select: {
          id: true,
          status: true,
          role: true,
          inviteeEmail: true,
          inviteeNameSnapshot: true,
          invitedAt: true,
          respondedAt: true,
          backdatedBy: true,
          certificateType: true,
          registrationId: true,
          inviteeUser: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    return ApiResponse.success(res, {
      event: {
        ...event,
        eventDays,
        dayLabels: parseDayLabels(event.dayLabels, eventDays),
      },
      registrations,
      invitations,
    });
  } catch (error) {
    logger.error('Failed to load backdate event snapshot', {
      eventId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to load event records');
  }
});

// ──────────────────────────────────────────────────────────────────
// POST /api/backdate/event/:eventId/registration
// Reconstruct a registration (and, for a guest, its accepted invitation) on an
// event that has already happened.
// ──────────────────────────────────────────────────────────────────
backdateRouter.post('/event/:eventId/registration', async (req: Request, res: Response) => {
  const authUser = getAuthUser(req)!;
  const { eventId } = req.params;
  if (!requireUuid(res, eventId, 'event ID')) {
    return;
  }

  const validation = retroRegistrationSchema.safeParse(req.body);
  if (!validation.success) {
    return ApiResponse.badRequest(res, validation.error.errors[0].message);
  }

  const {
    userId, email, registrationType, registeredAt, reason,
    guestRole, guestDesignation, guestCompany, certificateType, attendedDays,
  } = validation.data;

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, startDate: true, eventDays: true },
    });
    if (!event) {
      return ApiResponse.notFound(res, 'Event not found');
    }

    const now = new Date();
    const resolution = resolveBackdate({ requested: registeredAt, now, eventStart: event.startDate });
    if (!resolution.ok) {
      return ApiResponse.badRequest(res, resolution.message);
    }
    const timestamp = resolution.at;
    // Only a genuine backdate gets the marker. An admin who uses this console to add
    // someone to a live event today produces an ordinary-looking row, which is right.
    const backdatedBy = resolution.isBackdated ? authUser.id : null;

    const target = userId
      ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, isDeleted: true } })
      : await prisma.user.findFirst({
          where: { email: { equals: email!, mode: 'insensitive' } },
          select: { id: true, name: true, email: true, isDeleted: true },
        });

    if (!target) {
      return ApiResponse.badRequest(
        res,
        'No account found for that person. They must have an account before a registration can be recorded for them.',
      );
    }
    if (target.isDeleted) {
      return ApiResponse.badRequest(res, 'That account is deleted — restore it before recording a registration.');
    }

    const eventDays = normalizeEventDays(event.eventDays);
    const requestedDays = Array.from(new Set(attendedDays ?? [])).filter((day) => day >= 1 && day <= eventDays);

    const wantedType = registrationType === 'GUEST' ? RegistrationType.GUEST : RegistrationType.PARTICIPANT;

    let created: {
      registrationId: string;
      invitationId: string | null;
      alreadyRegistered: boolean;
      retypedFrom: RegistrationType | null;
    };

    try {
      created = await executeSerializableTransaction(async (tx) => {
        const existing = await tx.eventRegistration.findUnique({
          where: { userId_eventId: { userId: target.id, eventId } },
          select: { id: true, registrationType: true },
        });

        // Idempotent on re-submit: an existing registration is reused rather than
        // 409'ing the admin out of the operation they actually care about. Its
        // `timestamp` is deliberately NOT rewritten — that column may hold a real
        // organic registration moment, and silently overwriting it would destroy a
        // true record to satisfy a retro form. The response says so explicitly.
        const registrationId = existing
          ? existing.id
          : (await createEventRegistrationInTx(tx, {
              userId: target.id,
              eventId,
              eventDays: event.eventDays,
              registrationType: wantedType,
              timestamp,
              backdatedBy,
            })).registration.id;

        // The type IS reconciled, unlike the timestamp. Leaving it alone would let an
        // ACCEPTED GUEST invitation point at a row still marked PARTICIPANT — the
        // organic accept flow refuses that combination outright (invitations.ts 409s
        // on an existing participant registration), and the certificate wizard's
        // Participants/Guests tabs plus every `participantsOnly` count key off this
        // column, so the speaker would surface in the participant list. The admin
        // named the type explicitly; honour it and report the change.
        let retypedFrom: RegistrationType | null = null;
        if (existing && existing.registrationType !== wantedType) {
          await tx.eventRegistration.update({
            where: { id: registrationId },
            data: { registrationType: wantedType },
          });
          retypedFrom = existing.registrationType;
        }

        let invitationId: string | null = null;
        if (registrationType === 'GUEST') {
          // Reconstruct the invitation as already-ACCEPTED: the guest did attend, so
          // a PENDING invitation on a finished event would be a record of something
          // that never resolved. respondedAt matches the registration moment.
          const existingInvitation = await tx.eventInvitation.findUnique({
            where: { eventId_inviteeUserId: { eventId, inviteeUserId: target.id } },
            select: { id: true },
          });

          const invitationData = {
            status: 'ACCEPTED' as const,
            role: sanitizeText(guestRole?.trim() || 'Guest').slice(0, 50),
            inviteeNameSnapshot: target.name?.slice(0, 200) ?? null,
            inviteeDesignationSnapshot: guestDesignation ? sanitizeText(guestDesignation).slice(0, 200) : null,
            inviteeCompanySnapshot: guestCompany ? sanitizeText(guestCompany).slice(0, 200) : null,
            certificateEnabled: true,
            certificateType: (certificateType ?? 'SPEAKER') as CertType,
            invitedAt: timestamp,
            respondedAt: timestamp,
            // An invitation cannot be both ACCEPTED and revoked; clear the stale
            // marker rather than leaving the row self-contradictory.
            revokedAt: null,
            registrationId,
            backdatedBy,
          };

          const invitation = existingInvitation
            ? await tx.eventInvitation.update({
                where: { id: existingInvitation.id },
                // NOTE: emailSent is NOT in this payload. A prior invitation may have
                // genuinely emailed the guest; resetting the flag would erase that and
                // make the admin's "resend" read as a first send.
                data: invitationData,
                select: { id: true },
              })
            : await tx.eventInvitation.create({
                data: {
                  ...invitationData,
                  eventId,
                  inviteeUserId: target.id,
                  inviteeEmail: target.email?.toLowerCase() ?? null,
                  invitedById: authUser.id,
                  // Fresh reconstruction: nothing was ever sent, and this router
                  // never sends, so the flag starts (and stays) false.
                  emailSent: false,
                },
                select: { id: true },
              });
          invitationId = invitation.id;
        }

        return { registrationId, invitationId, alreadyRegistered: Boolean(existing), retypedFrom };
      });
    } catch (error) {
      if (isSerializationConflict(error)) {
        return ApiResponse.conflict(res, 'Please try again — this event\'s records changed mid-write.');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return ApiResponse.conflict(res, 'A registration for this person and event already exists.');
      }
      throw error;
    }

    // Attendance is applied after the registration commits: editDayAttendance +
    // syncRegistrationAttendance are the established write seam and syncing reads
    // through the global client, so it cannot run inside the transaction above.
    const markedDays: number[] = [];
    for (const dayNumber of requestedDays) {
      await editDayAttendance(prisma, {
        registrationId: created.registrationId,
        dayNumber,
        editorId: authUser.id,
        attendance: { kind: 'mark', scannedAt: timestamp },
        manualOverride: true,
        backdatedBy,
      });
      markedDays.push(dayNumber);
    }
    if (markedDays.length > 0) {
      await syncRegistrationAttendance(created.registrationId);
    }

    await auditLog(authUser.id, 'BACKDATE_REGISTRATION_CREATE', 'eventRegistration', created.registrationId, {
      eventId,
      eventTitle: event.title,
      targetUserId: target.id,
      targetEmail: target.email,
      registrationType,
      backdatedTo: timestamp.toISOString(),
      isBackdated: Boolean(backdatedBy),
      reusedExistingRegistration: created.alreadyRegistered,
      retypedFrom: created.retypedFrom,
      invitationId: created.invitationId,
      markedDays,
      reason: reason ? sanitizeText(reason) : null,
    });

    logger.info('Backdated registration recorded', {
      eventId,
      registrationId: created.registrationId,
      targetUserId: target.id,
      by: authUser.id,
    });

    return ApiResponse.success(res, {
      registrationId: created.registrationId,
      invitationId: created.invitationId,
      // The ACTUAL date on the row, which is not the requested one when an existing
      // registration was reused — the client shows this, so it can't imply the
      // original date was rewritten.
      registeredAt: created.alreadyRegistered ? null : timestamp.toISOString(),
      markedDays,
      reusedExistingRegistration: created.alreadyRegistered,
      retypedFrom: created.retypedFrom,
    }, buildRetroRegistrationMessage(created.alreadyRegistered, created.retypedFrom, markedDays.length));
  } catch (error) {
    logger.error('Failed to record backdated registration', {
      eventId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to record the registration');
  }
});

// ──────────────────────────────────────────────────────────────────
// PATCH /api/backdate/registration/:registrationId/attendance
// Mark or unmark a single day with an explicit (backdated) timestamp.
// ──────────────────────────────────────────────────────────────────
backdateRouter.patch('/registration/:registrationId/attendance', async (req: Request, res: Response) => {
  const authUser = getAuthUser(req)!;
  const { registrationId } = req.params;
  if (!requireUuid(res, registrationId, 'registration ID')) {
    return;
  }

  const validation = retroAttendanceSchema.safeParse(req.body);
  if (!validation.success) {
    return ApiResponse.badRequest(res, validation.error.errors[0].message);
  }
  const { dayNumber, attended, scannedAt, reason } = validation.data;

  try {
    const registration = await prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        eventId: true,
        userId: true,
        event: { select: { eventDays: true, startDate: true, title: true } },
      },
    });
    if (!registration) {
      return ApiResponse.notFound(res, 'Registration not found');
    }

    const eventDays = normalizeEventDays(registration.event.eventDays);
    if (dayNumber > eventDays) {
      return ApiResponse.badRequest(res, `dayNumber must be between 1 and ${eventDays}`);
    }

    let backdatedBy: string | null = null;
    let stamp: Date | null = null;

    if (attended) {
      if (!scannedAt) {
        return ApiResponse.badRequest(res, 'scannedAt is required when marking a day attended');
      }
      const resolution = resolveBackdate({
        requested: scannedAt,
        now: new Date(),
        eventStart: registration.event.startDate,
      });
      if (!resolution.ok) {
        return ApiResponse.badRequest(res, resolution.message);
      }
      stamp = resolution.at;
      backdatedBy = resolution.isBackdated ? authUser.id : null;
    }

    await editDayAttendance(prisma, {
      registrationId,
      dayNumber,
      editorId: authUser.id,
      attendance: stamp ? { kind: 'mark', scannedAt: stamp } : { kind: 'unmark' },
      manualOverride: attended ? true : undefined,
      backdatedBy,
    });
    await syncRegistrationAttendance(registrationId);

    await auditLog(authUser.id, 'BACKDATE_ATTENDANCE_EDIT', 'eventRegistration', registrationId, {
      eventId: registration.eventId,
      eventTitle: registration.event.title,
      targetUserId: registration.userId,
      dayNumber,
      attended,
      backdatedTo: stamp?.toISOString() ?? null,
      isBackdated: Boolean(backdatedBy),
      reason: reason ? sanitizeText(reason) : null,
    });

    return ApiResponse.success(res, {
      registrationId,
      dayNumber,
      attended,
      scannedAt: stamp?.toISOString() ?? null,
    }, attended ? `Day ${dayNumber} marked present.` : `Day ${dayNumber} cleared.`);
  } catch (error) {
    logger.error('Failed to edit backdated attendance', {
      registrationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to update attendance');
  }
});

// ──────────────────────────────────────────────────────────────────
// DELETE /api/backdate/registration/:registrationId
// Remove a registration from a past event, including the guest invitation that
// points at it. The generic admin delete (routes/events.ts) leaves an ACCEPTED
// invitation dangling with a null registrationId, which reads as a guest who
// accepted but was never registered — this one cleans the pair up together.
// ──────────────────────────────────────────────────────────────────
backdateRouter.delete('/registration/:registrationId', async (req: Request, res: Response) => {
  const authUser = getAuthUser(req)!;
  const { registrationId } = req.params;
  if (!requireUuid(res, registrationId, 'registration ID')) {
    return;
  }

  const dropInvitation = req.query.dropInvitation === 'true';

  try {
    const registration = await prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        eventId: true,
        userId: true,
        registrationType: true,
        invitation: { select: { id: true, status: true } },
        event: { select: { title: true } },
        user: { select: { email: true } },
      },
    });
    if (!registration) {
      return ApiResponse.notFound(res, 'Registration not found');
    }

    await prisma.$transaction(async (tx) => {
      if (registration.invitation) {
        if (dropInvitation) {
          await tx.eventInvitation.delete({ where: { id: registration.invitation.id } });
        } else {
          // Keep the invitation as a record that the person was invited, but return
          // it to PENDING so it no longer claims a registration that is gone.
          await tx.eventInvitation.update({
            where: { id: registration.invitation.id },
            data: { status: 'PENDING', respondedAt: null, registrationId: null },
          });
        }
      }
      // DayAttendance cascades with the registration (onDelete: Cascade).
      await tx.eventRegistration.delete({ where: { id: registrationId } });
    });

    await auditLog(authUser.id, 'BACKDATE_REGISTRATION_DELETE', 'eventRegistration', registrationId, {
      eventId: registration.eventId,
      eventTitle: registration.event.title,
      targetUserId: registration.userId,
      targetEmail: registration.user.email,
      registrationType: registration.registrationType,
      invitationId: registration.invitation?.id ?? null,
      invitationAction: registration.invitation ? (dropInvitation ? 'deleted' : 'reset_to_pending') : 'none',
    });

    logger.info('Backdated registration removed', { registrationId, eventId: registration.eventId, by: authUser.id });

    return ApiResponse.success(res, { registrationId }, 'Registration removed.');
  } catch (error) {
    logger.error('Failed to remove registration via backdate console', {
      registrationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to remove the registration');
  }
});
