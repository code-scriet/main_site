// Contest priority mode (Phase G). While ≥1 contest round is ACTIVE the server pauses
// NON-ESSENTIAL background work (event-reminder poll, retention pruning, DB keep-alive)
// so the live contest gets the headroom — user-facing services (auth, events, normal
// browsing) stay up. Counter is maintained on round start/lock/finish/delete and seeded
// by recoverActiveRounds() on boot; the schedulers consult isContestPriorityActive().
//
// Just a bounded integer — no per-user state, free-tier safe.

import { logger } from '../utils/logger.js';

let activeRoundCount = 0;

export function isContestPriorityActive(): boolean {
  return activeRoundCount > 0;
}

export function getActiveRoundCount(): number {
  return activeRoundCount;
}

export function incActiveRounds(): void {
  const was = activeRoundCount;
  activeRoundCount += 1;
  if (was === 0) logger.info('Contest priority mode ENABLED — pausing non-essential background work', { activeRoundCount });
}

export function decActiveRounds(): void {
  if (activeRoundCount === 0) return;
  activeRoundCount -= 1;
  if (activeRoundCount === 0) logger.info('Contest priority mode DISABLED — resuming normal background work');
}

/** Seed the counter from the DB on boot (recoverActiveRounds). */
export function setActiveRoundCount(n: number): void {
  const next = Math.max(0, n);
  const wasActive = activeRoundCount > 0;
  activeRoundCount = next;
  if (!wasActive && next > 0) logger.info('Contest priority mode ENABLED on boot', { activeRoundCount: next });
}
