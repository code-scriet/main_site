// Unit tests for the contest round/registration caches. Pins the semantics the
// contest polling endpoints rely on: single-flight coalescing (a burst of
// pollers = one query), TTL expiry, write-invalidation, rejections never
// cached, and the registration cache's POSITIVE-ONLY rule (a miss must always
// re-query live so a brand-new registrant is never wrongly blocked).

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoundCache, type CachedRound } from './roundCache.js';

const fakeRound = (id: string) => ({ id, eventId: `event-${id}` } as unknown as CachedRound);

function harness(opts: Parameters<typeof createRoundCache>[2] = {}) {
  let clock = 0;
  const calls = { round: 0, registration: 0 };
  const registrations = new Set<string>();
  const cache = createRoundCache(
    async (roundId) => {
      calls.round += 1;
      if (roundId === 'missing') return null;
      if (roundId === 'boom') throw new Error('db down');
      return fakeRound(roundId);
    },
    async (userId, eventId) => {
      calls.registration += 1;
      return registrations.has(`${userId}:${eventId}`);
    },
    { now: () => clock, ...opts },
  );
  return { cache, calls, registrations, tick: (ms: number) => { clock += ms; } };
}

test('round: concurrent pollers coalesce into one query (single-flight)', async () => {
  const { cache, calls } = harness();
  const [a, b, c] = await Promise.all([
    cache.getCachedRound('r1'),
    cache.getCachedRound('r1'),
    cache.getCachedRound('r1'),
  ]);
  assert.equal(calls.round, 1);
  assert.equal(a?.id, 'r1');
  assert.equal(b, a);
  assert.equal(c, a);
});

test('round: cached within TTL, re-fetched after expiry', async () => {
  const { cache, calls, tick } = harness({ roundTtlMs: 10_000 });
  await cache.getCachedRound('r1');
  tick(9_999);
  await cache.getCachedRound('r1');
  assert.equal(calls.round, 1);
  tick(2);
  await cache.getCachedRound('r1');
  assert.equal(calls.round, 2);
});

test('round: invalidation forces the next read to hit the DB', async () => {
  const { cache, calls } = harness();
  await cache.getCachedRound('r1');
  cache.invalidateRoundCache('r1');
  await cache.getCachedRound('r1');
  assert.equal(calls.round, 2);
});

test('round: a missing round (null) is cached like any value', async () => {
  const { cache, calls } = harness();
  assert.equal(await cache.getCachedRound('missing'), null);
  assert.equal(await cache.getCachedRound('missing'), null);
  assert.equal(calls.round, 1);
});

test('round: rejections are never cached — next caller retries live', async () => {
  const { cache, calls } = harness();
  await assert.rejects(() => cache.getCachedRound('boom'));
  await assert.rejects(() => cache.getCachedRound('boom'));
  assert.equal(calls.round, 2);
});

test('round: distinct rounds cache independently', async () => {
  const { cache, calls } = harness();
  await cache.getCachedRound('r1');
  await cache.getCachedRound('r2');
  cache.invalidateRoundCache('r1');
  await Promise.all([cache.getCachedRound('r1'), cache.getCachedRound('r2')]);
  assert.equal(calls.round, 3); // r1 twice, r2 once
});

test('round: size bound sweeps expired entries instead of growing unbounded', async () => {
  const { cache, calls, tick } = harness({ roundMaxEntries: 3, roundTtlMs: 1_000 });
  await cache.getCachedRound('a');
  await cache.getCachedRound('b');
  await cache.getCachedRound('c');
  tick(2_000); // all expired
  await cache.getCachedRound('d'); // triggers the sweep, then inserts fresh
  await cache.getCachedRound('a'); // expired earlier → refetch
  assert.equal(calls.round, 5);
});

test('registration: positive result cached within TTL', async () => {
  const { cache, calls, registrations } = harness();
  registrations.add('u1:event-1');
  assert.equal(await cache.isRegisteredCached('u1', 'event-1'), true);
  assert.equal(await cache.isRegisteredCached('u1', 'event-1'), true);
  assert.equal(calls.registration, 1);
});

test('registration: a MISS is never cached — new registrant is seen immediately', async () => {
  const { cache, calls, registrations } = harness();
  assert.equal(await cache.isRegisteredCached('u2', 'event-1'), false);
  assert.equal(await cache.isRegisteredCached('u2', 'event-1'), false);
  assert.equal(calls.registration, 2, 'both misses must query live');
  registrations.add('u2:event-1'); // student registers between polls
  assert.equal(await cache.isRegisteredCached('u2', 'event-1'), true);
  assert.equal(calls.registration, 3);
});

test('registration: positive expires after TTL and is re-verified live', async () => {
  const { cache, calls, registrations, tick } = harness({ registrationTtlMs: 30_000 });
  registrations.add('u1:event-1');
  await cache.isRegisteredCached('u1', 'event-1');
  tick(30_001);
  registrations.delete('u1:event-1'); // e.g. team dissolved
  assert.equal(await cache.isRegisteredCached('u1', 'event-1'), false);
  assert.equal(calls.registration, 2);
});

test('registration: overflow evicts the oldest positive entry', async () => {
  const { cache, calls, registrations } = harness({ registrationMaxEntries: 2 });
  for (const u of ['u1', 'u2', 'u3']) registrations.add(`${u}:event-1`);
  await cache.isRegisteredCached('u1', 'event-1');
  await cache.isRegisteredCached('u2', 'event-1');
  await cache.isRegisteredCached('u3', 'event-1'); // evicts u1
  await cache.isRegisteredCached('u1', 'event-1'); // must re-query live
  assert.equal(calls.registration, 4);
});

test('invalidateAllRoundCache clears both caches', async () => {
  const { cache, calls, registrations } = harness();
  registrations.add('u1:event-1');
  await cache.getCachedRound('r1');
  await cache.isRegisteredCached('u1', 'event-1');
  cache.invalidateAllRoundCache();
  await cache.getCachedRound('r1');
  await cache.isRegisteredCached('u1', 'event-1');
  assert.equal(calls.round, 2);
  assert.equal(calls.registration, 2);
});

// Audit F8: the pre-sweep only dropped EXPIRED entries, so polling more than
// `roundMaxEntries` distinct rounds inside a single TTL window left nothing to evict and
// the map grew past its documented bound (HC #1). The cap must hold regardless of TTL.
test('round: cap holds even when nothing has expired yet', async () => {
  const { cache } = harness({ roundMaxEntries: 4, roundTtlMs: 10_000 });
  // 20 distinct rounds, all inside one TTL window (clock never advances).
  for (let i = 0; i < 20; i++) await cache.getCachedRound(`r${i}`);
  assert.ok(
    cache.debugRoundCacheSize() <= 4,
    `round cache grew past its cap: ${cache.debugRoundCacheSize()}`,
  );
});

test('round: cap eviction is oldest-first, newest entries survive', async () => {
  const { cache, calls } = harness({ roundMaxEntries: 3, roundTtlMs: 10_000 });
  await cache.getCachedRound('r1');
  await cache.getCachedRound('r2');
  await cache.getCachedRound('r3'); // sweep+evict fires here, dropping the oldest
  const before = calls.round;
  await cache.getCachedRound('r3'); // most recent → still cached, no new query
  assert.equal(calls.round, before, 'the newest entry must survive eviction');
});
