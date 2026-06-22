// Proctoring engine (Phase C) — auto-submit-then-lock anti-cheat for contest rounds.
//
// Detection (a deterrent, not airtight — the server lock is the real enforcement):
//   * visibilitychange → hidden  (tab switch / minimise) — the reliable signal
//   * window blur (focus left the page while still visible) — second-monitor / alt-tab,
//     but ignored when focus merely moved into our own preview <iframe> (false positive)
//
// On being away continuously for AWAY_LOCK_MS: call onAutoSubmit() (host force-submits
// the current draft), then report the violation. A proctored round locks the participant
// server-side; this hook polls the heartbeat so an admin unlock re-arms detection.

import { useCallback, useEffect, useRef, useState } from 'react';
import { mainApi, type ProctorViolationKind } from '@/lib/mainApi';

const AWAY_LOCK_MS = 10_000;
const HEARTBEAT_MS = 15_000;

export interface UseProctorResult {
  locked: boolean;
  lockReason: string | null;
  /** Milliseconds left before the away-timer trips (null when not counting). */
  awayMsLeft: number | null;
  /** True once the contestant is in fullscreen (fullscreen lockdown only). */
  inFullscreen: boolean;
  /** Request fullscreen — must be called from a user gesture (a button). */
  enterFullscreen: () => void;
  /** Apply an out-of-band lock/unlock (e.g. an admin push over the contest socket). */
  applyProctorPush: (locked: boolean, lockReason: string | null) => void;
}

/** A counted-but-not-locked violation surfaced to the contestant (toast). Covers both an
 *  under-budget instant violation (paste / fullscreen exit) AND a blocked-and-logged action
 *  (right-click / dev-tools / print) that is never auto-locked. */
export interface ProctorWarning {
  kind: ProctorViolationKind;
  /** Narrows the kind: 'copy' | 'cut' | 'paste' | 'right-click' | 'devtools' | 'print' | … */
  detail?: string;
  /** Instant violations remaining before the next one locks (null = not budget-tracked). */
  remaining: number | null;
}

export function useProctor(opts: {
  roundId: string;
  enabled: boolean;
  onAutoSubmit?: () => Promise<void> | void;
  /** Request fullscreen on start; exiting it is an instant violation (lockdown). */
  fullscreen?: boolean;
  /** Treat a paste anywhere on the page as an instant violation (anti-copy-paste). */
  blockPaste?: boolean;
  /** Fired when an instant violation is counted but the server chose not to lock (budget). */
  onWarn?: (warning: ProctorWarning) => void;
}): UseProctorResult {
  const { roundId, enabled, onAutoSubmit, fullscreen, blockPaste, onWarn } = opts;
  const [locked, setLocked] = useState(false);
  const [lockReason, setLockReason] = useState<string | null>(null);
  const [awayMsLeft, setAwayMsLeft] = useState<number | null>(null);
  const [inFullscreen, setInFullscreen] = useState(typeof document !== 'undefined' && Boolean(document.fullscreenElement));

  const awayTimerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const trippedRef = useRef(false);
  const enteredFullscreenRef = useRef(false); // only an EXIT after a real ENTER locks
  const onAutoSubmitRef = useRef(onAutoSubmit);
  onAutoSubmitRef.current = onAutoSubmit;
  const onWarnRef = useRef(onWarn);
  onWarnRef.current = onWarn;

  const clearAway = useCallback(() => {
    if (awayTimerRef.current) { window.clearTimeout(awayTimerRef.current); awayTimerRef.current = null; }
    if (countdownRef.current) { window.clearInterval(countdownRef.current); countdownRef.current = null; }
    setAwayMsLeft(null);
  }, []);

  const trip = useCallback(async (kind: ProctorViolationKind, detail?: string) => {
    if (trippedRef.current) return;
    trippedRef.current = true;
    clearAway();
    // Auto-submit the current draft FIRST so the work is captured before the lock.
    try { await onAutoSubmitRef.current?.(); } catch { /* best effort — never block the lock */ }
    try {
      const res = await mainApi.reportProctorViolation(roundId, { kind, ...(detail ? { detail } : {}) });
      if (res?.locked) {
        setLocked(true); setLockReason('Locked by the proctor.');
      } else {
        // Counted but not locked (an instant violation under budget). Re-arm detection now
        // — don't make the contestant wait up to one heartbeat — and surface the warning so
        // the host can flash "stop pasting / stay in fullscreen — N left".
        trippedRef.current = false;
        if (res?.warning) onWarnRef.current?.({ kind, detail, remaining: res.remaining ?? null });
      }
    } catch { /* a failed report must not crash the arena */ }
  }, [roundId, clearAway]);

  // Fire-and-forget report for a BLOCKED-but-not-locking action (right-click / dev-tools /
  // print / save / view-source). Logged + counted on the server (surfaces in the admin live
  // log) but never auto-locks — the invigilator decides. Throttled per detail so holding a
  // key doesn't flood. Independent of the trip/away lock machinery.
  const lastOtherRef = useRef<Map<string, number>>(new Map());
  const reportOther = useCallback((detail: string) => {
    const now = Date.now();
    const last = lastOtherRef.current.get(detail) ?? 0;
    if (now - last < 1500) return;
    lastOtherRef.current.set(detail, now);
    onWarnRef.current?.({ kind: 'OTHER', detail, remaining: null });
    void mainApi.reportProctorViolation(roundId, { kind: 'OTHER', detail }).catch(() => undefined);
  }, [roundId]);

  const startAway = useCallback((kind: ProctorViolationKind) => {
    if (!enabled || trippedRef.current || locked || awayTimerRef.current) return;
    const startedAt = Date.now();
    setAwayMsLeft(AWAY_LOCK_MS);
    countdownRef.current = window.setInterval(() => {
      setAwayMsLeft(Math.max(0, AWAY_LOCK_MS - (Date.now() - startedAt)));
    }, 250);
    awayTimerRef.current = window.setTimeout(() => { void trip(kind); }, AWAY_LOCK_MS);
  }, [enabled, locked, trip]);

  // away detection
  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') startAway('HIDDEN');
      else clearAway();
    };
    const onBlur = () => {
      // Defer a tick so we can see where focus went; ignore focus into our own preview
      // iframe (not a real "left the window"). Skip entirely if the tab is hidden — the
      // visibilitychange handler already owns that case.
      window.setTimeout(() => {
        if (document.visibilityState === 'hidden') return;
        if (document.activeElement instanceof HTMLIFrameElement) return;
        if (!document.hasFocus()) startAway('BLUR');
      }, 0);
    };
    const onFocus = () => clearAway();
    // Fullscreen + paste are INSTANT violations (no countdown) on a proctored round.
    // Fullscreen is entered via a user gesture (enterFullscreen, wired to a button) since
    // browsers reject a silent request; we only lock on an EXIT after a real ENTER, so a
    // contestant who hasn't entered yet is prompted (by the arena), not locked.
    const onFullscreenChange = () => {
      const fs = Boolean(document.fullscreenElement);
      setInFullscreen(fs);
      if (fs) enteredFullscreenRef.current = true;
      else if (fullscreen && enteredFullscreenRef.current) void trip('FULLSCREEN_EXIT');
    };
    // Copy / cut / paste are all exfiltration vectors → block + count toward the instant
    // lock budget (1 warning, then lock). preventDefault stops the clipboard action itself.
    const onClipboard = (detail: 'copy' | 'cut' | 'paste') => (e: Event) => {
      if (!blockPaste) return;
      e.preventDefault();
      void trip('COPY_PASTE', detail);
    };
    const onCopy = onClipboard('copy');
    const onCut = onClipboard('cut');
    const onPaste = onClipboard('paste');
    // Right-click + dev-tools / print / save / view-source shortcuts: block them and LOG
    // (never auto-lock — see reportOther). Deters casual cheating without false locks.
    const onContextMenu = (e: MouseEvent) => { if (!blockPaste) return; e.preventDefault(); reportOther('right-click'); };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!blockPaste) return;
      const key = e.key.toLowerCase();
      const ctrlOrCmd = e.ctrlKey || e.metaKey;
      // Dev-tools: F12, Ctrl/Cmd+Shift+I/J/C, and the macOS Cmd+Alt+I/J/C variant.
      if (e.key === 'F12' || ((ctrlOrCmd && e.shiftKey) || (e.metaKey && e.altKey)) && ['i', 'j', 'c'].includes(key)) {
        e.preventDefault(); reportOther('devtools'); return;
      }
      if (ctrlOrCmd && key === 'u') { e.preventDefault(); reportOther('view-source'); return; }
      if (ctrlOrCmd && key === 'p') { e.preventDefault(); reportOther('print'); return; }
      if (ctrlOrCmd && key === 's') { e.preventDefault(); reportOther('save'); return; }
    };
    // Guard against an accidental refresh/close losing the buffer (not a violation).
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('beforeunload', onBeforeUnload);
    if (fullscreen) document.addEventListener('fullscreenchange', onFullscreenChange);
    if (blockPaste) {
      document.addEventListener('paste', onPaste);
      document.addEventListener('copy', onCopy);
      document.addEventListener('cut', onCut);
      document.addEventListener('contextmenu', onContextMenu);
      document.addEventListener('keydown', onKeyDown, true);
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKeyDown, true);
      clearAway();
    };
  }, [enabled, startAway, clearAway, trip, reportOther, fullscreen, blockPaste]);

  // heartbeat + lock poll — runs while enabled OR locked (so an admin unlock propagates).
  useEffect(() => {
    if (!enabled && !locked) return;
    let cancelled = false;
    const beat = async () => {
      try {
        const res = await mainApi.proctorHeartbeat(roundId);
        if (cancelled) return;
        setLocked(res.locked);
        setLockReason(res.lockReason ?? null);
        if (!res.locked) trippedRef.current = false; // admin unlocked → re-arm detection
      } catch { /* transient — next beat retries */ }
    };
    void beat();
    const id = window.setInterval(beat, HEARTBEAT_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [enabled, locked, roundId]);

  const enterFullscreen = useCallback(() => {
    document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);

  // Apply an admin lock/unlock pushed over the contest socket so it lands instantly instead
  // of waiting up to one heartbeat for the poll. On unlock, re-arm detection + clear any
  // pending away-countdown; on lock, mark tripped so the local engine doesn't double-report.
  const applyProctorPush = useCallback((isLocked: boolean, reason: string | null) => {
    setLocked(isLocked);
    setLockReason(reason);
    if (isLocked) {
      trippedRef.current = true;
      clearAway();
    } else {
      trippedRef.current = false;
    }
  }, [clearAway]);

  return { locked, lockReason, awayMsLeft, inFullscreen, enterFullscreen, applyProctorPush };
}
