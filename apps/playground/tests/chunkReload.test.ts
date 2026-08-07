import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RELOAD_COOLDOWN_MS,
  RELOAD_GUARD_KEY,
  isAutoReloadBlocked,
  readLastReloadAt,
  recordReloadAttempt,
  setAutoReloadBlocked,
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
  assert.equal(shouldReloadForStaleChunk({ lastReloadAt: 0, now: NOW, blocked: false }), true);
  assert.equal(
    shouldReloadForStaleChunk({ lastReloadAt: NOW - 1_000, now: NOW, blocked: false }),
    false,
    'a second failure 1s later must surface instead of looping',
  );
});

test('shouldReloadForStaleChunk: recovery re-arms once the cooldown elapses', () => {
  const justInside = NOW - RELOAD_COOLDOWN_MS + 1;
  const exactlyAt = NOW - RELOAD_COOLDOWN_MS;
  assert.equal(shouldReloadForStaleChunk({ lastReloadAt: justInside, now: NOW, blocked: false }), false);
  assert.equal(shouldReloadForStaleChunk({ lastReloadAt: exactlyAt, now: NOW, blocked: false }), true);
  // A later deploy (hours on) still recovers automatically — the reason this is a
  // timestamp and not a boolean.
  assert.equal(
    shouldReloadForStaleChunk({ lastReloadAt: NOW - 6 * 60 * 60 * 1000, now: NOW, blocked: false }),
    true,
  );
});

test('shouldReloadForStaleChunk: unavailable storage fails closed', () => {
  // We cannot record an attempt we cannot write, and an unrecorded reload cannot
  // be rate-limited — so it would loop forever. Surface instead.
  assert.equal(shouldReloadForStaleChunk({ lastReloadAt: null, now: NOW, blocked: false }), false);
});

test('shouldReloadForStaleChunk: a proctored round blocks the auto-reload outright', () => {
  // Even a first, otherwise-eligible failure must not reload mid-contest: the
  // proctor's beforeunload guard turns it into a "Leave site?" prompt, and the
  // resulting fullscreen exit costs the contestant their instant-violation budget.
  assert.equal(shouldReloadForStaleChunk({ lastReloadAt: 0, now: NOW, blocked: true }), false);
  assert.equal(
    shouldReloadForStaleChunk({ lastReloadAt: NOW - 10 * 60 * 1000, now: NOW, blocked: true }),
    false,
  );
});

test('recordReloadAttempt: persists the instant, and reports a failed write', () => {
  const ok = fakeStorage(null);
  assert.equal(recordReloadAttempt(ok, NOW), true);
  assert.equal(ok.value, String(NOW));
  // The caller uses `false` to mean "do not preventDefault" — a swallowed error
  // with no reload would leave the user on a dead screen.
  assert.equal(recordReloadAttempt(fakeStorage(null, 'throw-write'), NOW), false);
});

test('setAutoReloadBlocked toggles the proctor interlock', () => {
  assert.equal(isAutoReloadBlocked(), false, 'defaults to unblocked');
  setAutoReloadBlocked(true);
  assert.equal(isAutoReloadBlocked(), true);
  setAutoReloadBlocked(false);
  assert.equal(isAutoReloadBlocked(), false, 'useProctor clears it on effect cleanup');
});

test('a write failure leaves the guard untouched so the next attempt still decides freshly', () => {
  const storage = fakeStorage(null, 'throw-write');
  assert.equal(recordReloadAttempt(storage, NOW), false);
  assert.equal(storage.value, null);
  assert.equal(readLastReloadAt(storage), 0);
});

test('a FUTURE stored instant does not wedge recovery permanently', () => {
  // Device clock corrected backwards / NTP jump after a reload was recorded. With a plain
  // `now - lastReloadAt >= COOLDOWN` the difference stays negative forever, so the tab would
  // never auto-recover from a redeploy again for the rest of the session.
  assert.equal(
    shouldReloadForStaleChunk({ lastReloadAt: NOW + 60 * 60 * 1000, now: NOW, blocked: false }),
    true,
  );
});

test('the proctor interlock is ref-counted, not a boolean', () => {
  // Two overlapping owners (a second useProctor consumer, or StrictMode double-mount): the
  // first cleanup must NOT clear the block while another instance still holds it, or a
  // self-inflicted reload drops fullscreen → FULLSCREEN_EXIT → instant lock (budget 1).
  assert.equal(isAutoReloadBlocked(), false);
  setAutoReloadBlocked(true);
  setAutoReloadBlocked(true);
  setAutoReloadBlocked(false);
  assert.equal(isAutoReloadBlocked(), true, 'still held by the second owner');
  setAutoReloadBlocked(false);
  assert.equal(isAutoReloadBlocked(), false, 'released once every owner has cleaned up');
  // Never goes negative — an unmatched release must not leave a latent negative count that
  // silently swallows the next real block.
  setAutoReloadBlocked(false);
  setAutoReloadBlocked(true);
  assert.equal(isAutoReloadBlocked(), true);
  setAutoReloadBlocked(false);
});
