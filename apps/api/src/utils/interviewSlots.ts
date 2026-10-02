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
}

export interface GeneratedSlot {
  startsAt: Date;
  endsAt: Date;
  status: 'ok' | 'conflict';
  conflictsWith?: { startsAt: Date; endsAt: Date };
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
 * if overlaps any existing slot (any role): mark conflict {conflictsWith};
 * else mark ok, generated+=1; t = slot.end + breakMinutes.
 */
export function buildSlotSeries(input: BuildSlotSeriesInput): GeneratedSlot[] {
  const { date, startTime, slotMinutes, count, endTime, breakMinutes = 0, existing } = input;

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
    t = new Date(slotEnd.getTime() + breakMinutes * 60_000);
  }

  return out;
}

// §3 transition table (server-side allowlist).
const ALLOWED_TRANSITIONS = new Set([
  'PENDING->INTERVIEW_SCHEDULED',
  'INTERVIEW_SCHEDULED->SLOT_BOOKED',
  'SLOT_BOOKED->INTERVIEW_SCHEDULED',
  'SLOT_BOOKED->INTERVIEWED',
  'INTERVIEW_SCHEDULED->REJECTED',
  'SLOT_BOOKED->REJECTED',
  'INTERVIEWED->SELECTED',
  'INTERVIEWED->REJECTED',
]);

export function isValidTransition(from: string, to: string): boolean {
  return ALLOWED_TRANSITIONS.has(`${from}->${to}`);
}

export const interviewSlotTestUtils = {
  MAX_SERIES_ITERATIONS,
  ALLOWED_TRANSITIONS: [...ALLOWED_TRANSITIONS],
};
