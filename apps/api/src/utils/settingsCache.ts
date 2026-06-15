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

export async function getCachedSettings(): Promise<Settings | null> {
  const now = Date.now();
  if (cache && expiresAt > now) {
    return cache;
  }
  if (inflight) {
    return inflight;
  }
  inflight = prisma.settings
    .findUnique({ where: { id: 'default' } })
    .then((row) => {
      if (row) {
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
      inflight = null;
    });
  return inflight;
}

export function invalidateSettingsCache(): void {
  cache = null;
  expiresAt = 0;
}

// Test helper.
export function _peekSettingsCache(): { cached: boolean; expiresIn: number } {
  return { cached: !!cache, expiresIn: Math.max(0, expiresAt - Date.now()) };
}
