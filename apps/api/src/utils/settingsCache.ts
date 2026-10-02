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
import { createTtlSingleFlight } from './singleFlight.js';
import { logger } from './logger.js';

const TTL_MS = 5 * 60 * 1000;

// Built on the canonical TTL + single-flight primitive (utils/singleFlight.ts)
// so the generation-fence + identity-guarded-clear races live in ONE tested
// place, not a hand-rolled copy. The compute THROWS on a missing row or read
// error so the primitive never caches a failure — the getCachedSettings wrapper
// translates that rejection back to `null` (the "use defaults" contract every
// caller already relies on), and the next call retries.
const settingsBoard = createTtlSingleFlight<Settings>(TTL_MS, async () => {
  const row = await prisma.settings.findUnique({ where: { id: 'default' } });
  if (!row) throw new Error('Settings row (id=default) not found');
  return row;
});

export async function getCachedSettings(): Promise<Settings | null> {
  try {
    return await settingsBoard.get();
  } catch (err) {
    // Fail safe: a Settings read error must NOT 500 every page. The Settings
    // row only drives feature toggles + copy, and every caller already treats
    // `null` as "use defaults". This covers transient DB errors and, notably,
    // schema drift where the deployed client SELECTs a column production hasn't
    // gained yet (e.g. site_launch_date) — which would otherwise take the whole
    // public site down. The primitive never cached the failure; the next call
    // retries.
    logger.error('getCachedSettings read failed; serving defaults this call', {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export function invalidateSettingsCache(): void {
  settingsBoard.invalidate();
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
  return settingsBoard.peek();
}

/**
 * Hot-path admin feature-flag read used by the quiz reveal + snapshot paths:
 * true when the emergency env force-ON override is set OR the synchronously
 * peeked Settings row has the flag on. A cold/just-invalidated cache reads as
 * false (the safe, legacy direction). Centralizes the `env || peek()?.flag`
 * idiom so a new hot-path toggle is one call, not a fresh copy.
 */
export function isSyncSettingsFlagEnabled(settingsKey: keyof Settings, envForceOn: boolean): boolean {
  return envForceOn || peekCachedSettings()?.[settingsKey] === true;
}
