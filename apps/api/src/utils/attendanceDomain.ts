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
