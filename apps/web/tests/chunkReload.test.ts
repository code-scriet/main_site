import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RELOAD_COOLDOWN_MS,
  RELOAD_GUARD_KEY,
  readLastReloadAt,
  recordReloadAttempt,
  shouldReloadForStaleChunk,
  type ReloadGuardStorage,
} from '../src/lib/chunkReload.ts';

/** In-memory sessionStorage stand-in; `mode` forces the failure paths. */
function fakeStorage(
  initial: string | null = null,
  mode: 'ok' | 'throw-read' | 'throw-write' = 'ok',
): ReloadGuardStorage & { value: string | null } {
  return {
    value: initial,
    getItem(key: string) {
      if (mode === 'throw-read') throw new DOMException('denied', 'SecurityError');
      return key === RELOAD_GUARD_KEY ? this.value : null;
    },
    setItem(key: string, value: string) {
      if (mode === 'throw-write') throw new DOMException('quota', 'QuotaExceededError');
      if (key === RELOAD_GUARD_KEY) this.value = value;
    },
  };
}

const NOW = 1_800_000_000_000;

test('readLastReloadAt: absent or unparseable reads as "never reloaded", not NaN', () => {
  assert.equal(readLastReloadAt(fakeStorage(null)), 0);
  assert.equal(readLastReloadAt(fakeStorage('')), 0);
  // A garbage entry must not permanently wedge recovery (NaN comparisons are
  // always false, which would make every future reload decision "no").
  assert.equal(readLastReloadAt(fakeStorage('not-a-number')), 0);
  assert.equal(readLastReloadAt(fakeStorage(String(NOW))), NOW);
});

test('readLastReloadAt: a throwing read reports null (storage unavailable)', () => {
  assert.equal(readLastReloadAt(fakeStorage(null, 'throw-read')), null);
});

test('shouldReloadForStaleChunk: first failure reloads, a repeat inside the cooldown does not', () => {
  assert.equal(shouldReloadForStaleChunk({ lastReloadAt: 0, now: NOW }), true);
  assert.equal(
    shouldReloadForStaleChunk({ lastReloadAt: NOW - 1_000, now: NOW }),
    false,
    'a second failure 1s later must surface instead of looping',
  );
});

test('shouldReloadForStaleChunk: recovery re-arms once the cooldown elapses', () => {
  assert.equal(shouldReloadForStaleChunk({ lastReloadAt: NOW - RELOAD_COOLDOWN_MS + 1, now: NOW }), false);
  assert.equal(shouldReloadForStaleChunk({ lastReloadAt: NOW - RELOAD_COOLDOWN_MS, now: NOW }), true);
  // A later deploy (hours on) still recovers automatically — the reason this is a
  // timestamp and not a boolean.
  assert.equal(shouldReloadForStaleChunk({ lastReloadAt: NOW - 6 * 60 * 60 * 1000, now: NOW }), true);
});

test('shouldReloadForStaleChunk: unavailable storage fails closed', () => {
  // We cannot record an attempt we cannot write, and an unrecorded reload cannot
  // be rate-limited — so it would loop forever. Surface instead.
  assert.equal(shouldReloadForStaleChunk({ lastReloadAt: null, now: NOW }), false);
});

test('recordReloadAttempt: persists the instant, and reports a failed write', () => {
  const ok = fakeStorage(null);
  assert.equal(recordReloadAttempt(ok, NOW), true);
  assert.equal(ok.value, String(NOW));
  // The caller uses `false` to mean "do not preventDefault" — a swallowed error
  // with no reload would leave the user on a dead screen.
  assert.equal(recordReloadAttempt(fakeStorage(null, 'throw-write'), NOW), false);
});

test('a write failure leaves the guard untouched so the next attempt still decides freshly', () => {
  const storage = fakeStorage(null, 'throw-write');
  assert.equal(recordReloadAttempt(storage, NOW), false);
  assert.equal(storage.value, null);
  assert.equal(readLastReloadAt(storage), 0);
});
