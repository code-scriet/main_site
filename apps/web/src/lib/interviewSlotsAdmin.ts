// Interview-slot admin API wrappers + pure view helpers (Phase 4).
//
// Self-contained on purpose:
// - AdminHiring must not route these through `@/lib/api` (frozen for Phase 4),
//   so this module owns its own typed fetch wrappers against `/api/hiring`.
// - The pure helpers below are dependency-free (no `@/` imports) so that
//   `apps/web/tests/` can import this file under plain node:test + tsx.
//
// Backend shapes mirror `apps/api/src/routes/hiringSlots.ts` + `hiring.ts`:
//   POST /api/hiring/slots, POST /api/hiring/slots/preview,
//   POST /api/hiring/slots/bulk, GET /api/hiring/slots?cycle=,
//   PATCH /api/hiring/slots/:id, DELETE /api/hiring/slots/:id,
//   POST /api/hiring/applications/schedule, DELETE /api/hiring/bookings/:id,
//   POST /api/hiring/slots/reconcile?cycle=,
//   PATCH /api/hiring/applications/:id/status?resend=true,
//   GET /api/hiring/cycles, GET /api/hiring/applications?cycle=&limit=&page=
// Known admin 409 `error_type` codes: slot_overlap, slot_booked,
// capacity_below_booked, capacity_locked, no_open_slots.

export type SlotApplyingRole =
  | 'TECHNICAL'
  | 'DSA_CHAMPS'
  | 'DESIGNING'
  | 'SOCIAL_MEDIA'
  | 'MANAGEMENT';

export interface AdminSlotBooking {
  id: string;
  applicationId: string;
  bookedAt: string;
  name: string;
  email: string;
  applyingRole: string;
}

export interface AdminInterviewSlot {
  id: string;
  cycle: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  isOpen: boolean;
  applyingRole: string | null;
  venue: string | null;
  notes: string | null;
  spotsLeft: number;
  bookings: AdminSlotBooking[];
}

export interface PreviewSlotRow {
  startsAt: string;
  endsAt: string;
  status: 'ok' | 'conflict';
  conflictsWith?: { startsAt: string; endsAt: string };
}

export interface PreviewResult {
  slots: PreviewSlotRow[];
  okCount: number;
  skipCount: number;
}

export interface SeriesInput {
  cycle: string;
  date: string;
  startTime: string;
  slotMinutes: number;
  count?: number;
  endTime?: string;
  breakMinutes?: number;
}

export interface SingleSlotInput {
  cycle: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity?: number;
  applyingRole?: SlotApplyingRole;
  venue?: string;
  notes?: string;
}

export interface SlotPatch {
  isOpen?: boolean;
  capacity?: number;
  venue?: string | null;
  notes?: string | null;
}

export interface BulkCreateResult {
  created: number;
  skipped: Array<{ startsAt: string; endsAt: string; reason: string }>;
}

export interface ScheduleItemResult {
  id: string;
  ok: boolean;
  error?: string;
}

export interface HiringCycleInfo {
  cycle: string;
  count: number;
}

export interface ApplicationStatusRow {
  id: string;
  status: string;
  cycle: string;
  createdAt: string;
}

/** Live interview-pipeline statuses that count as the hiring cohort audience. */
export const COHORT_PIPELINE_STATUSES: readonly string[] = [
  'INTERVIEW_SCHEDULED',
  'SLOT_BOOKED',
  'INTERVIEWED',
] as const;

function apiBaseUrl(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const url = env?.VITE_API_URL;
    if (typeof url === 'string' && url.length > 0) return url;
  } catch {
    // Non-Vite runtime (node:test) — fall through to the local default.
  }
  return 'http://localhost:5001/api';
}

export class SlotAdminError extends Error {
  readonly status?: number;
  readonly errorType?: string;

  constructor(message: string, options: { status?: number; errorType?: string } = {}) {
    super(message);
    this.name = 'SlotAdminError';
    this.status = options.status;
    this.errorType = options.errorType;
  }
}

function extractErrorType(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const p = payload as {
    error_type?: unknown;
    error?: unknown;
  };
  if (typeof p.error_type === 'string' && p.error_type) return p.error_type;
  if (typeof p.error === 'string' && p.error) return p.error;
  if (p.error && typeof p.error === 'object') {
    const nested = p.error as { error_type?: unknown; code?: unknown };
    if (typeof nested.error_type === 'string' && nested.error_type) return nested.error_type;
    if (typeof nested.code === 'string' && nested.code) return nested.code;
  }
  return undefined;
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const p = payload as { error?: unknown; message?: unknown };
  if (p.error && typeof p.error === 'object') {
    const nested = p.error as { message?: unknown };
    if (typeof nested.message === 'string' && nested.message.trim()) return nested.message.trim();
  }
  if (typeof p.message === 'string' && p.message.trim()) return p.message.trim();
  // Schedule endpoint 409s carry `{ error: 'no_open_slots', message }`.
  if (typeof p.error === 'string' && p.error.trim() && typeof p.message !== 'string') {
    return p.error.trim();
  }
  return fallback;
}

function unwrapData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function slotsRequest<T>(
  path: string,
  token: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const payload = await readJson(res);
  if (!res.ok) {
    throw new SlotAdminError(extractErrorMessage(payload, `Request failed (${res.status})`), {
      status: res.status,
      errorType: extractErrorType(payload),
    });
  }
  return unwrapData<T>(payload);
}

// ─── Typed admin wrappers ────────────────────────────────────────────────────

export function listInterviewSlots(token: string, cycle?: string): Promise<AdminInterviewSlot[]> {
  const query = cycle ? `?cycle=${encodeURIComponent(cycle)}` : '';
  return slotsRequest<{ slots: AdminInterviewSlot[] }>(`/hiring/slots${query}`, token).then(
    (data) => (Array.isArray(data?.slots) ? data.slots : []),
  );
}

export function previewSlotSeries(token: string, input: SeriesInput): Promise<PreviewResult> {
  return slotsRequest<PreviewResult>('/hiring/slots/preview', token, {
    method: 'POST',
    body: input,
  });
}

export function bulkCreateSlots(token: string, input: SeriesInput): Promise<BulkCreateResult> {
  return slotsRequest<BulkCreateResult>('/hiring/slots/bulk', token, {
    method: 'POST',
    body: input,
  });
}

export function createInterviewSlot(
  token: string,
  input: SingleSlotInput,
): Promise<AdminInterviewSlot> {
  return slotsRequest<AdminInterviewSlot>('/hiring/slots', token, {
    method: 'POST',
    body: input,
  });
}

export function updateInterviewSlot(
  token: string,
  slotId: string,
  patch: SlotPatch,
): Promise<AdminInterviewSlot> {
  return slotsRequest<AdminInterviewSlot>(`/hiring/slots/${slotId}`, token, {
    method: 'PATCH',
    body: patch,
  });
}

export function deleteInterviewSlot(token: string, slotId: string): Promise<void> {
  return slotsRequest<unknown>(`/hiring/slots/${slotId}`, token, { method: 'DELETE' }).then(
    () => undefined,
  );
}

export function scheduleInterviews(
  token: string,
  applicationIds: string[],
  deadlineDays = 7,
): Promise<ScheduleItemResult[]> {
  return slotsRequest<{ results: ScheduleItemResult[] }>(
    '/hiring/applications/schedule',
    token,
    { method: 'POST', body: { applicationIds, deadlineDays } },
  ).then((data) => (Array.isArray(data?.results) ? data.results : []));
}

/** Same-status PATCH with `?resend=true`: regenerates the token + re-sends the pick email. */
export function resendSlotInvite(token: string, applicationId: string): Promise<unknown> {
  return slotsRequest<unknown>(
    `/hiring/applications/${applicationId}/status?resend=true`,
    token,
    { method: 'PATCH', body: { status: 'INTERVIEW_SCHEDULED' } },
  );
}

export function cancelSlotBooking(
  token: string,
  bookingId: string,
  reason?: string,
): Promise<unknown> {
  return slotsRequest<unknown>(`/hiring/bookings/${bookingId}`, token, {
    method: 'DELETE',
    body: reason ? { reason } : {},
  });
}

export interface ReconcileFix {
  slotId: string;
  was: number;
  now: number;
}

export interface ReconcileResult {
  checked: number;
  fixed: ReconcileFix[];
}

/** POST /api/hiring/slots/reconcile?cycle= — recount bookings, repair drifted counters. */
export function reconcileSlotCounters(token: string, cycle: string): Promise<ReconcileResult> {
  return slotsRequest<ReconcileResult>(
    `/hiring/slots/reconcile?cycle=${encodeURIComponent(cycle)}`,
    token,
    { method: 'POST' },
  );
}

/**
 * Result toast: `Checked 12 slots, counters already correct` when drift-free,
 * else `Checked 12 slots, fixed 2 counters`.
 */
export function formatReconcileMessage(checked: number, fixedCount: number): string {
  const slotWord = checked === 1 ? 'slot' : 'slots';
  if (fixedCount <= 0) return `Checked ${checked} ${slotWord}, counters already correct`;
  const fixWord = fixedCount === 1 ? 'counter' : 'counters';
  return `Checked ${checked} ${slotWord}, fixed ${fixedCount} ${fixWord}`;
}

export function listHiringCycles(
  token: string,
): Promise<{ cycles: HiringCycleInfo[]; current: string | null }> {
  return slotsRequest<{ cycles: HiringCycleInfo[]; current?: string | null }>(
    '/hiring/cycles',
    token,
  ).then((data) => ({
    cycles: Array.isArray(data?.cycles) ? data.cycles : [],
    current: typeof data?.current === 'string' ? data.current : null,
  }));
}

/** Lightweight status page used for the announcement reach estimate. */
export function fetchApplicationStatusPage(
  token: string,
  options: { cycle?: string; limit?: number; page?: number } = {},
): Promise<{ rows: ApplicationStatusRow[]; total: number }> {
  const params = new URLSearchParams();
  if (options.cycle) params.set('cycle', options.cycle);
  params.set('limit', String(options.limit ?? 100));
  params.set('page', String(options.page ?? 1));
  return slotsRequest<unknown>(`/hiring/applications?${params.toString()}`, token).then(
    (payload) => {
      const rows = Array.isArray(payload)
        ? (payload as ApplicationStatusRow[])
        : ((payload as { data?: unknown })?.data as ApplicationStatusRow[] | undefined) ?? [];
      const meta = payload as {
        meta?: { total?: unknown };
        pagination?: { total?: unknown };
      };
      const total =
        typeof meta?.meta?.total === 'number'
          ? meta.meta.total
          : typeof meta?.pagination?.total === 'number'
            ? meta.pagination.total
            : rows.length;
      return { rows: Array.isArray(rows) ? rows : [], total };
    },
  );
}

// ─── Pure view helpers (offline-testable) ────────────────────────────────────

const IST_TIME_ZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** IST calendar key `YYYY-MM-DD` for an ISO instant (matches server semantics). */
export function istDateKeyOf(value: string | Date): string {
  return new Date(value).toLocaleDateString('en-CA', { timeZone: IST_TIME_ZONE });
}

/** IST wall-clock `HH:mm` (24-hour) for an ISO instant. */
export function formatIstClock(value: string | Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value));
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${hour}:${get('minute')}`;
}

/** `10:00–10:30 IST` range label for a slot. */
export function formatSlotRangeIst(startsAt: string | Date, endsAt: string | Date): string {
  return `${formatIstClock(startsAt)}–${formatIstClock(endsAt)} IST`;
}

/**
 * Preview-row label: `10:00–10:30 interview` plus ` · 10 min break` when
 * breakMinutes > 0 (matches the Phase 4 spec row format).
 */
export function describePreviewSlot(
  row: { startsAt: string | Date; endsAt: string | Date },
  breakMinutes: number,
): string {
  const range = formatSlotRangeIst(row.startsAt, row.endsAt).replace(' IST', '');
  return breakMinutes > 0
    ? `${range} interview · ${breakMinutes} min break`
    : `${range} interview`;
}

/** Confirm-button label with a live ok-count: `Create 12 slots` / `Create 1 slot`. */
export function bulkCreateButtonLabel(okCount: number): string {
  if (okCount <= 0) return 'Create slots';
  return `Create ${okCount} slot${okCount === 1 ? '' : 's'}`;
}

/** Post-create toast body: `Created 12, skipped 2 (conflicts)`. */
export function formatBulkResultMessage(created: number, skipped: number): string {
  if (skipped > 0) return `Created ${created}, skipped ${skipped} (conflicts)`;
  return `Created ${created} slot${created === 1 ? '' : 's'}`;
}

export interface SlotDateGroup {
  dateKey: string;
  slots: AdminInterviewSlot[];
}

/** Group slots by IST calendar date, groups + rows ascending. */
export function groupSlotsByIstDate(slots: AdminInterviewSlot[]): SlotDateGroup[] {
  const byKey = new Map<string, AdminInterviewSlot[]>();
  for (const slot of slots) {
    const key = istDateKeyOf(slot.startsAt);
    const list = byKey.get(key);
    if (list) list.push(slot);
    else byKey.set(key, [slot]);
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dateKey, group]) => ({
      dateKey,
      slots: [...group].sort((a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      ),
    }));
}

export interface DayGap {
  startsAt: string;
  endsAt: string;
}

/**
 * Free windows on an IST calendar day given the existing slot intervals:
 * the complement of the (clipped, merged) busy ranges between 00:00 and 24:00
 * IST. Powers the "gaps" line in the creation-card mini timeline.
 */
export function computeDayGaps(
  existing: Array<{ startsAt: string | Date; endsAt: string | Date }>,
  dateKey: string,
): DayGap[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return [];
  const dayStart = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - IST_OFFSET_MS;
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const busy = existing
    .map((s) => ({
      start: Math.max(new Date(s.startsAt).getTime(), dayStart),
      end: Math.min(new Date(s.endsAt).getTime(), dayEnd),
    }))
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
    .sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const r of busy) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }
  const gaps: DayGap[] = [];
  let cursor = dayStart;
  for (const r of merged) {
    if (r.start > cursor) {
      gaps.push({ startsAt: new Date(cursor).toISOString(), endsAt: new Date(r.start).toISOString() });
    }
    cursor = Math.max(cursor, r.end);
  }
  if (cursor < dayEnd) {
    gaps.push({ startsAt: new Date(cursor).toISOString(), endsAt: new Date(dayEnd).toISOString() });
  }
  return gaps;
}

export interface BookingRow {
  bookingId: string;
  applicationId: string;
  name: string;
  email: string;
  candidateRole: string;
  bookedAt: string;
  slotId: string;
  slotCycle: string;
  startsAt: string;
  endsAt: string;
  slotRole: string | null;
  venue: string | null;
}

/** Flatten every slot's bookings into overview rows, soonest slot first. */
export function flattenBookings(slots: AdminInterviewSlot[]): BookingRow[] {
  const rows: BookingRow[] = [];
  for (const slot of slots) {
    for (const booking of slot.bookings ?? []) {
      rows.push({
        bookingId: booking.id,
        applicationId: booking.applicationId,
        name: booking.name,
        email: booking.email,
        candidateRole: booking.applyingRole,
        bookedAt: booking.bookedAt,
        slotId: slot.id,
        slotCycle: slot.cycle,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        slotRole: slot.applyingRole,
        venue: slot.venue,
      });
    }
  }
  return rows.sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
}

export const BOOKINGS_CSV_HEADERS = [
  'Slot date (IST)',
  'Slot time (IST)',
  'Slot role',
  'Venue',
  'Candidate name',
  'Candidate email',
  'Candidate role',
  'Booked at (IST)',
] as const;

/** Mirrors `pollCsv.ts` quoting: wrap in doubles, double internal doubles. */
export function formatCsvCell(value: string | number): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function toCsvText(
  headers: readonly string[],
  rows: Array<Array<string | number>>,
): string {
  return [headers.map(formatCsvCell).join(','), ...rows.map((r) => r.map(formatCsvCell).join(','))].join('\n');
}

export function buildBookingsCsvRows(rows: BookingRow[]): Array<Array<string | number>> {
  return rows.map((r) => [
    istDateKeyOf(r.startsAt),
    formatSlotRangeIst(r.startsAt, r.endsAt),
    r.slotRole ?? 'Any',
    r.venue ?? '',
    r.name,
    r.email,
    r.candidateRole,
    new Date(r.bookedAt).toLocaleString('en-IN', {
      timeZone: IST_TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }),
  ]);
}

/** CSV download via blob (DOM only — not covered by node tests). */
export function downloadCsvText(filename: string, text: string): void {
  const content = `\uFEFF${text}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

export interface AwaitingApplication {
  id: string;
  name: string;
  email: string;
  applyingRole: string;
  cycle?: string;
  status: string;
  createdAt: string;
}

function hasBookedId(booked: ReadonlySet<string> | readonly string[], id: string): boolean {
  if (typeof (booked as ReadonlySet<string>).has === 'function') {
    return (booked as ReadonlySet<string>).has(id);
  }
  return (booked as readonly string[]).includes(id);
}

/**
 * "Awaiting slot pick": INTERVIEW_SCHEDULED applications with no booking yet,
 * oldest first (most urgent at the top).
 */
export function deriveAwaitingPick(
  applications: AwaitingApplication[],
  bookedAppIds: ReadonlySet<string> | readonly string[],
): AwaitingApplication[] {
  return applications
    .filter((a) => a.status === 'INTERVIEW_SCHEDULED' && !hasBookedId(bookedAppIds, a.id))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** Whole days since `createdAt` (urgency column). */
export function waitingDaysSince(createdAt: string | Date, nowMs = Date.now()): number {
  const diff = nowMs - new Date(createdAt).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}
