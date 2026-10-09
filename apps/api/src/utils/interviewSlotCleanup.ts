// Expired-slot cleanup (hiring pipeline).
//
// A slot that has finished and never got booked is dead weight: candidates
// cannot pick it (the availability query and the booking transaction both
// require startsAt > now), it cannot be re-opened to the future because slot
// times are immutable, and it keeps inflating the admin board. So once its
// window is fully closed and it holds zero bookings we remove the row.
//
// Slots with bookings are NEVER touched here — the booking is the interview
// record, and the admin board needs the slot row to render that history.

import { prisma } from '../lib/prisma.js';
import { logger } from './logger.js';
import { socketEvents } from './socket.js';

/**
 * Small delay after `endsAt` before a blank slot is removed. Two reasons: an
 * interview running a few minutes long still shows as a live row, and a booking
 * request that was already in flight when the window closed commits against a
 * row that still exists (it is rejected by the past-slot check either way).
 */
export const EXPIRED_SLOT_GRACE_MS = 10 * 60 * 1000;

/** Self-gate for the opportunistic sweep so list polls don't write every time. */
export const EXPIRED_SLOT_MIN_INTERVAL_MS = 60 * 1000;

/** Upper bound per sweep; expired blanks are a trickle, so this is generous. */
export const EXPIRED_SLOT_SWEEP_MAX = 500;

let lastSweepAt = 0;

/** Rows at or after this instant are still inside (or ahead of) their window. */
export function expiredSlotCutoff(nowMs: number = Date.now()): Date {
  return new Date(nowMs - EXPIRED_SLOT_GRACE_MS);
}

/** Reset the self-gate (tests + the manual admin endpoint forcing a sweep). */
export function resetExpiredSlotSweepGate(): void {
  lastSweepAt = 0;
}

export interface ExpiredSlotSweepResult {
  removed: number;
  slots: Array<{ id: string; cycle: string; startsAt: string; endsAt: string }>;
}

/**
 * Delete every slot whose window has fully closed and that nobody booked.
 *
 * "Blank" is decided by the absence of `InterviewSlotBooking` rows
 * (`bookings: { none: {} }`) rather than the denormalised `bookedCount`, because
 * that counter can drift after admin seat releases and a cascade delete on a
 * drifted counter would silently destroy a real interview booking. The same
 * relation filter is re-applied on the DELETE itself, so the pre-select is only
 * used for logging and cannot widen what gets removed.
 */
export async function removeExpiredUnbookedSlots(opts?: {
  nowMs?: number;
  cycle?: string;
}): Promise<ExpiredSlotSweepResult> {
  const nowMs = opts?.nowMs ?? Date.now();
  const cycle = opts?.cycle?.trim() || undefined;
  const cutoff = expiredSlotCutoff(nowMs);

  const doomedWhere = {
    endsAt: { lt: cutoff },
    bookings: { none: {} },
    ...(cycle ? { cycle } : {}),
  };

  const doomed = (await prisma.interviewSlot.findMany({
    where: doomedWhere,
    select: { id: true, cycle: true, startsAt: true, endsAt: true },
    take: EXPIRED_SLOT_SWEEP_MAX,
    orderBy: { endsAt: 'asc' },
  })) as unknown as Array<{ id: string; cycle: string; startsAt: Date; endsAt: Date }>;

  if (doomed.length === 0) return { removed: 0, slots: [] };

  const { count } = await prisma.interviewSlot.deleteMany({
    where: { id: { in: doomed.map((s) => s.id) }, bookings: { none: {} } },
  });

  const result: ExpiredSlotSweepResult = {
    removed: count,
    slots: doomed.map((s) => ({
      id: s.id,
      cycle: s.cycle,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
    })),
  };

  if (count > 0) {
    logger.info('🧹 Removed expired unbooked interview slots', {
      removed: count,
      cutoff: cutoff.toISOString(),
      ...(cycle ? { cycle } : {}),
    });
    // Live boards drop the rows without a reload.
    socketEvents.liveInvalidate('slots');
  }
  return result;
}

/**
 * Sweep at most once per EXPIRED_SLOT_MIN_INTERVAL_MS and never throw. Used on
 * hot read paths (the admin slot list) and by the scheduler tick, where a Neon
 * hiccup must not break the request or the tick.
 */
export async function removeExpiredUnbookedSlotsIfDue(
  opts?: { nowMs?: number; cycle?: string; force?: boolean },
): Promise<ExpiredSlotSweepResult> {
  const nowMs = opts?.nowMs ?? Date.now();
  if (!opts?.force && nowMs - lastSweepAt < EXPIRED_SLOT_MIN_INTERVAL_MS) {
    return { removed: 0, slots: [] };
  }
  lastSweepAt = nowMs;
  try {
    return await removeExpiredUnbookedSlots({ nowMs, ...(opts?.cycle ? { cycle: opts.cycle } : {}) });
  } catch (error) {
    logger.error('Expired interview slot cleanup failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { removed: 0, slots: [] };
  }
}
