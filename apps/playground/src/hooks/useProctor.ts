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
}

export function useProctor(opts: {
  roundId: string;
  enabled: boolean;
  onAutoSubmit?: () => Promise<void> | void;
}): UseProctorResult {
  const { roundId, enabled, onAutoSubmit } = opts;
  const [locked, setLocked] = useState(false);
  const [lockReason, setLockReason] = useState<string | null>(null);
  const [awayMsLeft, setAwayMsLeft] = useState<number | null>(null);

  const awayTimerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const trippedRef = useRef(false);
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
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      clearAway();
    };
  }, [enabled, startAway, clearAway]);

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

  return { locked, lockReason, awayMsLeft };
}
