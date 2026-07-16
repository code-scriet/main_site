// Per-request-identical QOTD read cache (DB-load optimization).
//
// Why: GET /today and GET /history/summary each run a query whose result is
// IDENTICAL for every (non-staff) caller within a given IST day — GET /today's
// "today's published QOTD row" and /history/summary's "every published QOTD id
// up to today". Those shared queries are re-run on every request by every
// student, even though the answer only changes when a QOTD goes live / is held /
// edited / deleted. On the small pooled Neon link each query is a network
// round-trip (the query itself is <1ms), so the win is fewer queries-per-request.
//
// The PER-USER parts (hasSubmitted/hasSolved) stay live queries in the route —
// only the shared row(s) are cached here.
//
// Two O(1)-memory cells (never grows with user count — HC #1), both:
//   - keyed by IST DATE: a new IST day = a different key ⇒ midnight rollover
//     serves a fresh fetch WITHOUT waiting out the TTL (yesterday's QOTD can
//     never bleed into today). The key is derived from the injectable clock.
//   - 60s TTL + single-flight: a burst of concurrent misses (TTL expiry, or the
//     stampede right after a publish invalidation) collapses into ONE query.
//   - never cache a rejection: a failed fetch drops the entry so the next caller
//     retries live.
//   - invalidated on EVERY path that changes which QOTD is live or its content
//     (create-and-publish-now, manual publish, auto-publish timer fire, hold,
//     edit-that-goes-live, delete) — see the call sites in routes/qotd.ts and
//     the auto-publish path in utils/scheduler.ts.
//
// Deliberately NOT invalidated (documented tradeoffs):
//   - reopen / close-reopen: only ever touch a PAST QOTD's reopenedAt (the route
//     rejects reopening today's or a future QOTD), so neither the today-row cell
//     (today only) nor the summary cell (id+problemId only) can hold that field.
//   - publish-practice / unpublish-practice: flip the linked PROBLEM's
//     isPublished, and only for a QOTD whose day has already ended (never
//     today's) — so today's cached row is unaffected and the summary cell
//     doesn't carry problem.isPublished.
//   - an edit of the underlying Problem row (via /api/problems) is out of scope;
//     the cached today-row's problem snapshot can lag ≤60s, matching the TTL of
//     the sibling QOTD leaderboard/streak caches (accepted).

import type { Problem, QOTD } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { formatUsageDate } from './dailyLimit.js';

/** The public GET /today shape: today's PUBLISHED QOTD row with its problem, or null. */
export type CachedTodayQotd = (QOTD & { problem: Problem | null }) | null;

/** The /history/summary shared shape: one lightweight row per published QOTD up to today. */
export interface PublishedQotdSummaryRow {
  id: string;
  problemId: string | null;
}

export type TodayFetcher = (istDateKey: string) => Promise<CachedTodayQotd>;
export type PublishedSummaryFetcher = (istDateKey: string) => Promise<PublishedQotdSummaryRow[]>;

export interface QotdTodayCacheOptions {
  /** Cell lifetime. Default 60s. */
  ttlMs?: number;
  /** Injectable clock for tests. Default Date.now. */
  now?: () => number;
  /** Injectable IST-date-key function for tests. Default derives from the clock. */
  istDateKey?: (nowMs: number) => string;
}

export interface QotdTodayCache {
  /** Today's published QOTD row (+problem), IST-date-keyed, 60s single-flight. */
  getTodayQotd(): Promise<CachedTodayQotd>;
  /** Every published QOTD's {id, problemId} up to end-of-today (IST), same keying. */
  getPublishedSummary(): Promise<PublishedQotdSummaryRow[]>;
  /** Drop both cells — call at every path that changes which QOTD is live or its content. */
  invalidate(): void;
}

const DEFAULT_TTL_MS = 60_000;

// One cached value that refreshes when EITHER the IST-date key changes (a new
// day) OR the TTL lapses. Single source of the single-flight + rejection rules,
// shared by both cells.
function createCell<T>(
  fetch: (key: string) => Promise<T>,
  now: () => number,
  keyOf: () => string,
  ttlMs: number,
): { get: () => Promise<T>; invalidate: () => void } {
  let entry: { key: string; at: number; promise: Promise<T> } | null = null;
  return {
    get(): Promise<T> {
      const key = keyOf();
      const at = now();
      // Fresh key AND within TTL ⇒ share the cached (possibly in-flight) promise.
      if (entry && entry.key === key && at - entry.at < ttlMs) return entry.promise;
      const promise = fetch(key);
      const current = { key, at, promise };
      entry = current;
      // Never cache a rejection: drop the entry so the next caller retries live
      // (identity-guarded so a fresh entry from an invalidate() isn't wiped).
      promise.catch(() => {
        if (entry === current) entry = null;
      });
      return promise;
    },
    invalidate(): void {
      entry = null;
    },
  };
}

/**
 * Factory (mirrors utils/executionRouting.ts + competition/roundCache.ts): the
 * prod singleton wires the fetchers to Prisma; tests inject in-memory fetchers +
 * clock + key function, so the whole thing runs WITHOUT a DB.
 */
export function createQotdTodayCache(
  fetchToday: TodayFetcher,
  fetchPublishedSummary: PublishedSummaryFetcher,
  opts: QotdTodayCacheOptions = {},
): QotdTodayCache {
  const now = opts.now ?? Date.now;
  const ttlMs = Math.max(1, opts.ttlMs ?? DEFAULT_TTL_MS);
  const keyOf = opts.istDateKey
    ? () => opts.istDateKey!(now())
    : () => formatUsageDate(new Date(now()));

  const todayCell = createCell(fetchToday, now, keyOf, ttlMs);
  const summaryCell = createCell(fetchPublishedSummary, now, keyOf, ttlMs);

  return {
    getTodayQotd: () => todayCell.get(),
    getPublishedSummary: () => summaryCell.get(),
    invalidate: () => {
      todayCell.invalidate();
      summaryCell.invalidate();
    },
  };
}

// UTC-midnight of an IST date key, and +24h — mirrors routes/qotd.ts
// qotdDateRange() so the cached fetch and the (bypassed) live admin fetch agree.
function istDayBounds(istDateKey: string): { start: Date; end: Date } {
  const start = new Date(`${istDateKey}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// ─── Process-wide singleton wired to Prisma (used by routes/qotd.ts + scheduler.ts) ───

const prodCache = createQotdTodayCache(
  (istDateKey) => {
    const { start, end } = istDayBounds(istDateKey);
    return prisma.qOTD.findFirst({
      where: { date: { gte: start, lt: end }, isPublished: true },
      include: { problem: true },
    });
  },
  (istDateKey) => {
    const { end } = istDayBounds(istDateKey);
    return prisma.qOTD.findMany({
      where: { date: { lt: end }, isPublished: true },
      select: { id: true, problemId: true },
    });
  },
);

export const getCachedTodayQotd = prodCache.getTodayQotd;
export const getCachedPublishedQotdSummary = prodCache.getPublishedSummary;
export const invalidateQotdTodayCache = prodCache.invalidate;
