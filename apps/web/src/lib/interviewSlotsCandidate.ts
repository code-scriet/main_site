// Candidate interview-slot UI helpers — pure, DOM-free and network-free so they
// stay unit-testable offline (see apps/web/tests/interviewSlotsCandidate.test.ts).
// All dates render en-IN in Asia/Kolkata with an explicit "IST" suffix.

export interface CandidateSlotLike {
  id: string;
  startsAt: string | Date;
  endsAt: string | Date;
  capacity: number;
  bookedCount: number;
  spotsLeft: number;
  isOpen: boolean;
  applyingRole: string | null;
  venue: string | null;
}

export interface SlotDateGroup<T extends CandidateSlotLike = CandidateSlotLike> {
  /** IST calendar day key (YYYY-MM-DD) used for stable React keys. */
  key: string;
  /** Human header, e.g. "Friday, 9 Jan 2026". */
  label: string;
  slots: T[];
}

/** Server `error_type` values the candidate booking endpoints can return. */
export type SlotBookErrorType =
  | 'already_booked'
  | 'slot_full'
  | 'slot_closed'
  | 'past_slot'
  | 'cancel_cutoff'
  | 'conflict'
  | 'slot_not_found'
  | 'slot_overlap'
  | 'slot_booked';

const IST = 'Asia/Kolkata';
const LOCALE = 'en-IN';

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** IST calendar-day key (YYYY-MM-DD), independent of the browser timezone. */
export function istDayKey(value: string | Date): string {
  return new Date(value).toLocaleDateString('en-CA', { timeZone: IST });
}

/** Full date + time in IST with an explicit suffix, e.g. "9 Jan 2026, 10:00 am IST". */
export function formatISTWithSuffix(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '';
  const s = d.toLocaleString(LOCALE, {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${s} IST`;
}

/** Day header for a date group, e.g. "Friday, 9 Jan 2026". Empty on bad input. */
export function formatSlotDayLabel(value: string | Date): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleDateString(LOCALE, {
    timeZone: IST,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatSlotTime(value: string | Date): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleTimeString(LOCALE, {
    timeZone: IST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** Card time-range, e.g. "10:00 am - 10:30 am IST". Empty when either end is bad. */
export function formatSlotTimeRangeIST(startsAt: string | Date, endsAt: string | Date): string {
  const s = formatSlotTime(startsAt);
  const e = formatSlotTime(endsAt);
  if (!s || !e) return '';
  return `${s} - ${e} IST`;
}

/** Sort ascending by start and group by IST calendar day. */
export function groupSlotsByDate<T extends CandidateSlotLike>(slots: T[]): Array<SlotDateGroup<T>> {
  const sorted = [...slots].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  const groups = new Map<string, SlotDateGroup<T>>();
  for (const slot of sorted) {
    const key = istDayKey(slot.startsAt);
    const existing = groups.get(key);
    if (existing) {
      existing.slots.push(slot);
    } else {
      groups.set(key, { key, label: formatSlotDayLabel(slot.startsAt), slots: [slot] });
    }
  }
  return [...groups.values()];
}

/** Pill copy for remaining capacity. */
export function spotsLeftLabel(spotsLeft: number): string {
  if (spotsLeft <= 0) return 'Full';
  if (spotsLeft === 1) return 'Last spot';
  return `${spotsLeft} spots left`;
}

/** Pill tone matching the spots-left urgency. */
export function spotsLeftTone(spotsLeft: number): 'neutral' | 'warning' | 'info' {
  if (spotsLeft <= 0) return 'neutral';
  if (spotsLeft === 1) return 'warning';
  return 'info';
}

/** User-facing copy for each typed booking error. Falls back to a generic line. */
export function slotBookErrorCopy(errorType: string | null | undefined): string {
  switch (errorType) {
    case 'slot_full':
      return 'That slot was just taken. Pick another one.';
    case 'already_booked':
      return 'You already have a booking. Showing your confirmed slot.';
    case 'slot_closed':
      return 'That slot is closed now. Pick another one.';
    case 'past_slot':
      return 'That slot has already passed. Pick another one.';
    case 'cancel_cutoff':
      return 'Cancellation closes 24 hours before your slot.';
    case 'conflict':
      return 'That slot just changed. Try again.';
    case 'slot_not_found':
      return 'That slot no longer exists. Pick another one.';
    default:
      return 'Something went wrong. Try again.';
  }
}

/** Pull `error_type` out of a candidate-endpoint error payload (top-level or nested). */
export function extractSlotErrorType(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const top = payload as { error_type?: unknown; error?: unknown };
  if (typeof top.error_type === 'string' && top.error_type) return top.error_type;
  if (top.error && typeof top.error === 'object') {
    const nested = (top.error as { error_type?: unknown }).error_type;
    if (typeof nested === 'string' && nested) return nested;
  }
  return undefined;
}

/** Candidates may cancel only more than 24h before the slot starts. */
export function isCancellableSlot(startsAt: string | Date, nowMs: number = Date.now()): boolean {
  const d = toDate(startsAt);
  if (!d) return false;
  return d.getTime() - nowMs > 24 * 60 * 60 * 1000;
}

/** Short human reference for a booking id, e.g. "A3F9C2E1". */
export function bookingReference(bookingId: string): string {
  const compact = bookingId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return compact || bookingId.toUpperCase();
}

// ─── Client-side .ics content (pure string; the component turns it into a Blob
// download). Minimal RFC 5545 with text-escaping and 75-octet line folding. ───

export interface InterviewICSInput {
  uid: string;
  title: string;
  startsAt: string | Date;
  endsAt: string | Date;
  venue?: string | null;
  description?: string | null;
  url?: string | null;
}

function toICSStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeICSText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function foldICSLine(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(` ${line.slice(i, i + 74)}`);
  return parts.join('\r\n');
}

/** Returns '' when the dates are unusable so callers can hide the download. */
export function buildInterviewICSContent(input: InterviewICSInput): string {
  const start = toDate(input.startsAt);
  const end = toDate(input.endsAt);
  if (!start || !end || end.getTime() <= start.getTime()) return '';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//code.scriet//Interviews//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid.replace(/[\r\n]/g, '')}`,
    `DTSTAMP:${toICSStamp(new Date())}`,
    `DTSTART:${toICSStamp(start)}`,
    `DTEND:${toICSStamp(end)}`,
    `SUMMARY:${escapeICSText(input.title)}`,
  ];
  if (input.description?.trim()) lines.push(`DESCRIPTION:${escapeICSText(input.description.trim())}`);
  if (input.venue?.trim()) lines.push(`LOCATION:${escapeICSText(input.venue.trim())}`);
  if (input.url?.trim()) lines.push(`URL:${input.url.trim().replace(/[\r\n]/g, '')}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldICSLine).join('\r\n');
}
