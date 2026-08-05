// Stale-chunk recovery. After a redeploy Vite's content-hashed lazy chunks are
// replaced, so an already-open tab navigating to a not-yet-loaded route asks for
// a filename that no longer exists. One reload picks up the new index.html and
// chunk map.
//
// Lives here rather than inline in main.tsx so the decision is a pure, testable
// function (tests/chunkReload.test.ts) instead of logic buried in a listener.
// The playground has its own copy at apps/playground/src/lib/chunkReload.ts —
// same core, plus a proctor interlock this app has no equivalent of.

/** sessionStorage key holding the epoch-ms instant of this tab's last auto-reload. */
export const RELOAD_GUARD_KEY = 'chunk-reload-at';
export const RELOAD_COOLDOWN_MS = 30_000;

/** The subset of `Storage` this module touches (keeps it injectable in tests). */
export type ReloadGuardStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Epoch ms of this tab's last auto-reload.
 *
 * `0` means "storage is readable, no reload recorded" (absent or unparseable
 * value — a garbage entry must not permanently wedge recovery). `null` means the
 * storage read itself threw, which callers MUST treat as "do not reload": we
 * cannot record an attempt we cannot write, and an unrecorded reload can't be
 * rate-limited, so it would loop forever.
 */
export function readLastReloadAt(storage: ReloadGuardStorage): number | null {
  try {
    const parsed = Number(storage.getItem(RELOAD_GUARD_KEY));
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return null;
  }
}

export interface ReloadDecisionInput {
  /** From `readLastReloadAt` — `null` when storage is unavailable. */
  lastReloadAt: number | null;
  now: number;
}

/**
 * Whether a `vite:preloadError` should be answered with an automatic reload.
 *
 * The cooldown stores the last reload INSTANT rather than a boolean: a boolean
 * cleared on boot would re-arm on every reload (so a genuinely missing asset —
 * bad deploy, offline, CDN failure — loops forever), while a never-cleared
 * boolean would block recovery from a later deploy. With a timestamp, a repeat
 * failure inside the cooldown surfaces in the ErrorBoundary (which offers a
 * manual Reload), and a deploy hours later still recovers automatically.
 */
export function shouldReloadForStaleChunk({ lastReloadAt, now }: ReloadDecisionInput): boolean {
  if (lastReloadAt === null) return false;
  return now - lastReloadAt >= RELOAD_COOLDOWN_MS;
}

/**
 * Record the attempt. Returns false when the write failed — the caller must then
 * leave the error alone, because a reload it cannot rate-limit would loop.
 */
export function recordReloadAttempt(storage: ReloadGuardStorage, now: number): boolean {
  try {
    storage.setItem(RELOAD_GUARD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

/** Wire the `vite:preloadError` listener. Call once, before the app renders. */
export function installStaleChunkRecovery(): void {
  window.addEventListener('vite:preloadError', (event) => {
    const now = Date.now();
    const lastReloadAt = readLastReloadAt(window.sessionStorage);
    if (!shouldReloadForStaleChunk({ lastReloadAt, now })) return;
    // Record BEFORE preventDefault: if the write fails we must not swallow the
    // error, or the user is left on a dead screen with nothing surfaced.
    if (!recordReloadAttempt(window.sessionStorage, now)) return;
    event.preventDefault();
    window.location.reload();
  });
}
