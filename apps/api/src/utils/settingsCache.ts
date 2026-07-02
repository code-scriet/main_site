// Cached read for the Settings singleton (id='default').
//
// Why: many request paths read the Settings row just to check a feature toggle
// (`problemsEnabled`, `competitionEnabled`, `certificatesEnabled`, …) or look
// up a copy field (`clubName`, etc.). It changes maybe once a week, so caching
// it for 5 min eliminates a DB round-trip from a large fraction of authed
// requests.
//
// Anywhere we mutate the Settings row (PUT/PATCH/upsert in
// `apps/api/src/routes/settings.ts`), `invalidateSettingsCache()` MUST be
// called so the next reader sees fresh values.

import { prisma } from '../lib/prisma.js';
import type { Settings } from '@prisma/client';
import { logger } from './logger.js';

const TTL_MS = 5 * 60 * 1000;

let cache: Settings | null = null;
let expiresAt = 0;
let inflight: Promise<Settings | null> | null = null;
// Generation fence (mirrors utils/singleFlight.ts): a read that was already in
// flight when invalidateSettingsCache() ran must not write its pre-invalidation
// row back into the cache — that would mask an admin's settings PUT (incl.
// emailTestingMode and every feature toggle) for a full 5-minute TTL.
let generation = 0;

export async function getCachedSettings(): Promise<Settings | null> {
  const now = Date.now();
  if (cache && expiresAt > now) {
    return cache;
  }
  if (inflight) {
    return inflight;
  }
  const startedGeneration = generation;
  const read = prisma.settings
    .findUnique({ where: { id: 'default' } })
    .then((row) => {
      if (row && generation === startedGeneration) {
        cache = row;
        expiresAt = now + TTL_MS;
      }
      return row;
    })
    .catch((err) => {
      // Fail safe: a Settings read error must NOT 500 every page. The Settings
      // row only drives feature toggles + copy, and every caller already treats
      // `null` as "use defaults". This covers transient DB errors and, notably,
      // schema drift where the deployed client SELECTs a column production hasn't
      // gained yet (e.g. site_launch_date) — which would otherwise take the whole
      // public site down. Don't cache the failure; the next call retries.
      logger.error('getCachedSettings read failed; serving defaults this call', err);
      return null;
    })
    .finally(() => {
      // Identity-guarded: an old read settling must not evict a newer in-flight
      // read installed after an invalidation.
      if (inflight === read) inflight = null;
    });
  inflight = read;
  return read;
}

export function invalidateSettingsCache(): void {
  generation += 1;
  cache = null;
  expiresAt = 0;
  inflight = null;
}

/**
 * SYNCHRONOUS snapshot of the last-known Settings row — for hot paths that
 * cannot await (quiz reveal emission, snapshot ticks). Returns the cached row
 * even past its TTL (staleness ≤5 min is fine for feature flags; any concurrent
 * request refreshes it via getCachedSettings), and null on a cold start or in
 * the instants right after an invalidation — callers MUST treat null as
 * "feature off" (the safe, legacy direction). Never touches the DB.
 */
export function peekCachedSettings(): Settings | null {
  return cache;
}

// Test helper.
export function _peekSettingsCache(): { cached: boolean; expiresIn: number } {
  return { cached: !!cache, expiresIn: Math.max(0, expiresAt - Date.now()) };
}
