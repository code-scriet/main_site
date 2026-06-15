// Event-registration intake — the single deep module that owns what it
// means to create an EventRegistration row. It mints the attendance JWT
// (inside the caller's transaction, embedding the freshly-chosen row id),
// persists the registration, and seeds one DayAttendance row per event day.
//
// Three flows create participant/guest registrations: solo registration
// (routes/registrations.ts), team create + join (routes/teams.ts), and
// guest invitation accept (routes/invitations.ts). Before this module each
// inlined the same sequence and they had drifted apart:
//   - the team flows skipped DayAttendance seeding entirely, which silently
//     broke per-day attendance marking for every team member, and
//   - the team flows minted the token *outside* the transaction as a
//     best-effort post-commit update, so a failure there could leave a
//     registration with a null attendanceToken (and no QR).
// Centralising the kernel makes those invariants impossible to forget and
// keeps the solo/guest flows byte-for-byte identical.
//
// Callers still own their own capacity check, event-open validation and
// event fetch (each needs a different event shape and different error
// semantics), then call into this module for the create itself.

import { Prisma, RegistrationType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { generateAttendanceToken } from './attendanceToken.js';
import { normalizeEventDays } from './attendanceDomain.js';

const createdRegistrationSelect = {
  id: true,
  userId: true,
  eventId: true,
  timestamp: true,
  customFieldResponses: true,
  attendanceToken: true,
} satisfies Prisma.EventRegistrationSelect;

export type CreatedEventRegistration = Prisma.EventRegistrationGetPayload<{
  select: typeof createdRegistrationSelect;
}>;

export interface CreateEventRegistrationParams {
  userId: string;
  eventId: string;
  /** Drives how many DayAttendance rows are seeded (clamped to 1..10). */
  eventDays: number | null | undefined;
  /** Defaults to PARTICIPANT; pass GUEST for invitation-accept flows. */
  registrationType?: RegistrationType;
  customFieldResponses?: Prisma.InputJsonValue;
  /**
   * Optional caller-supplied id. When omitted a fresh UUID is generated.
   * The attendance token always embeds whichever id is used, so the row id
   * and the token's `registrationId` claim can never disagree.
   */
  registrationId?: string;
}

export interface CreateEventRegistrationResult {
  registration: CreatedEventRegistration;
  attendanceToken: string;
}

// Create an EventRegistration (+ attendance token + DayAttendance rows)
// inside the caller's transaction.
//
// MUST run inside a transaction: the row, its token and its day rows have
// to commit atomically — a half-written registration (row without token, or
// row without day rows) is exactly the drift this module exists to prevent.
export async function createEventRegistrationInTx(
  tx: Prisma.TransactionClient,
  params: CreateEventRegistrationParams,
): Promise<CreateEventRegistrationResult> {
  const registrationId = params.registrationId ?? randomUUID();
  const attendanceToken = generateAttendanceToken(params.userId, params.eventId, registrationId);

  const registration = await tx.eventRegistration.create({
    data: {
      id: registrationId,
      userId: params.userId,
      eventId: params.eventId,
      registrationType: params.registrationType ?? RegistrationType.PARTICIPANT,
      customFieldResponses: params.customFieldResponses,
      attendanceToken,
    },
    select: createdRegistrationSelect,
  });

  const dayCount = normalizeEventDays(params.eventDays);
  await tx.dayAttendance.createMany({
    data: Array.from({ length: dayCount }, (_, index) => ({
      registrationId: registration.id,
      dayNumber: index + 1,
      attended: false,
    })),
  });

  return { registration, attendanceToken };
}

/** Thrown by assertWithinActiveEventLimitInTx — callers map it to their own HTTP error shape. */
export class EventLimitExceededError extends Error {
  constructor(
    public readonly limit: number,
    public readonly activeCount: number,
  ) {
    super(`Active-event registration limit reached (${activeCount}/${limit})`);
    this.name = 'EventLimitExceededError';
  }
}

/**
 * L2: enforce Settings.maxEventsPerUser server-side, inside the caller's
 * serializable transaction (so two concurrent intakes can't both slip under
 * the cap). Counts the caller's PARTICIPANT registrations on events that
 * haven't finished (UPCOMING/ONGOING) — GUEST invitations never count, and
 * PAST events free their slots.
 *
 * Call from every PARTICIPANT intake (solo registration, team create, team
 * join) before createEventRegistrationInTx. Deliberately NOT called from the
 * guest-invitation accept flow.
 *
 * A limit below 1 disables the check (the admin UI floors the field at 1;
 * out-of-band nonsense values must not brick all registration).
 */
export async function assertWithinActiveEventLimitInTx(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const settings = await tx.settings.findUnique({
    where: { id: 'default' },
    select: { maxEventsPerUser: true },
  });
  const limit = settings?.maxEventsPerUser ?? 5;
  if (!Number.isInteger(limit) || limit < 1) {
    return;
  }

  const activeCount = await tx.eventRegistration.count({
    where: {
      userId,
      registrationType: RegistrationType.PARTICIPANT,
      event: { status: { in: ['UPCOMING', 'ONGOING'] } },
    },
  });

  if (activeCount >= limit) {
    throw new EventLimitExceededError(limit, activeCount);
  }
}
