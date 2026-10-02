// Candidate interview-slot endpoints: token-or-session aware fetch helpers.
// Uses raw fetch (not ./_internal `request`) so the typed server `error_type`
// survives — `request` reduces every failure to message + field errors, which
// would erase the slot_full / already_booked / slot_closed / past_slot /
// cancel_cutoff distinction the picker depends on.

import { API_URL, UnauthorizedError } from './_internal';
import { extractSlotErrorType } from '../interviewSlotsCandidate';
import type { Announcement } from '../api';

export interface CandidateSlot {
  id: string;
  cycle: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  spotsLeft: number;
  isOpen: boolean;
  applyingRole: string | null;
  venue: string | null;
}

export interface CandidateBookingSlot {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  isOpen: boolean;
  applyingRole: string | null;
  venue: string | null;
}

export interface CandidateBooking {
  id: string;
  bookedAt: string;
  slot: CandidateBookingSlot;
}

export type MyInterviewBookingResult = { hasBooking: false } | { hasBooking: true; booking: CandidateBooking };

export interface BookInterviewSlotResult {
  booking: { id: string; bookedAt?: string };
  slot: CandidateBookingSlot;
}

/** Carries the HTTP status and the server `error_type` (when present). */
export class SlotApiError extends Error {
  readonly status?: number;
  readonly errorType?: string;

  constructor(message: string, options: { status?: number; errorType?: string } = {}) {
    super(message);
    this.name = 'SlotApiError';
    this.status = options.status;
    this.errorType = options.errorType;
  }
}

export interface SlotAuth {
  /** Logged-in session JWT (sent as Bearer). */
  sessionToken?: string | null;
  /** Magic-link token from ?token= (sent as ?token= query). */
  slotToken?: string | null;
}

function pickAuth(auth: SlotAuth): { headers: Record<string, string>; queryToken: string | null } {
  const slotToken = auth.slotToken?.trim() ? auth.slotToken.trim() : null;
  const sessionToken = !slotToken && auth.sessionToken ? auth.sessionToken : null;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  return { headers, queryToken: slotToken };
}

function withTokenQuery(path: string, queryToken: string | null, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (queryToken) params.set('token', queryToken);
  if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, v);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function readMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const p = payload as { error?: unknown; message?: unknown };
    if (p.error && typeof p.error === 'object') {
      const msg = (p.error as { message?: unknown }).message;
      if (typeof msg === 'string' && msg.trim()) return msg.trim();
    }
    if (typeof p.message === 'string' && p.message.trim()) return p.message.trim();
  }
  return fallback;
}

async function slotRequest<T>(path: string, auth: SlotAuth, init?: RequestInit): Promise<T> {
  const { headers, queryToken } = pickAuth(auth);
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    // Session mode keeps the app-wide 401 auto-logout contract; a bad magic
    // link is a SlotApiError so the public page can render "link invalid".
    if (response.status === 401 && !queryToken) {
      throw new UnauthorizedError(readMessage(payload, 'Authentication required'));
    }
    throw new SlotApiError(readMessage(payload, `Request failed (${response.status})`), {
      status: response.status,
      errorType: extractSlotErrorType(payload),
    });
  }
  const json = (await response.json()) as { data?: T } & T;
  return (json.data !== undefined ? json.data : json) as T;
}

export const hiringSlotsApi = {
  /** Open slots with remaining capacity for this candidate's cycle/role. */
  getAvailableInterviewSlots: (auth: SlotAuth) =>
    slotRequest<{ slots: CandidateSlot[] }>(
      withTokenQuery('/hiring/slots/available', pickAuth(auth).queryToken),
      auth,
    ),

  /** Current booking, if any. Fetch this first: hasBooking → card, else picker. */
  getMyInterviewBooking: (auth: SlotAuth) =>
    slotRequest<MyInterviewBookingResult>(withTokenQuery('/hiring/my-booking', pickAuth(auth).queryToken), auth),

  /** Book one slot. Typed 409s carry error_type: already_booked / slot_full / slot_closed; 400: past_slot. */
  bookInterviewSlot: (slotId: string, auth: SlotAuth) =>
    slotRequest<BookInterviewSlotResult>(withTokenQuery(`/hiring/slots/${slotId}/book`, pickAuth(auth).queryToken), auth, {
      method: 'POST',
    }),

  /** Cancel own booking. 400 cancel_cutoff inside 24h. Success re-opens the pick window. */
  cancelMyInterviewBooking: (auth: SlotAuth) =>
    slotRequest<{ message?: string }>(withTokenQuery('/hiring/my-booking/cancel', pickAuth(auth).queryToken), auth, {
      method: 'POST',
    }),

  /**
   * Announcements visible to this candidate, including their hiring-cohort
   * posts. Logged-in → Bearer session; magic link → ?token=. Never call
   * without either token expecting cohort posts — the server then returns
   * ALL-audience posts only.
   */
  getCandidateAnnouncements: (auth: SlotAuth, limit = 20) =>
    slotRequest<Announcement[]>(
      withTokenQuery('/announcements', pickAuth(auth).queryToken, { limit: String(limit) }),
      auth,
    ),
} as const;
