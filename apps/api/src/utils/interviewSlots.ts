// Pure helpers for interview-slot scheduling (Phase 1).
// No Prisma import — fully unit-testable offline.

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Interpret `date` (YYYY-MM-DD) + `time` (HH:mm) as Asia/Kolkata wall-clock
 * (fixed UTC+5:30, no DST) and return the corresponding UTC Date.
 * Throws on any invalid input.
 */
export function parseISTDateTime(date: string, time: string): Date {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time);
  if (!d || !t) {
    throw new Error('Invalid date or time format (expected YYYY-MM-DD and HH:mm)');
  }
  const year = Number(d[1]);
  const month = Number(d[2]);
  const day = Number(d[3]);
  const hour = Number(t[1]);
  const minute = Number(t[2]);

  if (month < 1 || month > 12) throw new Error('Invalid month in date');
  if (day < 1 || day > daysInMonth(year, month)) throw new Error('Invalid day in date');
  if (hour < 0 || hour > 23) throw new Error('Invalid hour in time');
  if (minute < 0 || minute > 59) throw new Error('Invalid minute in time');

  const asUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  return new Date(asUtcMs - IST_OFFSET_MS);
}

/**
 * Half-open overlap: [aStart, aEnd) vs [bStart, bEnd).
 * Adjacent (end == start) is NOT overlap.
 */
export function slotsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export interface ExistingSlotInput {
  startsAt: Date;
  endsAt?: Date;
  /** Alias accepted because the spec names this field `endTime`. */
  endTime?: Date;
}

export interface BuildSlotSeriesInput {
  date: string;
  startTime: string;
  slotMinutes: number;
  count?: number;
  endTime?: string;
  breakMinutes?: number;
  existing: ExistingSlotInput[];
  /**
   * Epoch ms treated as "now". When provided, any generated slot that has
   * already begun (startsAt <= now) is marked `past` so callers skip it instead
   * of writing dead rows that nobody can ever book. Omitted ⇒ no past marking,
   * which keeps the generator pure/back-compatible for unit tests over
   * historical dates.
   */
  nowMs?: number;
}

export interface GeneratedSlot {
  startsAt: Date;
  endsAt: Date;
  status: 'ok' | 'conflict' | 'past';
  conflictsWith?: { startsAt: Date; endsAt: Date };
}

/**
 * A slot is bookable only strictly before it begins: once `startsAt` is reached
 * the interview window is open (or gone), so candidates must not claim it.
 * Shared by the create-time validation and the booking transaction.
 */
export function isSlotStarted(startsAt: Date, nowMs: number = Date.now()): boolean {
  const at = startsAt instanceof Date ? startsAt.getTime() : Number.NaN;
  return Number.isFinite(at) && at <= nowMs;
}

const MAX_SERIES_ITERATIONS = 200;

function normalizeExisting(raw: ExistingSlotInput): { startsAt: Date; endsAt: Date } {
  const endsAt = raw.endsAt ?? raw.endTime;
  if (!(raw.startsAt instanceof Date) || Number.isNaN(raw.startsAt.getTime())) {
    throw new Error('Invalid existing slot startsAt');
  }
  if (!(endsAt instanceof Date) || Number.isNaN(endsAt.getTime())) {
    throw new Error('Invalid existing slot endsAt/endTime');
  }
  return { startsAt: raw.startsAt, endsAt };
}

/**
 * Generator algorithm (verbatim per spec):
 * t = IST(date,startTime)→UTC; generated=0; loop with safety cap 200:
 * slot=[t,t+slotMinutes]; if endTime given and slot.end > IST(date,endTime): break;
 * if count given and generated==count: break;
 * if nowMs given and slot.start <= now: mark past;
 * else if overlaps any existing slot (any role): mark conflict {conflictsWith};
 * else mark ok; generated+=1 unless it was a conflict; t = slot.end + breakMinutes.
 *
 * `past` counts toward `count` while `conflict` does not, and that difference is
 * deliberate. A conflict means "this exact time is taken, keep looking for a free
 * one"; the admin still gets the N slots they asked for. A past time means the
 * requested moment has gone by: skipping it and continuing would quietly push the
 * rest of the series into later hours (or into the next day), so an all-past
 * request returns N dead rows and nothing is created.
 */
export function buildSlotSeries(input: BuildSlotSeriesInput): GeneratedSlot[] {
  const {
    date,
    startTime,
    slotMinutes,
    count,
    endTime,
    breakMinutes = 0,
    existing,
    nowMs,
  } = input;

  if (!Number.isInteger(slotMinutes) || slotMinutes < 15 || slotMinutes > 480) {
    throw new Error('slotMinutes must be an integer between 15 and 480');
  }
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 480) {
    throw new Error('breakMinutes must be a non-negative integer');
  }
  if (count !== undefined && (!Number.isInteger(count) || count < 1 || count > MAX_SERIES_ITERATIONS)) {
    throw new Error('count must be an integer between 1 and 200');
  }
  if (count === undefined && endTime === undefined) {
    throw new Error('Either count or endTime must be provided');
  }

  let t = parseISTDateTime(date, startTime);
  const endBound = endTime !== undefined ? parseISTDateTime(date, endTime) : null;
  const normalized = existing.map(normalizeExisting);
  const out: GeneratedSlot[] = [];
  let generated = 0;

  for (let i = 0; i < MAX_SERIES_ITERATIONS; i += 1) {
    if (count !== undefined && generated === count) break;
    const slotEnd = new Date(t.getTime() + slotMinutes * 60_000);
    if (endBound && slotEnd.getTime() > endBound.getTime()) break;

    // Past wins over conflict: the row is unbookable either way, and "already
    // passed" is the reason the admin can act on (shift the start time).
    if (nowMs !== undefined && isSlotStarted(t, nowMs)) {
      out.push({ startsAt: new Date(t), endsAt: new Date(slotEnd), status: 'past' });
      generated += 1;
    } else {
      const clash = normalized.find((e) => slotsOverlap(t, slotEnd, e.startsAt, e.endsAt));
      if (clash) {
        out.push({
          startsAt: new Date(t),
          endsAt: new Date(slotEnd),
          status: 'conflict',
          conflictsWith: { startsAt: new Date(clash.startsAt), endsAt: new Date(clash.endsAt) },
        });
      } else {
        out.push({ startsAt: new Date(t), endsAt: new Date(slotEnd), status: 'ok' });
        generated += 1;
      }
    }
    t = new Date(slotEnd.getTime() + breakMinutes * 60_000);
  }

  return out;
}

// §3 transition table (server-side allowlist). REJECTED / SELECTED are not
// terminal — admins can reverse a decision they made in error (the status route
// re-issues a pick token + email when moving back into INTERVIEW_SCHEDULED).
const ALLOWED_TRANSITIONS = new Set([
  'PENDING->INTERVIEW_SCHEDULED',
  'INTERVIEW_SCHEDULED->SLOT_BOOKED',
  'SLOT_BOOKED->INTERVIEW_SCHEDULED',
  'SLOT_BOOKED->INTERVIEWED',
  'SLOT_BOOKED->SELECTED',
  'INTERVIEW_SCHEDULED->INTERVIEWED',
  'INTERVIEW_SCHEDULED->REJECTED',
  'SLOT_BOOKED->REJECTED',
  'INTERVIEWED->SELECTED',
  'INTERVIEWED->REJECTED',
  // Reversals (undo a decision)
  'REJECTED->PENDING',
  'REJECTED->INTERVIEW_SCHEDULED',
  'REJECTED->INTERVIEWED',
  'REJECTED->SELECTED',
  'SELECTED->PENDING',
  'SELECTED->INTERVIEW_SCHEDULED',
  'SELECTED->INTERVIEWED',
  'SELECTED->REJECTED',
]);

export function isValidTransition(from: string, to: string): boolean {
  return ALLOWED_TRANSITIONS.has(`${from}->${to}`);
}

export const interviewSlotTestUtils = {
  MAX_SERIES_ITERATIONS,
  ALLOWED_TRANSITIONS: [...ALLOWED_TRANSITIONS],
};
