// Shared "who are an event's recipients" resolver — used by the admin
// message-registrants composer and the post-event feedback-poll enable flow.
// One place owns the audience → Prisma filter mapping so both features stay in
// sync (participants exclude invited guests; attended/absent honour DayAttendance
// for multi-day events).

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { participantsOnly, guestsOnly } from './registrationFilters.js';

export type EventAudience = 'all' | 'participants' | 'guests' | 'attended' | 'absent';

// Single source of truth for the audience list — the Zod enums (message +
// feedback endpoints) derive from this so the set can't drift.
export const EVENT_AUDIENCES = ['all', 'participants', 'guests', 'attended', 'absent'] as const;

// Free-tier ceiling shared by both fan-out endpoints. One CUSTOM notification row
// carries every userId in a JSON array and `sendBulk` batches the emails, so this
// bounds both memory and outbound volume per request.
export const EVENT_RECIPIENT_CAP = 2000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Prisma `where` fragment (excluding `eventId`) for the chosen audience. */
export function buildAudienceWhere(audience: EventAudience, dayNumber?: number): Prisma.EventRegistrationWhereInput {
  switch (audience) {
    case 'participants':
      return { ...participantsOnly };
    case 'guests':
      return { ...guestsOnly };
    case 'attended':
      return {
        ...participantsOnly,
        OR: [
          { attended: true },
          { dayAttendances: { some: { ...(dayNumber ? { dayNumber } : {}), attended: true } } },
        ],
      };
    case 'absent':
      return {
        ...participantsOnly,
        ...(dayNumber ? { dayAttendances: { none: { dayNumber, attended: true } } } : { attended: false }),
      };
    case 'all':
    default:
      return {};
  }
}

export interface EventRecipients {
  userIds: string[];
  emails: string[];
  /** Raw row count fetched (capped at `cap + 1` so callers can detect overflow). */
  count: number;
}

/** Deduped userIds + emails for the audience. Fetches at most `cap + 1` rows. */
export async function fetchEventRecipients(
  eventId: string,
  audience: EventAudience,
  dayNumber?: number,
  cap = EVENT_RECIPIENT_CAP,
): Promise<EventRecipients> {
  const regs = await prisma.eventRegistration.findMany({
    where: { eventId, ...buildAudienceWhere(audience, dayNumber) },
    select: { userId: true, user: { select: { email: true } } },
    take: cap + 1,
  });
  const userIds = [...new Set(regs.map((r) => r.userId))];
  const emails = [...new Set(regs.map((r) => r.user?.email).filter((e): e is string => Boolean(e)))];
  return { userIds, emails, count: regs.length };
}

/**
 * Feedback poll deadline: 24h after the event ends. If that instant is already
 * past (enabling long after the event), give recipients a fresh 24h window so the
 * poll isn't born closed. Pure — unit-tested.
 */
export function computeFeedbackDeadline(base: Date, now: Date): Date {
  const ms = base.getTime() + DAY_MS;
  return new Date(ms <= now.getTime() ? now.getTime() + DAY_MS : ms);
}

/**
 * Decide how a feedback poll is delivered. `sendNow` fans out immediately to the
 * chosen audience. Deferring (`sendNow=false`) hands off to the S-10 scheduler —
 * but that only fires within a window AFTER the event ends, so deferring an
 * already-ended event would risk a silent no-op. In that case we send now
 * instead (honouring the chosen audience).
 *
 * `ended` is intentionally computed the same way the S-10 scheduler
 * (`sendEventFeedbackRequests`) windows its own send: `base = endDate ?? startDate`,
 * and the event counts as "ended" once `base <= now` — so an event with no
 * `endDate` is considered ended as soon as its `startDate` passes. This is a
 * deliberate mirror, not an oversight: if the two definitions of "ended" ever
 * disagreed, `sendNow=false` on such an event could defer to a scheduler window
 * that this function believes is already open (or vice versa), silently
 * dropping the send. Keep this in lockstep with the scheduler's window if that
 * ever changes. Pure — unit-tested.
 */
export function resolveFeedbackDelivery(
  sendNow: boolean,
  base: Date,
  now: Date,
): { shouldSendNow: boolean; willSchedule: boolean } {
  const ended = base.getTime() <= now.getTime();
  const shouldSendNow = sendNow || ended;
  return { shouldSendNow, willSchedule: !shouldSendNow };
}

/**
 * Only honour `dayNumber` when it's a real day of a multi-day event; an
 * out-of-range or single-day value falls back to overall attendance (`undefined`)
 * rather than silently matching zero registrants. Shared by the message-registrants
 * and feedback-poll handlers so the "which day counts" rule can't drift between them.
 * Pure — unit-tested.
 */
export function resolveEffectiveDay(eventDays: number, dayNumber?: number): number | undefined {
  return eventDays > 1 && dayNumber && dayNumber <= eventDays ? dayNumber : undefined;
}
