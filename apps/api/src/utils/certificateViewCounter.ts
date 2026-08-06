// Batched view counter for public certificate verification.
//
// Why: `GET /api/certificates/verify/:code` is UNAUTHENTICATED and public, and it used to
// fire a `certificate.update({ viewCount: { increment: 1 } })` on every single hit —
// including crawlers, link-preview bots and scanners. That is a DB WRITE per public READ,
// against a Neon pooled link where the connection round-trip is the scarce resource (the
// same reason competition/roundCache.ts exists). Bounded only by the anonymous IP limiter
// at 2000/15min, it was a cheap write-amplification lever.
//
// Now: increments accumulate in a bounded in-memory map and are flushed periodically as ONE
// set-based statement (the `UPDATE … FROM (VALUES …)` shape used by quizStore's persist
// path), so N views across a window cost one round-trip instead of N.
//
// Tradeoff (deliberate): viewCount is engagement telemetry, not an audit trail. A crash
// between flushes loses at most one window's counts. `flushCertificateViews()` is wired
// into the shutdown path so a normal restart/redeploy loses nothing.

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from './logger.js';

/** How often buffered increments are written back. */
const FLUSH_INTERVAL_MS = 30_000;
/**
 * Hard cap on distinct certIds held between flushes. Reaching it forces an early flush, so
 * memory stays O(1) regardless of traffic — a scanner walking many certIds cannot grow this
 * without bound (HC #1).
 */
const MAX_PENDING_ENTRIES = 500;

const pending = new Map<string, number>(); // certId → buffered increment
let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushInFlight: Promise<void> | null = null;

/** Write buffered increments back in one statement. Never throws — telemetry must not 500 a read. */
export async function flushCertificateViews(): Promise<void> {
  // Single-flight: a periodic tick and an overflow-triggered flush must not race and
  // double-apply the same buffered counts.
  if (flushInFlight) return flushInFlight;
  if (pending.size === 0) return;

  // Snapshot and clear synchronously (single-threaded, so no increment can be lost
  // between these two lines) — new views during the await land in a fresh buffer.
  const batch = Array.from(pending.entries());
  pending.clear();

  flushInFlight = (async () => {
    try {
      const rows = Prisma.join(batch.map(([certId, inc]) => Prisma.sql`(${certId}::text, ${inc}::int)`));
      await prisma.$executeRaw`
        UPDATE certificates AS c
        SET view_count = c.view_count + v.inc
        FROM (VALUES ${rows}) AS v(cert_id, inc)
        WHERE c.cert_id = v.cert_id
      `;
    } catch (error) {
      // Put the counts back so a transient failure defers rather than discards them.
      // Bounded by MAX_PENDING_ENTRIES on the next recordCertificateView call.
      for (const [certId, inc] of batch) {
        pending.set(certId, (pending.get(certId) ?? 0) + inc);
      }
      logger.warn('Failed to flush certificate view counts', {
        entries: batch.length,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      flushInFlight = null;
    }
  })();

  return flushInFlight;
}

function ensureFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushCertificateViews();
  }, FLUSH_INTERVAL_MS);
  // Don't hold the process open just for telemetry.
  if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

/** Buffer one view for `certId`. Returns immediately; the DB write happens on the next flush. */
export function recordCertificateView(certId: string): void {
  if (!certId) return;
  ensureFlushTimer();
  pending.set(certId, (pending.get(certId) ?? 0) + 1);
  if (pending.size >= MAX_PENDING_ENTRIES) {
    void flushCertificateViews();
  }
}

/** Stop the periodic timer (shutdown). Callers should await flushCertificateViews() first. */
export function stopCertificateViewFlusher(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

/** Test seam: buffered entry count. */
export function pendingCertificateViewCount(): number {
  return pending.size;
}
