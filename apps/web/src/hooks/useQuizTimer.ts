/**
 * useQuizTimer — requestAnimationFrame-based countdown timer.
 * Smooth 60fps updates, no setInterval jank.
 */

import { useState, useEffect, useRef } from 'react';

export function useQuizTimer(questionStartTime: number | null, timeLimitSeconds: number | null) {
  const [timeLeftMs, setTimeLeftMs] = useState(
    timeLimitSeconds ? timeLimitSeconds * 1000 : 0,
  );
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!questionStartTime || !timeLimitSeconds) {
      const resetFrame = requestAnimationFrame(() => setTimeLeftMs(0));
      return () => cancelAnimationFrame(resetFrame);
    }

    const endTime = questionStartTime + timeLimitSeconds * 1000;

    function tick() {
      const remaining = endTime - Date.now();
      setTimeLeftMs(Math.max(0, remaining));
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [questionStartTime, timeLimitSeconds]);

  const totalMs = timeLimitSeconds ? timeLimitSeconds * 1000 : 1;
  const progress = timeLeftMs / totalMs; // 1.0 → 0.0
  const isUrgent = timeLeftMs < 5000 && timeLeftMs > 0;
  const isExpired = timeLeftMs === 0 && questionStartTime !== null;
  const secondsLeft = Math.ceil(timeLeftMs / 1000);

  return { timeLeftMs, progress, isUrgent, isExpired, secondsLeft };
}
