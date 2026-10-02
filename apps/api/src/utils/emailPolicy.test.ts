import assert from 'node:assert/strict';
import test from 'node:test';
import type { Settings } from '@prisma/client';
import { projectNotificationSettings, resolveNotificationSettings, shouldNotify } from './emailPolicy.js';

// projectNotificationSettings is the seam that replaced emailPolicy's own cache:
// getNotificationSettings now just projects whatever the shared Settings cache
// returns. The mapping is pure, so the test surface is a database-free table.

// Build a Settings row carrying only the fields the projector reads; the rest of
// the model is irrelevant to the email view.
function settingsRow(overrides: Partial<Settings>): Settings {
  return {
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
    ...overrides,
  } as Settings;
}

test('projectNotificationSettings maps a null row to all-enabled defaults', () => {
  const ns = projectNotificationSettings(null);

  assert.equal(ns.emailWelcomeEnabled, true);
  assert.equal(ns.mailingEnabled, true);
  assert.equal(ns.emailTestingMode, false);
  assert.equal(ns.emailTestRecipients, null);
  // A null row must not suppress any category — fail-open is the safe direction.
  assert.equal(shouldNotify('welcome', ns), true);
  assert.equal(shouldNotify('reminder', ns), true);
});

test('projectNotificationSettings preserves disabled toggles from the row', () => {
  const ns = projectNotificationSettings(
    settingsRow({ emailReminderEnabled: false, mailingEnabled: false }),
  );

  assert.equal(ns.emailReminderEnabled, false);
  assert.equal(ns.mailingEnabled, false);
  assert.equal(ns.emailWelcomeEnabled, true);
  assert.equal(shouldNotify('reminder', ns), false);
  assert.equal(shouldNotify('admin_mail', ns), false);
  assert.equal(shouldNotify('welcome', ns), true);
});

test('projectNotificationSettings carries testing-mode + recipients through', () => {
  const ns = projectNotificationSettings(
    settingsRow({ emailTestingMode: true, emailTestRecipients: 'qa@example.com' }),
  );

  assert.equal(ns.emailTestingMode, true);
  assert.equal(ns.emailTestRecipients, 'qa@example.com');
});

test('resolveNotificationSettings projects a present row (ignoring last-known-good)', () => {
  const lastGood = projectNotificationSettings(settingsRow({ mailingEnabled: false }));
  const ns = resolveNotificationSettings(settingsRow({ emailReminderEnabled: false }), lastGood);

  // Fresh row wins; the stale fallback is not consulted when the read succeeds.
  assert.equal(ns.emailReminderEnabled, false);
  assert.equal(ns.mailingEnabled, true);
});

test('resolveNotificationSettings serves last-known-good when the read returns null', () => {
  // Admin had disabled mailing + turned on testing mode; then getCachedSettings
  // returns null (transient DB error / schema-drift window).
  const lastGood = projectNotificationSettings(
    settingsRow({ mailingEnabled: false, emailTestingMode: true, emailTestRecipients: 'qa@example.com' }),
  );
  const ns = resolveNotificationSettings(null, lastGood);

  // The outage must NOT re-enable mailing or flip testing-mode off (which would
  // leak real mail past the test redirect).
  assert.equal(ns.mailingEnabled, false);
  assert.equal(ns.emailTestingMode, true);
  assert.equal(ns.emailTestRecipients, 'qa@example.com');
  assert.equal(shouldNotify('admin_mail', ns), false);
});

test('resolveNotificationSettings uses the narrow fallback when row + last-known-good are null', () => {
  // Cold start landed inside a drift window: no row, nothing sticky yet, but the
  // narrow email-only read came back. Its toggles must win over the defaults.
  const narrow = projectNotificationSettings(
    settingsRow({ mailingEnabled: false, emailTestingMode: true, emailTestRecipients: 'qa@example.com' }),
  );
  const ns = resolveNotificationSettings(null, null, narrow);

  assert.equal(ns.mailingEnabled, false);
  assert.equal(ns.emailTestingMode, true);
  assert.equal(ns.emailTestRecipients, 'qa@example.com');
  assert.equal(shouldNotify('admin_mail', ns), false);
});

test('resolveNotificationSettings prefers last-known-good over the narrow fallback', () => {
  const lastGood = projectNotificationSettings(settingsRow({ mailingEnabled: false }));
  const narrow = projectNotificationSettings(settingsRow({ emailWelcomeEnabled: false }));
  const ns = resolveNotificationSettings(null, lastGood, narrow);

  // Sticky value wins; the narrow read is only a cold-start seed, not consulted
  // once we already have a last-known-good.
  assert.equal(ns.mailingEnabled, false);
  assert.equal(ns.emailWelcomeEnabled, true);
});

test('resolveNotificationSettings falls back to defaults only when row, last-known-good, and narrow are all null', () => {
  const ns = resolveNotificationSettings(null, null, null);

  assert.equal(ns.mailingEnabled, true);
  assert.equal(ns.emailTestingMode, false);
  assert.equal(shouldNotify('welcome', ns), true);

  // The default third arg keeps the two-arg call site behaving identically.
  const nsTwoArg = resolveNotificationSettings(null, null);
  assert.equal(nsTwoArg.mailingEnabled, true);
  assert.equal(nsTwoArg.emailTestingMode, false);
});
