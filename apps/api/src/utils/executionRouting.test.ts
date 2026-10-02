// Unit tests for the triple-provider execution router. Pins the routing rules the
// contest capacity plan depends on: balanced local-first split, JS runs on
// CodeBox or Wandbox (godbolt has no JS runtime), infra-failure cooldowns
// steering traffic to the healthy host, per-provider lane concurrency, and
// queue-cap admission.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createExecutionRouter, normalizeProviderSetting, providerSupportsLanguage } from './executionRouting.js';

test('normalizeProviderSetting: known values pass, junk falls to wandbox', () => {
  assert.equal(normalizeProviderSetting('wandbox'), 'wandbox');
  assert.equal(normalizeProviderSetting('godbolt'), 'godbolt');
  assert.equal(normalizeProviderSetting('balanced'), 'balanced');
  assert.equal(normalizeProviderSetting('codebox'), 'codebox');
  assert.equal(normalizeProviderSetting('piston'), 'wandbox');
  assert.equal(normalizeProviderSetting(undefined), 'wandbox');
});

test('providerSupportsLanguage: godbolt cannot run JavaScript', () => {
  assert.equal(providerSupportsLanguage('godbolt', 'JAVASCRIPT'), false);
  assert.equal(providerSupportsLanguage('godbolt', 'PYTHON'), true);
  assert.equal(providerSupportsLanguage('wandbox', 'JAVASCRIPT'), true);
  assert.equal(providerSupportsLanguage('codebox', 'JAVASCRIPT'), true);
  assert.equal(providerSupportsLanguage('codebox', 'PYTHON'), true);
});

test('JS routes local-first (codebox), never godbolt', () => {
  const fresh = createExecutionRouter();
  assert.equal(fresh.chooseProvider('balanced', 'JAVASCRIPT', 'submit'), 'codebox');
  assert.equal(fresh.chooseProvider('godbolt', 'JAVASCRIPT', 'submit'), 'codebox');
  assert.equal(fresh.chooseProvider('codebox', 'JAVASCRIPT', 'submit'), 'codebox');
  fresh.reportInfraFailure('codebox');
  assert.equal(fresh.chooseProvider('balanced', 'JAVASCRIPT', 'submit'), 'wandbox');
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
  assert.equal(router.chooseProvider('wandbox', 'PYTHON', 'submit'), 'codebox');
  clock = 1001; // cooldown elapsed
  assert.equal(router.chooseProvider('wandbox', 'PYTHON', 'submit'), 'wandbox');
});

test('fixed setting spills to healthy local when remotes cool; sticks only if all cool', () => {
  const router = createExecutionRouter();
  router.reportInfraFailure('wandbox');
  router.reportInfraFailure('godbolt');
  assert.equal(router.chooseProvider('wandbox', 'PYTHON', 'submit'), 'codebox');
  router.reportInfraFailure('codebox');
  assert.equal(router.chooseProvider('wandbox', 'PYTHON', 'submit'), 'wandbox');
});

test('balanced prefers local on ties; remotes still alternate when codebox cools', () => {
  const router = createExecutionRouter();
  assert.equal(router.chooseProvider('balanced', 'PYTHON', 'submit'), 'codebox');
  assert.equal(router.chooseProvider('balanced', 'PYTHON', 'submit'), 'codebox');
  router.reportInfraFailure('codebox');
  const picks = new Set([
    router.chooseProvider('balanced', 'PYTHON', 'submit'),
    router.chooseProvider('balanced', 'PYTHON', 'submit'),
  ]);
  assert.deepEqual([...picks].sort(), ['godbolt', 'wandbox']);
});

test('balanced picks the less-loaded provider', async () => {
  const router = createExecutionRouter({ submitConcurrency: 5 });
  // Load codebox with two in-flight submits: spill to least-loaded remote.
  await router.acquire('codebox', 'submit');
  await router.acquire('codebox', 'submit');
  // wandbox also loaded: godbolt (idle) wins.
  await router.acquire('wandbox', 'submit');
  await router.acquire('wandbox', 'submit');
  await router.acquire('wandbox', 'submit');
  assert.equal(router.chooseProvider('balanced', 'PYTHON', 'submit'), 'godbolt');
});

test('balanced avoids a cooling provider and returns to it after cooldown', () => {
  let clock = 0;
  const router = createExecutionRouter({ cooldownMs: 1000, now: () => clock });
  router.reportInfraFailure('godbolt');
  for (let i = 0; i < 4; i++) {
    assert.equal(router.chooseProvider('balanced', 'CPP', 'submit'), 'codebox');
  }
  clock = 2000;
  assert.equal(router.chooseProvider('balanced', 'CPP', 'submit'), 'codebox');
  router.reportInfraFailure('codebox');
  const picks = new Set([
    router.chooseProvider('balanced', 'CPP', 'submit'),
    router.chooseProvider('balanced', 'CPP', 'submit'),
  ]);
  assert.ok(picks.has('godbolt'), 'godbolt should re-enter rotation after cooldown');
});

test('balanced with ALL providers cooling still routes (uses full pool)', () => {
  const router = createExecutionRouter();
  router.reportInfraFailure('wandbox');
  router.reportInfraFailure('godbolt');
  router.reportInfraFailure('codebox');
  const pick = router.chooseProvider('balanced', 'PYTHON', 'submit');
  assert.equal(pick, 'codebox', 'full-pool tie prefers local');
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
