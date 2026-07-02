// Tests for the canonical TTL + single-flight primitive. Each of the four
// correctness properties documented in singleFlight.ts gets a direct test —
// the identity-guard and generation-fence exist because the hand-rolled
// versions of this exact diff shipped without them (see
// docs/reviews/2026-07-01-perf-batch-self-audit.md findings 2–4).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createTtlSingleFlight } from './singleFlight.js';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test('singleFlight: concurrent misses share ONE compute; TTL serves the cached value', async () => {
  let computes = 0;
  const board = createTtlSingleFlight(60_000, async () => {
    computes += 1;
    await tick();
    return { n: computes };
  });

  const [a, b, c] = await Promise.all([board.get(), board.get(), board.get()]);
  assert.equal(computes, 1, 'three concurrent misses must run one compute');
  assert.deepEqual(a, { n: 1 });
  assert.equal(a, b);
  assert.equal(b, c);

  const cached = await board.get();
  assert.equal(computes, 1, 'within TTL, get() must not recompute');
  assert.equal(cached, a);
});

test('singleFlight: errors reject all waiters and are never cached', async () => {
  let computes = 0;
  const board = createTtlSingleFlight(60_000, async () => {
    computes += 1;
    if (computes === 1) throw new Error('boom');
    return 'recovered';
  });

  const results = await Promise.allSettled([board.get(), board.get()]);
  assert.equal(computes, 1);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].status, 'rejected');

  // The failure must not poison the slot or the cache — next get() retries.
  assert.equal(await board.get(), 'recovered');
  assert.equal(computes, 2);
});

test('singleFlight: invalidate() during a compute fences the stale write-back', async () => {
  let release!: (v: string) => void;
  const gate = new Promise<string>((resolve) => { release = resolve; });
  let computes = 0;
  const board = createTtlSingleFlight(60_000, async () => {
    computes += 1;
    if (computes === 1) return gate; // slow first compute
    return 'fresh';
  });

  const stale = board.get(); // compute #1 in flight
  board.invalidate(); // e.g. a new solve landed mid-compute

  release('stale'); // compute #1 settles AFTER the invalidation
  assert.equal(await stale, 'stale', 'in-flight waiters still get their result');

  // The fenced compute must NOT have written the cache: a fresh get() recomputes.
  assert.equal(await board.get(), 'fresh');
  assert.equal(computes, 2);
});

test('singleFlight: an old compute settling cannot wipe a NEWER in-flight slot (identity guard)', async () => {
  let releaseFirst!: (v: string) => void;
  let releaseSecond!: (v: string) => void;
  const firstGate = new Promise<string>((resolve) => { releaseFirst = resolve; });
  const secondGate = new Promise<string>((resolve) => { releaseSecond = resolve; });
  let computes = 0;
  const board = createTtlSingleFlight(60_000, () => {
    computes += 1;
    return computes === 1 ? firstGate : secondGate;
  });

  void board.get(); // compute #1 in flight
  board.invalidate(); // clears the slot
  const second = board.get(); // compute #2 installs itself in the slot
  assert.equal(computes, 2);

  releaseFirst('old'); // compute #1 settles — its finally must NOT null compute #2's slot
  await tick();

  // If the identity guard were missing, this get() would start compute #3
  // (single-flight silently broken). With it, the in-flight #2 is shared.
  const third = board.get();
  assert.equal(computes, 2, 'old compute settling must not evict the newer in-flight compute');
  releaseSecond('new');
  assert.equal(await second, 'new');
  assert.equal(await third, 'new');
});
