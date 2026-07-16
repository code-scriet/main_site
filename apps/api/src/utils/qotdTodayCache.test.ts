// Unit tests for the QOTD today/summary read cache. Pins the semantics the
// GET /today + GET /history/summary endpoints rely on: 60s TTL, single-flight
// coalescing (a burst of concurrent loads = one query), invalidation on a
// go-live/hold/edit/delete, IST-date-key ROLLOVER (a new day refetches even
// before the TTL lapses, so yesterday's QOTD can never bleed into today), and
// rejections never cached. Runs entirely without a DB via injected fetchers +
// clock + key function (mirrors competition/roundCache.test.ts).

import assert from 'node:assert/strict';
import test from 'node:test';
import { createQotdTodayCache, type CachedTodayQotd, type PublishedQotdSummaryRow } from './qotdTodayCache.js';

const fakeQotd = (id: string): CachedTodayQotd => ({ id, problem: null } as unknown as CachedTodayQotd);

function harness(opts: Parameters<typeof createQotdTodayCache>[2] = {}) {
  let clock = 0;
  let key = 'day-1';
  let failTodayOnce = false;
  let todayValue: CachedTodayQotd = fakeQotd('q1');
  const calls = { today: 0, summary: 0 };
  const cache = createQotdTodayCache(
    async () => {
      calls.today += 1;
      if (failTodayOnce) { failTodayOnce = false; throw new Error('db down'); }
      return todayValue;
    },
    async () => {
      calls.summary += 1;
      return [{ id: 'q1', problemId: 'p1' }] as PublishedQotdSummaryRow[];
    },
    { now: () => clock, istDateKey: () => key, ...opts },
  );
  return {
    cache,
    calls,
    tick: (ms: number) => { clock += ms; },
    setKey: (k: string) => { key = k; },
    setToday: (v: CachedTodayQotd) => { todayValue = v; },
    failNextToday: () => { failTodayOnce = true; },
  };
}

test('TTL: repeated gets inside the window hit the cache, expiry refetches', async () => {
  const h = harness({ ttlMs: 60_000 });
  await h.cache.getTodayQotd();
  await h.cache.getTodayQotd();
  assert.equal(h.calls.today, 1); // second read served from cache

  h.tick(59_999);
  await h.cache.getTodayQotd();
  assert.equal(h.calls.today, 1); // still inside TTL

  h.tick(2); // now past 60s
  await h.cache.getTodayQotd();
  assert.equal(h.calls.today, 2); // refetched after expiry
});

test('single-flight: concurrent misses collapse into ONE fetch', async () => {
  const clock = 0;
  let calls = 0;
  let resolveFetch!: (v: CachedTodayQotd) => void;
  const cache = createQotdTodayCache(
    () => {
      calls += 1;
      return new Promise<CachedTodayQotd>((resolve) => { resolveFetch = resolve; });
    },
    async () => [],
    { now: () => clock, istDateKey: () => 'd1' },
  );

  const p1 = cache.getTodayQotd();
  const p2 = cache.getTodayQotd();
  assert.equal(calls, 1); // both callers share the one in-flight compute

  resolveFetch(fakeQotd('q1'));
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1, r2);
  assert.equal(calls, 1);
});

test('invalidate() drops BOTH cells → next get refetches', async () => {
  const h = harness({ ttlMs: 60_000 });
  await h.cache.getTodayQotd();
  await h.cache.getPublishedSummary();
  assert.equal(h.calls.today, 1);
  assert.equal(h.calls.summary, 1);

  h.cache.invalidate();

  await h.cache.getTodayQotd();
  await h.cache.getPublishedSummary();
  assert.equal(h.calls.today, 2);
  assert.equal(h.calls.summary, 2);
});

test('a fresh solve is reflected after invalidation, not after the TTL', async () => {
  const h = harness({ ttlMs: 60_000 });
  h.setToday(fakeQotd('old'));
  const first = await h.cache.getTodayQotd();
  assert.equal(first?.id, 'old');

  // A publish/hold path swaps the live row and invalidates within the TTL window.
  h.setToday(fakeQotd('new'));
  h.cache.invalidate();
  const second = await h.cache.getTodayQotd();
  assert.equal(second?.id, 'new');
});

test('IST-date-key rollover: a new day refetches even before TTL expiry', async () => {
  const h = harness({ ttlMs: 24 * 60 * 60 * 1000 }); // 1-day TTL so ONLY the key change can force a refetch
  await h.cache.getTodayQotd();
  assert.equal(h.calls.today, 1);

  h.tick(2 * 60 * 60 * 1000); // +2h, well within TTL, same key
  await h.cache.getTodayQotd();
  assert.equal(h.calls.today, 1); // still cached

  h.setKey('day-2'); // crossed IST midnight
  await h.cache.getTodayQotd();
  assert.equal(h.calls.today, 2); // fresh fetch despite the TTL not having lapsed
});

test('default IST-date key: crossing IST midnight refetches inside a large TTL', async () => {
  let clock = Date.parse('2026-07-16T17:30:00.000Z'); // IST 2026-07-16 23:00
  let calls = 0;
  const cache = createQotdTodayCache(
    async () => { calls += 1; return null; },
    async () => [],
    { now: () => clock, ttlMs: 7 * 24 * 60 * 60 * 1000 }, // default (real IST) key, 7-day TTL
  );
  await cache.getTodayQotd();
  assert.equal(calls, 1);

  clock = Date.parse('2026-07-16T19:30:00.000Z'); // IST 2026-07-17 01:00 — +2h, next IST day
  await cache.getTodayQotd();
  assert.equal(calls, 2); // 2026-07-16 → 2026-07-17 forces a refetch though the TTL is far from expiry
});

test('a rejected fetch is NOT cached — the next get retries live', async () => {
  const h = harness({ ttlMs: 60_000 });
  h.failNextToday();
  await assert.rejects(h.cache.getTodayQotd(), /db down/);
  assert.equal(h.calls.today, 1);

  const value = await h.cache.getTodayQotd(); // retries, succeeds
  assert.equal(h.calls.today, 2);
  assert.ok(value);
});
