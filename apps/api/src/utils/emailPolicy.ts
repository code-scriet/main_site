// Email notification policy and testing-mode redirect.
//
// All categorical send/suppress decisions live here. The email service
// (utils/email.ts) and any future transport adapter consume `shouldNotify`
// to decide whether to deliver, and `applyTestingMode` / `applyTestingModeBulk`
// to redirect / rewrite the payload when Settings.emailTestingMode is on.
//
// Cache TTL is 5 minutes; stale fallback on DB error matches the original
// behaviour in utils/email.ts before the split.

import { prisma } from '../lib/prisma.js';
import { logger } from './logger.js';

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

const NOTIFICATION_CACHE_TTL = 5 * 60 * 1000;

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

let notificationSettingsCache: NotificationSettings | null = null;
let lastNotificationFetch = 0;

export function invalidateNotificationSettingsCache(): void {
  notificationSettingsCache = null;
  lastNotificationFetch = 0;
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const now = Date.now();
  if (notificationSettingsCache && (now - lastNotificationFetch) < NOTIFICATION_CACHE_TTL) {
    return notificationSettingsCache;
  }

  try {
    const settings = await prisma.settings.findUnique({
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

    notificationSettingsCache = {
      emailWelcomeEnabled: settings?.emailWelcomeEnabled ?? true,
      emailEventCreationEnabled: settings?.emailEventCreationEnabled ?? true,
      emailRegistrationEnabled: settings?.emailRegistrationEnabled ?? true,
      emailAnnouncementEnabled: settings?.emailAnnouncementEnabled ?? true,
      emailCertificateEnabled: settings?.emailCertificateEnabled ?? true,
      emailReminderEnabled: settings?.emailReminderEnabled ?? true,
      emailInvitationEnabled: settings?.emailInvitationEnabled ?? true,
      emailPasswordResetEnabled: settings?.emailPasswordResetEnabled ?? true,
      mailingEnabled: settings?.mailingEnabled ?? true,
      emailTestingMode: settings?.emailTestingMode ?? false,
      emailTestRecipients: settings?.emailTestRecipients ?? null,
    };
    lastNotificationFetch = now;
    return notificationSettingsCache;
  } catch (error) {
    logger.error('Failed to fetch notification settings', {
      error: error instanceof Error ? error.message : String(error),
    });
    if (notificationSettingsCache) return notificationSettingsCache;
    return ALL_ENABLED_DEFAULTS;
  }
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
