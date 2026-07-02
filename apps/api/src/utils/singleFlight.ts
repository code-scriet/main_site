// Shared TTL + single-flight cache primitive.
//
// The codebase had grown five hand-rolled copies of "TTL cache + in-flight
// promise" (settingsCache, getHomePayload, getPublicStatsPayload, the S2b
// dashboard cache, the S2c QOTD dedupe slots) with subtly different shapes.
// This is the one canonical implementation for GLOBAL (not per-key) cached
// aggregates; new cached endpoints should use it instead of adding a sixth copy.
// (The three pre-existing copies are left as-is deliberately — migrating them is
// a separate hygiene change; see docs/reviews/2026-07-01-perf-batch-self-audit.md.)
//
// Correctness properties every copy previously had to get right individually:
//  - single-flight: concurrent get()s during a miss share ONE compute
//  - errors are never cached: a rejected compute rejects all waiters, and the
//    next get() retries fresh
//  - identity-guarded clear: a settling compute only clears the in-flight slot
//    if the slot still holds ITS promise — an invalidate() + new compute in the
//    window can't be wiped by the old compute's finally (which would silently
//    disable single-flight and re-open the stampede)
//  - generation fencing: invalidate() bumps a generation; a compute started
//    BEFORE the invalidation may still serve its (then-current) waiters but can
//    never write the cache — closing the stale-write-back window where a
//    pre-invalidation board would otherwise be served for a full TTL
export interface TtlSingleFlight<T> {
  get(): Promise<T>;
  invalidate(): void;
}

export function createTtlSingleFlight<T>(ttlMs: number, compute: () => Promise<T>): TtlSingleFlight<T> {
  let cache: { data: T; expiresAt: number } | null = null;
  let inflight: Promise<T> | null = null;
  let generation = 0;

  return {
    get(): Promise<T> {
      if (cache && cache.expiresAt > Date.now()) return Promise.resolve(cache.data);
      if (inflight) return inflight;
      const startedGeneration = generation;
      const p = compute()
        .then((data) => {
          if (generation === startedGeneration) {
            cache = { data, expiresAt: Date.now() + ttlMs };
          }
          return data;
        })
        .finally(() => {
          if (inflight === p) inflight = null;
        });
      inflight = p;
      return p;
    },
    invalidate(): void {
      generation += 1;
      cache = null;
      inflight = null;
    },
  };
}
