// Attendance domain helpers — pure / DB-only logic extracted from
// routes/attendance.ts so it can be reasoned about and tested without
// touching Express or Socket.io.
//
// Owns:
//   - Day-number resolution (parse + validate against the event's eventDays)
//   - eventDays / dayLabels normalization
//   - Attendance JWT payload resolution (verify, fall back to DB lookup)
//   - EventRegistration ↔ DayAttendance state reconciliation
//   - The "client clock drift" tolerance for scan timestamps
//   - The bulk-update transaction conflict sentinel error
//
// Route handlers still own HTTP shape, auth checks, audit logging, and
// socket emits. They call into this module for the domain work.

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { verifyAttendanceToken } from './attendanceToken.js';

export const CLIENT_SCAN_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
export const CLIENT_SCAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type AttendanceTokenPayload = {
  userId: string;
  eventId: string;
  registrationId: string;
};

// Thrown inside bulk-update transactions when a row that was expected to
// match a filter has changed underneath the operation. The route handler
// catches this and translates to a 409.
export class AttendanceBulkUpdateConflictError extends Error {}

export function isRegistrationBoundToPayload(
  registration: { id: string; userId: string; eventId: string },
  payload: AttendanceTokenPayload,
): boolean {
  return (
    registration.id === payload.registrationId &&
    registration.userId === payload.userId &&
    registration.eventId === payload.eventId
  );
}

// Accept the client-reported scan timestamp only if it sits inside a
// reasonable window around server time, otherwise fall back to "now."
// Offline scanners batch-sync minutes-to-hours later, so we allow up to
// CLIENT_SCAN_MAX_AGE_MS in the past and a small future tolerance for
// laptops with skewed clocks.
export function resolveClientScannedAt(scannedAtLocal?: string): Date {
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

export function normalizeEventDays(eventDays: number | null | undefined): number {
  if (!Number.isInteger(eventDays) || !eventDays || eventDays < 1) return 1;
  return Math.min(eventDays, 10);
}

export function parseDayLabels(value: unknown, eventDays: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, eventDays)
    .map((label) => (typeof label === 'string' ? label.trim() : ''))
    .map((label, index) => label || `Day ${index + 1}`);
}

export function parseRequestedDayNumber(dayNumber: unknown): number | null {
  if (dayNumber === undefined || dayNumber === null || dayNumber === '') return null;
  if (typeof dayNumber === 'number' && Number.isInteger(dayNumber)) return dayNumber;
  if (typeof dayNumber === 'string') {
    const parsed = Number.parseInt(dayNumber, 10);
    if (Number.isInteger(parsed)) return parsed;
  }
  return Number.NaN;
}

// Resolve the day to apply an attendance operation to. Returns:
//   - null  when no day is supplied and defaultToOne is false (caller should bail or treat as "no day")
//   - 1     when no day is supplied and defaultToOne is true
//   - NaN   when the supplied day is out of range
//   - n     for any valid 1 ≤ n ≤ eventDays
export function resolveEffectiveDayNumber(
  dayNumber: unknown,
  eventDays: number,
  defaultToOne = true,
): number | null {
  const parsed = parseRequestedDayNumber(dayNumber);
  if (parsed === null) return defaultToOne ? 1 : null;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > eventDays) return Number.NaN;
  return parsed;
}

// After mutating DayAttendance rows for a registration, recompute the
// denormalized EventRegistration.attended / scannedAt / manualOverride
// fields from the latest attended day. Keeps the legacy single-day
// fields consistent with multi-day data for clients that still read them.
export async function syncRegistrationAttendance(registrationId: string): Promise<void> {
  const latestAttendedDay = await prisma.dayAttendance.findFirst({
    where: { registrationId, attended: true },
    orderBy: [
      { scannedAt: 'desc' },
      { dayNumber: 'desc' },
    ],
  });

  await prisma.eventRegistration.update({
    where: { id: registrationId },
    data: {
      attended: !!latestAttendedDay,
      scannedAt: latestAttendedDay?.scannedAt ?? null,
      manualOverride: latestAttendedDay?.manualOverride ?? false,
    },
  });
}

// Batch resolve attendance JWTs that can't be verified locally (e.g.
// secret rotation) by looking up the token in EventRegistration.
// Returns only entries that hydrated successfully.
export async function resolveStoredAttendanceTokenPayloads(
  tokens: string[],
): Promise<Map<string, AttendanceTokenPayload>> {
  const normalizedTokens = Array.from(new Set(
    tokens
      .map((token) => token.trim())
      .filter((token) => token.length > 0),
  ));

  if (normalizedTokens.length === 0) {
    return new Map();
  }

  const registrations = await prisma.eventRegistration.findMany({
    where: {
      attendanceToken: { in: normalizedTokens },
    },
    select: {
      attendanceToken: true,
      id: true,
      userId: true,
      eventId: true,
    },
  });

  const payloadMap = new Map<string, AttendanceTokenPayload>();
  for (const registration of registrations) {
    const storedToken = registration.attendanceToken?.trim();
    if (!storedToken) {
      continue;
    }

    payloadMap.set(storedToken, {
      userId: registration.userId,
      eventId: registration.eventId,
      registrationId: registration.id,
    });
  }

  return payloadMap;
}

// Single-token resolver. Prefers the JWT verify path; falls back to a
// DB lookup so a rotated secret doesn't immediately invalidate stored
// QR codes printed in advance for an event.
export async function resolveAttendancePayloadFromToken(
  token: string,
): Promise<AttendanceTokenPayload | null> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return null;
  }

  try {
    return verifyAttendanceToken(normalizedToken);
  } catch {
    const fallbackMap = await resolveStoredAttendanceTokenPayloads([normalizedToken]);
    return fallbackMap.get(normalizedToken) || null;
  }
}

// A Prisma client capable of the DayAttendance reads/writes these helpers
// perform. Both the global `prisma` client and an interactive transaction
// client satisfy it, so a single helper serves standalone scans and the
// in-transaction bulk path alike.
export type AttendanceDbClient = Prisma.TransactionClient;

export type DayAttendanceMarkOutcome = 'marked' | 'created' | 'duplicate';

export interface MarkDayAttendanceParams {
  registrationId: string;
  dayNumber: number;
  scannedAt: Date;
  scannedBy: string;
  // When provided, written to both the update and create paths. Omit to
  // leave manualOverride untouched on update and at its default on create —
  // this is what the QR-scan path wants (it must not clear an override).
  manualOverride?: boolean;
}

// Atomically mark a single (registration, day) present.
//
// This is the one place the "never check-then-update" attendance invariant
// lives (a stated Hard Constraint). The protocol:
//   1. updateMany flips attended false→true. A positive count means we won
//      the row — 'marked'.
//   2. count===0 means either the row is already attended (a real duplicate
//      scan) or it doesn't exist yet. A single findUnique disambiguates:
//      attended → 'duplicate'; missing → create it and return 'created'.
// Callers map the three outcomes to their own response shape (HTTP conflict,
// results-array entry, skip counter, or a thrown bulk-conflict sentinel).
//
// Pass the global `prisma` client (wrap the call in withRetry for Neon
// cold-start resilience) for standalone scans, or a transaction client when
// marking inside a serializable/interactive transaction.
export async function markDayAttendanceAtomic(
  client: AttendanceDbClient,
  params: MarkDayAttendanceParams,
): Promise<DayAttendanceMarkOutcome> {
  const { registrationId, dayNumber, scannedAt, scannedBy, manualOverride } = params;

  const updateData: Prisma.DayAttendanceUpdateManyMutationInput = {
    attended: true,
    scannedAt,
    scannedBy,
  };
  if (manualOverride !== undefined) {
    updateData.manualOverride = manualOverride;
  }

  const marked = await client.dayAttendance.updateMany({
    where: { registrationId, dayNumber, attended: false },
    data: updateData,
  });
  if (marked.count > 0) {
    return 'marked';
  }

  const existingDay = await client.dayAttendance.findUnique({
    where: { registrationId_dayNumber: { registrationId, dayNumber } },
  });
  if (existingDay?.attended) {
    return 'duplicate';
  }

  await client.dayAttendance.create({
    data: {
      registrationId,
      dayNumber,
      attended: true,
      scannedAt,
      scannedBy,
      ...(manualOverride !== undefined ? { manualOverride } : {}),
    },
  });
  return 'created';
}

export type DayAttendanceUnmarkOutcome = 'unmarked' | 'not-marked';

// Atomically unmark a single (registration, day): reset it to the fully
// unattended state (attended false, scannedAt/scannedBy null, manualOverride
// false). Returns 'not-marked' when no attended row matched, so callers can
// translate to a 400 (single unmark) or a bulk-conflict sentinel.
export async function unmarkDayAttendanceAtomic(
  client: AttendanceDbClient,
  params: { registrationId: string; dayNumber: number },
): Promise<DayAttendanceUnmarkOutcome> {
  const { registrationId, dayNumber } = params;
  const updated = await client.dayAttendance.updateMany({
    where: { registrationId, dayNumber, attended: true },
    data: {
      attended: false,
      scannedAt: null,
      scannedBy: null,
      manualOverride: false,
    },
  });
  return updated.count > 0 ? 'unmarked' : 'not-marked';
}
