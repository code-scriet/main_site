// Backdate policy — the single place that decides whether a retroactive date is
// legal, and what it means for a record to be "backdated" at all.
//
// PRESIDENT / super-admin can stamp a certificate, registration, attendance mark or
// guest invitation with a past date so records for an event that already happened
// read truthfully (e.g. issuing a SPEAKER certificate today for a talk given in 2024,
// dated to that talk). Everything else about those flows is unchanged — this module
// only answers "is this date acceptable, and is it actually a backdate?".
//
// Deliberately pure (no Prisma, no Express, no clock reads of its own — `now` is
// always passed in) so the policy is unit-testable and identical across every caller:
// certificate issuance, the retro-registration router, and the attendance edit path.

/**
 * Nothing may be backdated before this. The club did not exist earlier, so a date
 * below the floor is a typo (a mis-typed year is the realistic failure mode) rather
 * than an intent. Keeps a fat-fingered "0025" out of the public verify page.
 */
export const BACKDATE_FLOOR = new Date('2015-01-01T00:00:00.000Z');

/**
 * How far before an event's start a record may be dated. Registrations legitimately
 * predate the event; attendance and certificates do not, but a single day of slack
 * absorbs timezone skew between the stored UTC startDate and the admin's IST intent
 * without needing a per-kind rule.
 */
export const EVENT_LEAD_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/**
 * Small tolerance for a client clock that runs fast. A date inside this window is
 * clamped to `now` rather than rejected — an admin picking "today" should never be
 * refused because their laptop is 40 seconds ahead.
 */
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * A date within this distance of `now` is treated as "not really a backdate", so the
 * backdatedBy marker (and the audit metadata) stay off for an admin who opened the
 * backdate control and then picked today anyway. Without it, ordinary same-day
 * issuance through the retro console would litter records with false retro markers.
 */
export const BACKDATE_MIN_OFFSET_MS = 60 * 60 * 1000;

export type BackdateRejectionReason =
  | 'invalid'
  | 'future'
  | 'before_floor'
  | 'before_event';

export type BackdateResolution =
  | { ok: true; at: Date; isBackdated: boolean }
  | { ok: false; reason: BackdateRejectionReason; message: string };

export interface ResolveBackdateParams {
  /** Raw client input: an ISO string, a Date, or null/undefined for "use now". */
  requested: string | Date | null | undefined;
  now: Date;
  /**
   * The event this record belongs to, when there is one. A linked record may not be
   * dated meaningfully before its event started. Omit for a standalone certificate
   * (no eventId), which is bounded only by the floor and by `now`.
   */
  eventStart?: Date | null;
}

const formatDay = (value: Date): string => value.toISOString().slice(0, 10);

/**
 * Validate a requested backdate against the floor, the clock, and (when the record is
 * event-linked) the event's start. Returns the exact Date to persist plus whether it
 * counts as a backdate, or a rejection carrying an admin-readable message.
 *
 * A null/undefined `requested` is always valid and resolves to `now` with
 * isBackdated:false — callers can therefore route every issuance through this
 * function instead of branching on "did they ask for a backdate".
 */
export function resolveBackdate(params: ResolveBackdateParams): BackdateResolution {
  const { requested, now, eventStart } = params;

  if (requested === null || requested === undefined || requested === '') {
    return { ok: true, at: now, isBackdated: false };
  }

  const parsed = requested instanceof Date ? new Date(requested.getTime()) : new Date(requested);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, reason: 'invalid', message: 'Backdate must be a valid date' };
  }

  const parsedMs = parsed.getTime();
  const nowMs = now.getTime();

  if (parsedMs > nowMs + FUTURE_TOLERANCE_MS) {
    return { ok: false, reason: 'future', message: 'Backdate cannot be in the future' };
  }

  if (parsedMs < BACKDATE_FLOOR.getTime()) {
    return {
      ok: false,
      reason: 'before_floor',
      message: `Backdate cannot be earlier than ${formatDay(BACKDATE_FLOOR)}`,
    };
  }

  if (eventStart) {
    const earliest = eventStart.getTime() - EVENT_LEAD_TOLERANCE_MS;
    if (parsedMs < earliest) {
      return {
        ok: false,
        reason: 'before_event',
        message: `Backdate cannot be earlier than the event's start date (${formatDay(eventStart)})`,
      };
    }
  }

  // Clamp a slightly-fast client clock instead of rejecting it.
  const at = parsedMs > nowMs ? new Date(nowMs) : parsed;

  return {
    ok: true,
    at,
    isBackdated: nowMs - at.getTime() >= BACKDATE_MIN_OFFSET_MS,
  };
}
