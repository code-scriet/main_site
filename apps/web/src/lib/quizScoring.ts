/**
 * Scoring formula — mirrors backend calculation for optimistic display.
 */

export function calculatePoints(
  timeLimitSeconds: number,
  points: number,
  timeMs: number,
  streak: number,
  isCorrect: boolean,
): number {
  if (!isCorrect) return 0;
  const timeLimitMs = timeLimitSeconds * 1000;
  const timeRatio = Math.max(0, (timeLimitMs - timeMs) / timeLimitMs);
  const basePoints = points;
  const timeBonus = Math.floor(timeRatio * 50);
  const streakBonus = Math.min((streak - 1) * 10, 50);
  return basePoints + timeBonus + streakBonus;
}
