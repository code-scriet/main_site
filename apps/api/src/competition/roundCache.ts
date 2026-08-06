// Near-static contest-round + registration read caches (DB-load optimization).
//
// Why: during a live contest 120–250 students poll GET /:roundId,
// POST /:roundId/proctor/heartbeat, GET /:roundId/proctor/me and
// GET /:roundId/leaderboard every ~15s. Each of those re-runs
// `ensureRegisteredForRound`, which fires (1) a round `findUnique` with a
// problems+event join and (2) an eventRegistration `findUnique`. The round row
// and its linked problems are NEAR-STATIC during a contest, and a positive
// registration is effectively permanent for the contest — yet both are
// re-fetched on every poll by every student. A DB-layer stress test proved the
// 5-connection pooled Neon link is the bottleneck (each query is a network
// round-trip; the query itself is <1ms), so the goal is fewer queries-per-poll.
//
// Two caches, both O(1) memory (bounded by round count + a capped registration
// map, never by concurrent-user count — HC #1):
//   - Round cache: single-flight, 10s TTL, keyed by roundId. All students share
//     ONE query per 10s window instead of one each. Invalidated at every write
//     that changes the round row or its linked problems (see competition.ts).
//   - Registration cache: POSITIVE-ONLY, 30s TTL, capped LRU-ish. A cached
//     "registered" result skips the per-poll registration findUnique. A MISS
//     (no registration) ALWAYS re-queries live, so a brand-new registrant is
//     never wrongly blocked.
//
// Staleness tradeoff (deliberate): a registration deleted mid-contest (team
// dissolve, invitation revoke) can still read as valid for up to 30s — but ONLY
// on read-only polls and the heartbeat. Every endpoint that PERSISTS a contest
// artifact re-checks fresh: IMAGE_TARGET /save + /submit pass
// `liveRegistration: true` to ensureRegisteredForRound (bypassing this cache),
// and DSA submits are gated live in problemsCore.validateProblemContext. So a
// de-registered user can view/poll for up to 30s but cannot persist anything.
// The round cache never masks a write either: every state transition
// (start/lock/judging/finish/extend/edit/delete/publish-as-practice)
// invalidates it, so a stale ACTIVE round is at most 10s behind and the actual
// lock is enforced by the server-side timer regardless.

import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

// Single source of truth for the round shape `ensureRegisteredForRound` returns.
// Kept in lockstep with the GET /:roundId response mapping in competition.ts —
// moving it here means the cached fetch and the direct fetch can't drift.
export const roundCacheSelect = {
  id: true,
  eventId: true,
  title: true,
  description: true,
  duration: true,
  status: true,
  roundType: true,
  startedAt: true,
  lockedAt: true,
  createdAt: true,
  updatedAt: true,
  targetImageUrl: true,
  participantScope: true,
  leadersOnly: true,
  allowedTeamIds: true,
  proctored: true,
  penaltyModel: true,
  leaderboardFreezeMinutes: true,
  finalWeight: true,
  problems: {
    orderBy: { displayOrder: 'asc' },
    include: {
      problem: {
        select: {
          id: true,
          slug: true,
          title: true,
          difficulty: true,
          allowedLanguages: true,
          isPublished: true,
        },
      },
    },
  },
  event: {
    select: {
      teamRegistration: true,
    },
  },
} satisfies Prisma.CompetitionRoundSelect;

export type CachedRound = Prisma.CompetitionRoundGetPayload<{ select: typeof roundCacheSelect }>;

export type RoundFetcher = (roundId: string) => Promise<CachedRound | null>;
export type RegistrationFetcher = (userId: string, eventId: string) => Promise<boolean>;

export interface RoundCacheOptions {
  /** Round-row cache lifetime. Default 10s. */
  roundTtlMs?: number;
  /** Positive registration cache lifetime. Default 30s. */
  registrationTtlMs?: number;
  /** Lazy size bound for the round cache. Default 64. */
  roundMaxEntries?: number;
  /** Hard cap for the positive-registration map (oldest evicted on overflow). Default 2000. */
  registrationMaxEntries?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export interface RoundCache {
  /** Single-flight, TTL-bounded round read. Returns null for a missing round (also cached). */
  getCachedRound(roundId: string): Promise<CachedRound | null>;
  /** Drop one round's cached row (call at every write to that round or its problems). */
  invalidateRoundCache(roundId: string): void;
  /** Clear both caches wholesale (boot/recovery reset). */
  invalidateAllRoundCache(): void;
  /** True iff the user is registered for the event — positive result cached 30s, misses always live. */
  isRegisteredCached(userId: string, eventId: string): Promise<boolean>;
  /** Test seam: current round-cache entry count (used to assert the size cap holds). */
  debugRoundCacheSize(): number;
}

const DEFAULT_ROUND_TTL_MS = 10_000;
const DEFAULT_REGISTRATION_TTL_MS = 30_000;
const DEFAULT_ROUND_MAX_ENTRIES = 64;
const DEFAULT_REGISTRATION_MAX_ENTRIES = 2000;

/**
 * Factory (mirrors utils/executionRouting.ts `createExecutionRouter`): the prod
 * singleton wires the fetchers to Prisma, tests inject in-memory fetchers so the
 * whole thing runs WITHOUT a DB.
 */
export function createRoundCache(
  fetchRound: RoundFetcher,
  fetchRegistration: RegistrationFetcher,
  opts: RoundCacheOptions = {},
): RoundCache {
  const now = opts.now ?? Date.now;
  const roundTtlMs = Math.max(1, opts.roundTtlMs ?? DEFAULT_ROUND_TTL_MS);
  const registrationTtlMs = Math.max(1, opts.registrationTtlMs ?? DEFAULT_REGISTRATION_TTL_MS);
  const roundMaxEntries = Math.max(1, opts.roundMaxEntries ?? DEFAULT_ROUND_MAX_ENTRIES);
  const registrationMaxEntries = Math.max(1, opts.registrationMaxEntries ?? DEFAULT_REGISTRATION_MAX_ENTRIES);

  // Cache the in-flight PROMISE (not just the value) so a burst of concurrent
  // pollers on a cold/expired entry collapses into ONE compute (single-flight),
  // exactly like leaderboardCache in competitionRealtime.ts.
  const roundCache = new Map<string, { at: number; promise: Promise<CachedRound | null> }>();
  // Positive-only: presence ⇒ "registered". Value is the insertion instant (for
  // TTL). Insertion-ordered Map ⇒ oldest key is first, so overflow eviction is O(1).
  const registrationCache = new Map<string, number>();

  const getCachedRound = (roundId: string): Promise<CachedRound | null> => {
    const at = now();
    const cached = roundCache.get(roundId);
    if (cached && at - cached.at < roundTtlMs) return cached.promise;

    // Lazy size bound: if the map has grown (many rounds polled, none evicted),
    // sweep expired entries before inserting a fresh one.
    if (roundCache.size >= roundMaxEntries) {
      for (const [k, v] of roundCache) if (at - v.at >= roundTtlMs) roundCache.delete(k);
      // The sweep only drops EXPIRED entries, so if more than `roundMaxEntries` distinct
      // rounds are polled inside one TTL window nothing is expired and the map would grow
      // past its documented bound (HC #1). Evict oldest-first until the cap actually holds —
      // Map iteration is insertion-ordered, so the first key is the oldest.
      while (roundCache.size >= roundMaxEntries) {
        const oldest = roundCache.keys().next().value;
        if (oldest === undefined) break;
        roundCache.delete(oldest);
      }
    }

    const promise = fetchRound(roundId);
    roundCache.set(roundId, { at, promise });
    // Never cache a rejection — drop the entry so the next caller retries live.
    promise.catch(() => {
      if (roundCache.get(roundId)?.promise === promise) roundCache.delete(roundId);
    });
    return promise;
  };

  const invalidateRoundCache = (roundId: string): void => {
    roundCache.delete(roundId);
  };

  const invalidateAllRoundCache = (): void => {
    roundCache.clear();
    registrationCache.clear();
  };

  const isRegisteredCached = async (userId: string, eventId: string): Promise<boolean> => {
    const key = `${userId}:${eventId}`;
    const at = now();
    const seenAt = registrationCache.get(key);
    if (seenAt !== undefined) {
      if (at - seenAt < registrationTtlMs) return true; // positive hit, still fresh
      registrationCache.delete(key); // expired → fall through to a live re-query
    }

    // MISS (or expired) ALWAYS re-queries live so a brand-new registrant is never
    // wrongly blocked, and a stale-expired positive is re-verified.
    const registered = await fetchRegistration(userId, eventId);
    if (registered) {
      // Cache positives only. Re-insert (delete-then-set) so a refreshed key moves
      // to the tail → the map stays roughly LRU and overflow evicts the true oldest.
      registrationCache.delete(key);
      registrationCache.set(key, at);
      if (registrationCache.size > registrationMaxEntries) {
        const oldest = registrationCache.keys().next().value;
        if (oldest !== undefined) registrationCache.delete(oldest);
      }
    }
    return registered;
  };

  const debugRoundCacheSize = (): number => roundCache.size;

  return {
    getCachedRound,
    invalidateRoundCache,
    invalidateAllRoundCache,
    isRegisteredCached,
    debugRoundCacheSize,
  };
}

// ─── Process-wide singleton wired to Prisma (used by routes/competition.ts) ───

const prodCache = createRoundCache(
  (roundId) => prisma.competitionRound.findUnique({ where: { id: roundId }, select: roundCacheSelect }),
  async (userId, eventId) => {
    const registration = await prisma.eventRegistration.findUnique({
      where: { userId_eventId: { userId, eventId } },
      select: { id: true },
    });
    return registration !== null;
  },
);

export const getCachedRound = prodCache.getCachedRound;
export const invalidateRoundCache = prodCache.invalidateRoundCache;
export const isRegisteredCached = prodCache.isRegisteredCached;
// (invalidateAllRoundCache stays on the factory interface for tests; no prod
// caller exists — boot always starts with a cold cache in a fresh process.)
