// settingsCache is now a thin wrapper over the canonical createTtlSingleFlight
// primitive (utils/singleFlight.ts). These tests lock in the behavior that is
// NEW/bespoke to the wrapper — the error→null "use defaults" contract and its
// schema-drift resilience (a real prod incident: a not-yet-migrated column made
// the whole public site 500) — which the hand-rolled version shipped WITHOUT a
// test. The fence/identity/peek mechanics themselves are covered in
// singleFlight.test.ts.
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Settings } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  getCachedSettings,
  peekCachedSettings,
  invalidateSettingsCache,
  isSyncSettingsFlagEnabled,
} from './settingsCache.js';

type FindUnique = typeof prisma.settings.findUnique;
const realFindUnique = prisma.settings.findUnique.bind(prisma.settings);

// Override the single DB call the cache makes, without touching a real database.
function stubSettingsRead(impl: () => Promise<Partial<Settings> | null>): void {
  (prisma.settings as { findUnique: FindUnique }).findUnique = impl as unknown as FindUnique;
}
function restoreSettingsRead(): void {
  (prisma.settings as { findUnique: FindUnique }).findUnique = realFindUnique;
}

test('settingsCache: caches a fetched row, peek reflects it, invalidate clears peek', async () => {
  invalidateSettingsCache();
  assert.equal(peekCachedSettings(), null, 'cold peek is null');
  try {
    let calls = 0;
    stubSettingsRead(async () => {
      calls += 1;
      return { id: 'default', clubName: 'code.scriet', quizSnapshotEnabled: true };
    });

    const first = await getCachedSettings();
    assert.equal(first?.clubName, 'code.scriet');
    assert.equal(calls, 1);
    // Second read is served from cache — no extra DB call.
    await getCachedSettings();
    assert.equal(calls, 1, 'within TTL a second read must not re-query');
    // Sync peek sees the same cached row.
    assert.equal(peekCachedSettings()?.clubName, 'code.scriet');
    assert.equal(isSyncSettingsFlagEnabled('quizSnapshotEnabled', false), true);

    invalidateSettingsCache();
    assert.equal(peekCachedSettings(), null, 'peek is null immediately after invalidate');
    assert.equal(isSyncSettingsFlagEnabled('quizSnapshotEnabled', false), false, 'cold flag reads OFF');
    // env force-ON still wins over a cold cache.
    assert.equal(isSyncSettingsFlagEnabled('quizSnapshotEnabled', true), true);
  } finally {
    restoreSettingsRead();
    invalidateSettingsCache();
  }
});

test('settingsCache: a read error fails safe to null and is NOT cached (schema-drift resilience)', async () => {
  invalidateSettingsCache();
  try {
    let attempts = 0;
    stubSettingsRead(async () => {
      attempts += 1;
      // First read simulates schema drift (client SELECTs a column prod lacks).
      if (attempts === 1) throw new Error('column "site_launch_date" does not exist');
      return { id: 'default', clubName: 'recovered' };
    });

    const failed = await getCachedSettings();
    assert.equal(failed, null, 'a read error resolves to null (use defaults), never throws');
    assert.equal(peekCachedSettings(), null, 'the failure must NOT be cached');

    // The next call retries — the outage heals on its own once the read works.
    const recovered = await getCachedSettings();
    assert.equal(recovered?.clubName, 'recovered');
    assert.equal(attempts, 2, 'the failed read was retried, not served from a cached failure');
  } finally {
    restoreSettingsRead();
    invalidateSettingsCache();
  }
});

test('settingsCache: a missing singleton row is treated as null and not cached', async () => {
  invalidateSettingsCache();
  try {
    let attempts = 0;
    stubSettingsRead(async () => {
      attempts += 1;
      return attempts === 1 ? null : { id: 'default', clubName: 'seeded' };
    });
    assert.equal(await getCachedSettings(), null, 'no row ⇒ null');
    assert.equal(peekCachedSettings(), null, 'a missing row is not cached');
    assert.equal((await getCachedSettings())?.clubName, 'seeded', 'retries once the row exists');
  } finally {
    restoreSettingsRead();
    invalidateSettingsCache();
  }
});

test('settingsCache: concurrent misses share ONE query (single-flight)', async () => {
  invalidateSettingsCache();
  try {
    let calls = 0;
    stubSettingsRead(async () => {
      calls += 1;
      await new Promise((r) => setImmediate(r));
      return { id: 'default', clubName: 'once' };
    });
    const [a, b, c] = await Promise.all([getCachedSettings(), getCachedSettings(), getCachedSettings()]);
    assert.equal(calls, 1, 'three concurrent misses collapse to one query');
    assert.equal(a?.clubName, 'once');
    assert.equal(b?.clubName, 'once');
    assert.equal(c?.clubName, 'once');
  } finally {
    restoreSettingsRead();
    invalidateSettingsCache();
  }
});
