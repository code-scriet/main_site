// Shared "who are an event's recipients" resolver — used by the admin
// message-registrants composer and the post-event feedback-poll enable flow.
// One place owns the audience → Prisma filter mapping so both features stay in
// sync (participants exclude invited guests; attended/absent honour DayAttendance
// for multi-day events).

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { participantsOnly, guestsOnly } from './registrationFilters.js';

export type EventAudience = 'all' | 'participants' | 'guests' | 'attended' | 'absent';

export const EVENT_AUDIENCES: EventAudience[] = ['all', 'participants', 'guests', 'attended', 'absent'];

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
  cap = 5000,
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
