// Email notification policy and testing-mode redirect.
//
// All categorical send/suppress decisions live here. The email service
// (utils/email.ts) and any future transport adapter consume `shouldNotify`
// to decide whether to deliver, and `applyTestingMode` / `applyTestingModeBulk`
// to redirect / rewrite the payload when Settings.emailTestingMode is on.
//
// The email-shaped notification view is *derived* from the single in-process
// Settings cache (utils/settingsCache.ts) — there is no second TTL'd cache to
// invalidate. This module used to keep its own 5-min cache over the Settings
// singleton; a settings write then had to remember to clear both. Now one read
// seam, one invalidation.
//
// Degraded-read fallback: getCachedSettings() returns null on a transient DB
// error AND in a schema-drift window (it SELECTs the whole Settings row, so a
// column the migration hasn't added yet fails the read). Mapping that null to
// all-enabled defaults would silently re-open admin-disabled categories and flip
// emailTestingMode off mid-outage (real mail escaping the test redirect). So we
// hold a last-known-good projection and serve it when the read fails — sticky,
// not TTL'd, refreshed on every successful read, never needs invalidation.
//
// Cold-start-inside-the-drift-window corner: a last-known-good cache needs one
// good read to seed it, so if the very first read lands inside a drift window we
// have nothing sticky to serve and would concede to defaults. Before doing so,
// readNotificationColumns() does a narrow SELECT over *only* the email columns —
// which can't trip a drift on some unrelated column (e.g. site_launch_date), the
// way the pre-cache code never selected them. Only a real DB outage (the narrow
// read also throws) falls through to the all-enabled defaults.

import type { Settings } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from './logger.js';
import { getCachedSettings, invalidateSettingsCache } from './settingsCache.js';

export type EmailCategory =
  | 'welcome'
  | 'event_creation'
  | 'registration'
  | 'announcement'
  | 'certificate'
  | 'reminder'
  | 'invitation'
  | 'admin_mail'
  | 'password_reset'
  | 'other';

export interface NotificationSettings {
  emailWelcomeEnabled: boolean;
  emailEventCreationEnabled: boolean;
  emailRegistrationEnabled: boolean;
  emailAnnouncementEnabled: boolean;
  emailCertificateEnabled: boolean;
  emailReminderEnabled: boolean;
  emailInvitationEnabled: boolean;
  emailPasswordResetEnabled: boolean;
  mailingEnabled: boolean;
  emailTestingMode: boolean;
  emailTestRecipients: string | null;
}

export const CATEGORY_TOGGLE_MAP: Record<EmailCategory, keyof NotificationSettings | null> = {
  welcome: 'emailWelcomeEnabled',
  event_creation: 'emailEventCreationEnabled',
  registration: 'emailRegistrationEnabled',
  announcement: 'emailAnnouncementEnabled',
  certificate: 'emailCertificateEnabled',
  reminder: 'emailReminderEnabled',
  invitation: 'emailInvitationEnabled',
  admin_mail: 'mailingEnabled',
  password_reset: 'emailPasswordResetEnabled',
  other: null,
};

const ALL_ENABLED_DEFAULTS: NotificationSettings = {
  emailWelcomeEnabled: true,
  emailEventCreationEnabled: true,
  emailRegistrationEnabled: true,
  emailAnnouncementEnabled: true,
  emailCertificateEnabled: true,
  emailReminderEnabled: true,
  emailInvitationEnabled: true,
  emailPasswordResetEnabled: true,
  mailingEnabled: true,
  emailTestingMode: false,
  emailTestRecipients: null,
};

// Back-compat alias. The notification view is derived from the shared Settings
// cache, so there is no separate cache to clear — invalidating the one Settings
// cache refreshes it. Kept so existing callers (routes/settings.ts via
// email.ts) keep working and a caller that only knows this name stays correct.
export function invalidateNotificationSettingsCache(): void {
  invalidateSettingsCache();
}

// The exact Settings columns the email view is derived from. A narrow SELECT
// over just these (readNotificationColumns) survives a schema-drift failure on
// any *other* column. Full `Settings` is assignable to this, so the whole-row
// callers (projectNotificationSettings via getCachedSettings) keep working.
type NotificationSettingsColumns = Pick<
  Settings,
  | 'emailWelcomeEnabled'
  | 'emailEventCreationEnabled'
  | 'emailRegistrationEnabled'
  | 'emailAnnouncementEnabled'
  | 'emailCertificateEnabled'
  | 'emailReminderEnabled'
  | 'emailInvitationEnabled'
  | 'emailPasswordResetEnabled'
  | 'mailingEnabled'
  | 'emailTestingMode'
  | 'emailTestRecipients'
>;

// Pure projection of the Settings singleton onto the email-shaped view. A null
// row (no Settings yet, or a fail-safe read miss in getCachedSettings) maps to
// the all-enabled defaults — the policy's safe direction. This is the test
// surface: the mapping is verifiable without a database.
export function projectNotificationSettings(
  settings: NotificationSettingsColumns | null,
): NotificationSettings {
  if (!settings) {
    return { ...ALL_ENABLED_DEFAULTS };
  }
  return {
    emailWelcomeEnabled: settings.emailWelcomeEnabled ?? true,
    emailEventCreationEnabled: settings.emailEventCreationEnabled ?? true,
    emailRegistrationEnabled: settings.emailRegistrationEnabled ?? true,
    emailAnnouncementEnabled: settings.emailAnnouncementEnabled ?? true,
    emailCertificateEnabled: settings.emailCertificateEnabled ?? true,
    emailReminderEnabled: settings.emailReminderEnabled ?? true,
    emailInvitationEnabled: settings.emailInvitationEnabled ?? true,
    emailPasswordResetEnabled: settings.emailPasswordResetEnabled ?? true,
    mailingEnabled: settings.mailingEnabled ?? true,
    emailTestingMode: settings.emailTestingMode ?? false,
    emailTestRecipients: settings.emailTestRecipients ?? null,
  };
}

// Pure resolution of the degraded-read fallback, in priority order: a present
// row projects normally; otherwise the sticky last-known-good toggles; otherwise
// the narrow email-only read (cold start inside a drift window); only when all
// three are absent do we concede to the all-enabled defaults. Kept pure +
// exported so the precedence is testable without a database — same discipline as
// projectNotificationSettings.
export function resolveNotificationSettings(
  settings: NotificationSettingsColumns | null,
  lastKnownGood: NotificationSettings | null,
  narrowFallback: NotificationSettings | null = null,
): NotificationSettings {
  if (settings) {
    return projectNotificationSettings(settings);
  }
  return lastKnownGood ?? narrowFallback ?? projectNotificationSettings(null);
}

// Narrow degraded-read fallback (see the cold-start corner in the header): read
// ONLY the email columns so an unrelated not-yet-migrated column can't fail the
// read. Returns null on a missing row or a genuine DB error (caller then concedes
// to defaults). Booleans default-coalesce in projectNotificationSettings.
async function readNotificationColumns(): Promise<NotificationSettings | null> {
  try {
    const row = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: {
        emailWelcomeEnabled: true,
        emailEventCreationEnabled: true,
        emailRegistrationEnabled: true,
        emailAnnouncementEnabled: true,
        emailCertificateEnabled: true,
        emailReminderEnabled: true,
        emailInvitationEnabled: true,
        emailPasswordResetEnabled: true,
        mailingEnabled: true,
        emailTestingMode: true,
        emailTestRecipients: true,
      },
    });
    return row ? projectNotificationSettings(row) : null;
  } catch (err) {
    logger.error('readNotificationColumns email-only fallback read failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// Last successfully-projected view (see "Degraded-read fallback" in the header).
// Only consulted when getCachedSettings() returns null; refreshed on every
// successful read, so normal toggle changes (which invalidate the Settings cache)
// always propagate.
let lastKnownGoodNotificationSettings: NotificationSettings | null = null;

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const settings = await getCachedSettings();
  // Only pay for the narrow read in the rare cold-start-inside-a-drift-window
  // case: whole-row cache unreadable AND no sticky value to fall back on. Warm
  // cache or an existing last-known-good skips the extra round-trip entirely.
  const narrowFallback =
    !settings && !lastKnownGoodNotificationSettings ? await readNotificationColumns() : null;
  const view = resolveNotificationSettings(
    settings,
    lastKnownGoodNotificationSettings,
    narrowFallback,
  );
  // Seed/refresh the sticky cache from any real read — full row, or the narrow
  // one — so a later drift-window call serves it without re-reading.
  if (settings || narrowFallback) {
    lastKnownGoodNotificationSettings = view;
  }
  return view;
}

// True when the category is allowed to send under the current notification toggles.
// The 'other' category has no toggle and is always allowed.
export function shouldNotify(category: EmailCategory, ns: NotificationSettings): boolean {
  const toggleKey = CATEGORY_TOGGLE_MAP[category];
  if (!toggleKey) return true;
  return Boolean(ns[toggleKey]);
}

function parseTestRecipients(raw: string | null): string[] {
  return (raw || '')
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
}

export interface TestingModeResult {
  ok: boolean;
  // When false (no test recipients configured) the caller should suppress the send.
  testRecipients: string[];
  originalRecipients: string[];
  // Pre-built debug banner HTML the caller should prepend to the body.
  debugBanner: string;
}

// Compute the testing-mode rewrite for a single send (utils/email.ts EmailService.send).
// Returns { ok: false } when testing mode is active but no test recipients are configured —
// the caller must suppress the email in that case.
export function applyTestingMode(
  to: string | string[],
  category: EmailCategory,
  ns: NotificationSettings,
): { redirect: false } | { redirect: true; result: TestingModeResult } {
  if (!ns.emailTestingMode || category === 'other') {
    return { redirect: false };
  }

  const testRecipients = parseTestRecipients(ns.emailTestRecipients);
  const originalRecipients = Array.isArray(to) ? to : [to];

  if (testRecipients.length === 0) {
    return {
      redirect: true,
      result: { ok: false, testRecipients, originalRecipients, debugBanner: '' },
    };
  }

  const recipientPreview = originalRecipients.slice(0, 10).join(', ');
  const moreCount = originalRecipients.length > 10
    ? ` + ${originalRecipients.length - 10} more`
    : '';
  const debugBanner = `<div style="background:#fef08a;color:#854d0e;padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:13px;font-family:sans-serif;"><strong>🧪 TEST MODE</strong> — Original recipients (${originalRecipients.length}): ${recipientPreview}${moreCount}</div>`;

  return {
    redirect: true,
    result: { ok: true, testRecipients, originalRecipients, debugBanner },
  };
}

// Bulk-variant rewrite. Same return contract as applyTestingMode but the
// debug banner is the "Would have sent to N recipients" wording the bulk
// path uses.
export function applyTestingModeBulk(
  recipientCount: number,
  category: EmailCategory,
  ns: NotificationSettings,
): { redirect: false } | { redirect: true; result: TestingModeResult } {
  if (!ns.emailTestingMode || category === 'other') {
    return { redirect: false };
  }

  const testRecipients = parseTestRecipients(ns.emailTestRecipients);

  if (testRecipients.length === 0) {
    return {
      redirect: true,
      result: { ok: false, testRecipients, originalRecipients: [], debugBanner: '' },
    };
  }

  const debugBanner = `<div style="background:#fef08a;color:#854d0e;padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:13px;font-family:sans-serif;"><strong>🧪 TEST MODE</strong> — Would have sent to ${recipientCount} recipients</div>`;

  return {
    redirect: true,
    result: { ok: true, testRecipients, originalRecipients: [], debugBanner },
  };
}
