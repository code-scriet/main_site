// Unit tests for the dual-provider execution router. Pins the routing rules the
// contest capacity plan depends on: balanced least-loaded split, JS pinned to
// Wandbox (godbolt has no JS runtime), infra-failure cooldowns steering traffic
// to the healthy host, per-provider lane concurrency, and queue-cap admission.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createExecutionRouter, normalizeProviderSetting, providerSupportsLanguage } from './executionRouting.js';

test('normalizeProviderSetting: known values pass, junk falls to wandbox', () => {
  assert.equal(normalizeProviderSetting('wandbox'), 'wandbox');
  assert.equal(normalizeProviderSetting('godbolt'), 'godbolt');
  assert.equal(normalizeProviderSetting('balanced'), 'balanced');
  assert.equal(normalizeProviderSetting('piston'), 'wandbox');
  assert.equal(normalizeProviderSetting(undefined), 'wandbox');
});

test('providerSupportsLanguage: godbolt cannot run JavaScript', () => {
  assert.equal(providerSupportsLanguage('godbolt', 'JAVASCRIPT'), false);
  assert.equal(providerSupportsLanguage('godbolt', 'PYTHON'), true);
  assert.equal(providerSupportsLanguage('wandbox', 'JAVASCRIPT'), true);
});

test('JS always routes to wandbox, even balanced / godbolt-primary / wandbox cooling', () => {
  const router = createExecutionRouter();
  router.reportInfraFailure('wandbox');
  assert.equal(router.chooseProvider('balanced', 'JAVASCRIPT', 'submit'), 'wandbox');
  assert.equal(router.chooseProvider('godbolt', 'JAVASCRIPT', 'submit'), 'wandbox');
});

test('fixed setting routes to that provider when healthy', () => {
  const router = createExecutionRouter();
  assert.equal(router.chooseProvider('wandbox', 'PYTHON', 'submit'), 'wandbox');
  assert.equal(router.chooseProvider('godbolt', 'CPP', 'submit'), 'godbolt');
});

test('fixed setting pre-routes to the other host while cooling down, and returns after cooldown', () => {
  let clock = 0;
  const router = createExecutionRouter({ cooldownMs: 1000, now: () => clock });
  router.reportInfraFailure('wandbox');
  assert.equal(router.chooseProvider('wandbox', 'PYTHON', 'submit'), 'godbolt');
  clock = 1001; // cooldown elapsed
  assert.equal(router.chooseProvider('wandbox', 'PYTHON', 'submit'), 'wandbox');
});

test('fixed setting sticks with its provider when BOTH are cooling (worker chain is the net)', () => {
  const router = createExecutionRouter();
  router.reportInfraFailure('wandbox');
  router.reportInfraFailure('godbolt');
  assert.equal(router.chooseProvider('wandbox', 'PYTHON', 'submit'), 'wandbox');
});

test('balanced alternates between equally-loaded healthy providers', () => {
  const router = createExecutionRouter();
  const picks = new Set([
    router.chooseProvider('balanced', 'PYTHON', 'submit'),
    router.chooseProvider('balanced', 'PYTHON', 'submit'),
  ]);
  assert.deepEqual([...picks].sort(), ['godbolt', 'wandbox']);
});

test('balanced picks the less-loaded provider', async () => {
  const router = createExecutionRouter({ submitConcurrency: 5 });
  // Load wandbox with two in-flight submits.
  await router.acquire('wandbox', 'submit');
  await router.acquire('wandbox', 'submit');
  assert.equal(router.chooseProvider('balanced', 'PYTHON', 'submit'), 'godbolt');
});

test('balanced avoids a cooling provider and returns to it after cooldown', () => {
  let clock = 0;
  const router = createExecutionRouter({ cooldownMs: 1000, now: () => clock });
  router.reportInfraFailure('godbolt');
  for (let i = 0; i < 4; i++) {
    assert.equal(router.chooseProvider('balanced', 'CPP', 'submit'), 'wandbox');
  }
  clock = 2000;
  const picks = new Set([
    router.chooseProvider('balanced', 'CPP', 'submit'),
    router.chooseProvider('balanced', 'CPP', 'submit'),
  ]);
  assert.ok(picks.has('godbolt'), 'godbolt should re-enter rotation after cooldown');
});

test('balanced with BOTH providers cooling still routes (uses full pool)', () => {
  const router = createExecutionRouter();
  router.reportInfraFailure('wandbox');
  router.reportInfraFailure('godbolt');
  const pick = router.chooseProvider('balanced', 'PYTHON', 'submit');
  assert.ok(pick === 'wandbox' || pick === 'godbolt');
});

test('reportSuccess clears a cooldown immediately', () => {
  const router = createExecutionRouter();
  router.reportInfraFailure('wandbox');
  router.reportSuccess('wandbox');
  assert.equal(router.chooseProvider('wandbox', 'PYTHON', 'submit'), 'wandbox');
});

test('acquire enforces per-provider lane concurrency; release admits the next waiter', async () => {
  const router = createExecutionRouter({ submitConcurrency: 2 });
  const r1 = await router.acquire('wandbox', 'submit');
  const r2 = await router.acquire('wandbox', 'submit');

  let thirdGranted = false;
  const third = router.acquire('wandbox', 'submit').then((rel) => {
    thirdGranted = true;
    return rel;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(thirdGranted, false, 'third acquire must wait behind the limit');
  assert.equal(router.snapshot().providers.wandbox.lanes.submit.waiting, 1);

  // godbolt's lane is independent — not blocked by wandbox saturation.
  const g = await router.acquire('godbolt', 'submit');
  g();

  r1();
  const r3 = await third;
  assert.equal(thirdGranted, true);
  r3();
  r2();
  const snap = router.snapshot().providers.wandbox.lanes.submit;
  assert.deepEqual(snap, { active: 0, waiting: 0 });
});

test('release is idempotent (double-release cannot leak extra slots)', async () => {
  const router = createExecutionRouter({ submitConcurrency: 1 });
  const r1 = await router.acquire('wandbox', 'submit');
  r1();
  r1();
  const r2 = await router.acquire('wandbox', 'submit');
  let extraGranted = false;
  void router.acquire('wandbox', 'submit').then(() => { extraGranted = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(extraGranted, false);
  r2();
});

test('isLaneSaturated trips at the queue cap and clears as the queue drains', async () => {
  const router = createExecutionRouter({ submitConcurrency: 1, submitQueueCap: 2 });
  const releases: Array<() => void> = [];
  releases.push(await router.acquire('wandbox', 'submit')); // occupies the slot
  void router.acquire('wandbox', 'submit').then((rel) => releases.push(rel)); // waiter 1
  void router.acquire('wandbox', 'submit').then((rel) => releases.push(rel)); // waiter 2
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(router.isLaneSaturated('submit'), true);
  assert.equal(router.isLaneSaturated('testrun'), false, 'lanes saturate independently');

  releases.shift()!(); // free the slot → waiter 1 runs → queue length 1
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(router.isLaneSaturated('submit'), false);
});
