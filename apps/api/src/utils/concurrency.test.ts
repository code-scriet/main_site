import assert from 'node:assert/strict';
import test from 'node:test';
import { createConcurrencyLimiter } from './concurrency.js';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test('concurrency: never runs more than the cap at once, but runs everything', async () => {
  const limit = createConcurrencyLimiter(3);
  let active = 0;
  let peakActive = 0;
  const order: number[] = [];

  const tasks = Array.from({ length: 12 }, (_, i) =>
    limit(async () => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      await tick();
      await tick();
      order.push(i);
      active -= 1;
      return i;
    }),
  );

  const results = await Promise.all(tasks);
  assert.ok(peakActive <= 3, `never exceeds the cap (peaked at ${peakActive})`);
  assert.equal(results.length, 12, 'every task still ran');
  assert.deepEqual(results, Array.from({ length: 12 }, (_, i) => i), 'results map to their task index');
  assert.deepEqual([...order].sort((a, b) => a - b), results, 'all 12 completed');
});

test('concurrency: preserves each task’s own typed result (heterogeneous)', async () => {
  const limit = createConcurrencyLimiter(2);
  const [a, b, c] = await Promise.all([
    limit(async () => 'str'),
    limit(async () => 42),
    limit(async () => ({ ok: true })),
  ]);
  // Compile-time: a is string, b is number, c is {ok:boolean}. Runtime asserts:
  assert.equal(a.toUpperCase(), 'STR');
  assert.equal(b + 1, 43);
  assert.equal(c.ok, true);
});

test('concurrency: one task rejecting does not affect the others, and frees its slot', async () => {
  const limit = createConcurrencyLimiter(2);
  const settled = await Promise.allSettled([
    limit(async () => { throw new Error('boom'); }),
    limit(async () => 'ok-1'),
    limit(async () => 'ok-2'),
    limit(async () => 'ok-3'),
  ]);
  assert.equal(settled[0].status, 'rejected');
  assert.deepEqual(
    settled.slice(1).map((s) => (s.status === 'fulfilled' ? s.value : null)),
    ['ok-1', 'ok-2', 'ok-3'],
    'a rejection never starves the queue — later tasks still run',
  );
});

test('concurrency: a cap < 1 is coerced to 1 (serial), still completing all', async () => {
  const limit = createConcurrencyLimiter(0);
  let active = 0;
  let peak = 0;
  const tasks = Array.from({ length: 4 }, () =>
    limit(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await tick();
      active -= 1;
    }),
  );
  await Promise.all(tasks);
  assert.equal(peak, 1, 'cap<1 runs strictly serially');
});
