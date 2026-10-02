// Stale-chunk recovery. After a redeploy Vite's content-hashed lazy chunks are
// replaced, so an already-open tab that navigates to a not-yet-loaded route (the
// contest arena, snippets) asks for a filename that no longer exists. One reload
// picks up the new chunk map.
//
// Lives here rather than inline in main.tsx so the decision is a pure, testable
// function (tests/chunkReload.test.ts) instead of logic buried in a listener.
// The web app has its own lean copy at apps/web/src/lib/chunkReload.ts — it has
// no proctor, so it deliberately omits the block below.

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
  /** True while a proctored round owns the page lifecycle (see `setAutoReloadBlocked`). */
  blocked: boolean;
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
export function shouldReloadForStaleChunk({ lastReloadAt, now, blocked }: ReloadDecisionInput): boolean {
  if (blocked) return false;
  if (lastReloadAt === null) return false;
  // A stored instant AHEAD of `now` (device clock corrected backwards, NTP jump — routine on
  // student laptops) makes this difference negative forever, which would permanently disable
  // recovery for the tab. Treat a future stamp as "no previous attempt", mirroring how
  // readLastReloadAt normalises unparseable values to 0 and how the notification read-cutoff
  // clamps a future client timestamp.
  if (lastReloadAt > now) return true;
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

// ── Proctor interlock ───────────────────────────────────────────────────────
// A proctored round owns the page lifecycle: `useProctor` installs a
// `beforeunload` guard (so an automatic reload only raises the browser's
// "Leave site?" prompt instead of reloading) and leaving the page drops
// fullscreen, which fires `fullscreenchange` → a FULLSCREEN_EXIT violation.
// That kind is instant-lock with a budget of 1, so a self-inflicted reload
// would burn the contestant's only warning. While the proctor runs we therefore
// never auto-reload — the error reaches the ErrorBoundary, whose Reload button
// keeps recovery one deliberate click away.
//
// REF-COUNTED, not a boolean — same reasoning as MobileSheet's body scroll lock. Two
// overlapping owners are reachable (a second component holding `useProctor({enabled:true})`,
// or React StrictMode double-mounting the hook in development), and with a plain boolean the
// FIRST cleanup to run would clear the block while a surviving instance's beforeunload guard
// and fullscreen requirement are still live — re-arming exactly the self-inflicted reload
// this interlock exists to prevent.
let autoReloadBlockCount = 0;

export function setAutoReloadBlocked(blocked: boolean): void {
  autoReloadBlockCount = blocked
    ? autoReloadBlockCount + 1
    : Math.max(0, autoReloadBlockCount - 1);
}

export function isAutoReloadBlocked(): boolean {
  return autoReloadBlockCount > 0;
}

/** Wire the `vite:preloadError` listener. Call once, before the app renders. */
export function installStaleChunkRecovery(): void {
  window.addEventListener('vite:preloadError', (event) => {
    const now = Date.now();
    const lastReloadAt = readLastReloadAt(window.sessionStorage);
    if (!shouldReloadForStaleChunk({ lastReloadAt, now, blocked: isAutoReloadBlocked() })) return;
    // Record BEFORE preventDefault: if the write fails we must not swallow the
    // error, or the user is left on a dead screen with nothing surfaced.
    if (!recordReloadAttempt(window.sessionStorage, now)) return;
    event.preventDefault();
    window.location.reload();
  });
}
