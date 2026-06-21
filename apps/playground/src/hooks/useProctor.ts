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
}

export function useProctor(opts: {
  roundId: string;
  enabled: boolean;
  onAutoSubmit?: () => Promise<void> | void;
  /** Request fullscreen on start; exiting it is an instant violation (lockdown). */
  fullscreen?: boolean;
  /** Treat a paste anywhere on the page as an instant violation (anti-copy-paste). */
  blockPaste?: boolean;
}): UseProctorResult {
  const { roundId, enabled, onAutoSubmit, fullscreen, blockPaste } = opts;
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

  const clearAway = useCallback(() => {
    if (awayTimerRef.current) { window.clearTimeout(awayTimerRef.current); awayTimerRef.current = null; }
    if (countdownRef.current) { window.clearInterval(countdownRef.current); countdownRef.current = null; }
    setAwayMsLeft(null);
  }, []);

  const trip = useCallback(async (kind: ProctorViolationKind) => {
    if (trippedRef.current) return;
    trippedRef.current = true;
    clearAway();
    // Auto-submit the current draft FIRST so the work is captured before the lock.
    try { await onAutoSubmitRef.current?.(); } catch { /* best effort — never block the lock */ }
    try {
      const res = await mainApi.reportProctorViolation(roundId, { kind });
      if (res?.locked) { setLocked(true); setLockReason('Locked by the proctor.'); }
    } catch { /* a failed report must not crash the arena */ }
  }, [roundId, clearAway]);

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
    const onPaste = () => { if (blockPaste) void trip('COPY_PASTE'); };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    if (fullscreen) document.addEventListener('fullscreenchange', onFullscreenChange);
    if (blockPaste) document.addEventListener('paste', onPaste);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('paste', onPaste);
      clearAway();
    };
  }, [enabled, startAway, clearAway, trip, fullscreen, blockPaste]);

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

  return { locked, lockReason, awayMsLeft, inFullscreen, enterFullscreen };
}
