import assert from 'node:assert/strict';
import test from 'node:test';
import type { Settings } from '@prisma/client';
import {
  applyTestingMode,
  getEmailProvider,
  projectNotificationSettings,
  shouldNotify,
} from './emailPolicy.js';
import {
  claimReminderSlot,
  processInterviewReminders,
  selectCohortEmails,
  selectReminderThreshold,
  type ReminderCandidate,
} from './interviewReminders.js';

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
    emailRecruitmentEnabled: true,
    mailingEnabled: true,
    emailTestingMode: false,
    emailTestRecipients: null,
    ...overrides,
  } as Settings;
}

// ─── recruitment policy ──────────────────────────────────────────────────────

test('recruitment toggle off suppresses interview mail', () => {
  const ns = projectNotificationSettings(settingsRow({ emailRecruitmentEnabled: false }));
  assert.equal(shouldNotify('recruitment', ns), false);
  assert.equal(shouldNotify('welcome', ns), true, 'other categories unaffected');
});

test('recruitment toggle defaults on; provider defaults to brevo', () => {
  const ns = projectNotificationSettings(settingsRow({}));
  assert.equal(shouldNotify('recruitment', ns), true);
  assert.equal(getEmailProvider('recruitment', ns), 'brevo');
  const oci = projectNotificationSettings(
    settingsRow({ emailProviderRecruitment: 'oci' } as Partial<Settings>),
  );
  assert.equal(getEmailProvider('recruitment', oci), 'oci');
});

test('testing-mode redirect applies to recruitment like other categories', () => {
  const ns = projectNotificationSettings(
    settingsRow({ emailTestingMode: true, emailTestRecipients: 'qa@example.com' }),
  );
  const redirected = applyTestingMode('cand@example.com', 'recruitment', ns);
  assert.equal(redirected.redirect, true);
  if (redirected.redirect) {
    assert.equal(redirected.result.ok, true);
    assert.deepEqual(redirected.result.testRecipients, ['qa@example.com']);
    assert.deepEqual(redirected.result.originalRecipients, ['cand@example.com']);
  }

  const unconfigured = projectNotificationSettings(
    settingsRow({ emailTestingMode: true, emailTestRecipients: null }),
  );
  const suppressed = applyTestingMode('cand@example.com', 'recruitment', unconfigured);
  assert.equal(suppressed.redirect, true);
  if (suppressed.redirect) assert.equal(suppressed.result.ok, false);

  const live = projectNotificationSettings(settingsRow({}));
  assert.equal(applyTestingMode('cand@example.com', 'recruitment', live).redirect, false);
});

// ─── threshold selection ─────────────────────────────────────────────────────

const NOW = new Date('2026-01-01T00:00:00.000Z');
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 60 * 60 * 1000);

test('selectReminderThreshold: 48h / 24h windows, boundaries, expiry', () => {
  assert.equal(selectReminderThreshold(hoursFromNow(47), NOW), '48h');
  assert.equal(selectReminderThreshold(hoursFromNow(48), NOW), '48h', 'exactly 48h counts');
  assert.equal(selectReminderThreshold(hoursFromNow(25), NOW), '48h');
  assert.equal(selectReminderThreshold(hoursFromNow(24), NOW), '24h', 'exactly 24h counts');
  assert.equal(selectReminderThreshold(hoursFromNow(1), NOW), '24h');
  assert.equal(selectReminderThreshold(hoursFromNow(49), NOW), null, 'beyond 48h ignored');
  assert.equal(selectReminderThreshold(hoursFromNow(0), NOW), null, 'expired ignored');
  assert.equal(selectReminderThreshold(hoursFromNow(-5), NOW), null, ' long-expired ignored');
});

// ─── claim + process (mocked Prisma, no DB) ──────────────────────────────────

function fakeLogDb() {
  const claimed = new Set<string>();
  return {
    claimed,
    db: {
      interviewReminderLog: {
        create: async ({ data }: { data: { applicationId: string; threshold: string } }) => {
          const key = `${data.applicationId}:${data.threshold}`;
          if (claimed.has(key)) {
            const err = new Error('Unique constraint failed') as Error & { code: string };
            err.code = 'P2002';
            throw err;
          }
          claimed.add(key);
          return { id: `log-${key}`, ...data };
        },
      },
    },
  };
}

function candidate(overrides: Partial<ReminderCandidate> & { applicationId: string }): ReminderCandidate {
  return {
    email: `${overrides.applicationId}@example.com`,
    name: 'Cand',
    expiresAt: hoursFromNow(47),
    existingThresholds: [],
    ...overrides,
  };
}

test('claimReminderSlot is exactly-once per (application, threshold)', async () => {
  const { db } = fakeLogDb();
  assert.equal(await claimReminderSlot(db, 'app-1', '48h'), true);
  assert.equal(await claimReminderSlot(db, 'app-1', '48h'), false, 'second claim loses the race');
  assert.equal(await claimReminderSlot(db, 'app-1', '24h'), true, 'other threshold independent');
});

test('processInterviewReminders sends 48h + 24h, skips expired/far-future/already-logged', async () => {
  const { db } = fakeLogDb();
  const sent: Array<{ to: string; hoursLeft: number; deadlineIST?: string; magicLink: string }> = [];
  const candidates = [
    candidate({ applicationId: 'due-48', expiresAt: hoursFromNow(47) }),
    candidate({ applicationId: 'due-24', expiresAt: hoursFromNow(20) }),
    candidate({ applicationId: 'expired', expiresAt: hoursFromNow(-1) }),
    candidate({ applicationId: 'far', expiresAt: hoursFromNow(100) }),
    candidate({ applicationId: 'logged', expiresAt: hoursFromNow(47), existingThresholds: ['48h'] }),
  ];

  const result = await processInterviewReminders(candidates, {
    db,
    now: NOW,
    issueToken: async (id) => `raw-${id}`,
    sendReminder: async (params) => {
      sent.push({
        to: params.to,
        hoursLeft: params.hoursLeft,
        deadlineIST: params.deadlineIST,
        magicLink: params.magicLink,
      });
      return true;
    },
  });

  assert.equal(result.checked, 5);
  assert.equal(result.sent, 2);
  assert.equal(result.skippedClaimed, 1, 'already-logged threshold skipped');
  assert.equal(result.failed, 0);
  const byId = new Map(sent.map((s) => [s.to, s]));
  assert.equal(byId.get('due-48@example.com')?.hoursLeft, 48);
  assert.equal(byId.get('due-24@example.com')?.hoursLeft, 24);
  for (const s of sent) {
    assert.ok(s.magicLink.includes('/hiring/slots?token='), 'single magic-link CTA');
    assert.ok(s.deadlineIST && s.deadlineIST.length > 0, 'IST deadline attached');
  }
});

test('send failure keeps the claim row (no retry for that threshold) but logs visibly', async () => {
  const { db, claimed } = fakeLogDb();
  const failing = candidate({ applicationId: 'flaky', expiresAt: hoursFromNow(20) });

  const first = await processInterviewReminders([failing], {
    db,
    now: NOW,
    issueToken: async () => 'raw',
    sendReminder: async () => false,
  });
  assert.equal(first.sent, 0);
  assert.equal(first.failed, 1);
  assert.ok(claimed.has('flaky:24h'), 'reservation row kept after failure');

  // Next tick: the kept row wins the race — no duplicate mail. (Mint runs
  // before the claim so a mint failure never burns a row; here mint succeeds
  // and the lost claim race skips the send.)
  const second = await processInterviewReminders([failing], {
    db,
    now: NOW,
    issueToken: async () => 'raw-fresh',
    sendReminder: async () => {
      throw new Error('must not resend for a claimed threshold');
    },
  });
  assert.equal(second.sent, 0);
  assert.equal(second.skippedClaimed, 1);
});

test('expired tokens with no booking stay INTERVIEW_SCHEDULED: no claim, no mail', async () => {
  const { db, claimed } = fakeLogDb();
  let sends = 0;
  const result = await processInterviewReminders(
    [candidate({ applicationId: 'gone', expiresAt: hoursFromNow(-30) })],
    {
      db,
      now: NOW,
      issueToken: async () => 'raw',
      sendReminder: async () => {
        sends += 1;
        return true;
      },
    },
  );
  assert.equal(result.sent, 0);
  assert.equal(sends, 0);
  assert.equal(claimed.size, 0, 'no log row claimed for expired tokens');
});

// ─── cohort targeting ────────────────────────────────────────────────────────

test('selectCohortEmails keeps distinct in-pipeline emails only', () => {
  const emails = selectCohortEmails([
    { email: 'A@example.com', status: 'INTERVIEW_SCHEDULED' },
    { email: 'a@EXAMPLE.com', status: 'SLOT_BOOKED' },
    { email: 'b@example.com', status: 'INTERVIEWED' },
    { email: 'c@example.com', status: 'REJECTED' },
    { email: 'd@example.com', status: 'SELECTED' },
    { email: 'e@example.com', status: 'PENDING' },
    { email: 'f@example.com', status: 'SLOT_BOOKED' },
  ]);
  assert.deepEqual(emails, ['a@example.com', 'b@example.com', 'f@example.com']);
});

// ─── DB-backed cron E2E: offline by design ────────────────────────────────────

test('interview reminder cron E2E against a live DB', { skip: 'no DB in offline mode (mocked Prisma only)' }, async () => {
  assert.ok(true);
});
