import assert from 'node:assert/strict';
import test from 'node:test';
import { emailService } from './email.js';
import { prisma } from '../lib/prisma.js';
import {
  buildSlotMagicLink,
  notifyInterviewScheduledBell,
  sendSlotCancelledByAdminEmail,
  sendSlotConfirmedEmail,
  sendSlotPickEmail,
  sendSlotReleasedEmail,
  sendSlotReminderEmail,
} from './interviewEmail.js';

process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'https://codescriet.dev';
process.env.NODE_ENV = 'test';

type Original = [Record<string, unknown>, string, unknown];

interface CapturedSend {
  to: unknown;
  subject: string;
  html: string;
  text?: string;
  category?: string;
}

let captured: CapturedSend[];

function mockEmailSend(originals: Original[]) {
  captured = [];
  const svc = emailService as unknown as Record<string, unknown>;
  originals.push([svc, 'send', svc.send]);
  svc.send = async (options: CapturedSend) => {
    captured.push(options);
    return true;
  };
}

function restore(originals: Original[]) {
  for (const [o, k, v] of originals) o[k] = v;
}

const MAGIC = buildSlotMagicLink('a'.repeat(64));
const DEADLINE = '9 Jan 2026, 5:30 pm';

test('pick email: exact subject, congrats + track + single magic-link CTA + deadline + first-come-first-served, category recruitment', async (t) => {
  const originals: Original[] = [];
  mockEmailSend(originals);
  t.after(() => restore(originals));

  const ok = await sendSlotPickEmail({
    to: 'cand@example.com',
    name: 'Asha',
    role: 'TECHNICAL',
    magicLink: MAGIC,
    deadlineIST: DEADLINE,
  });

  assert.equal(ok, true);
  assert.equal(captured.length, 1);
  const sent = captured[0];
  assert.equal(sent.category, 'recruitment');
  assert.equal(sent.subject, 'Asha, pick your interview slot — code.scriet');
  assert.ok(sent.html.includes('Congratulations'), 'congratulatory line');
  assert.ok(sent.html.includes('Technical Division'), 'applied track label');
  assert.ok(sent.html.includes(DEADLINE), 'deadline present');
  assert.ok(sent.html.includes('IST'), 'explicit IST marker');
  assert.ok(sent.html.includes('first-come-first-served'), 'urgency line');
  // Exactly ONE magic-link CTA in the HTML (the button href).
  assert.equal(sent.html.split(MAGIC).length - 1, 1);
  assert.ok(sent.text && sent.text.includes(MAGIC), 'plain-text part carries the link');
  assert.ok(sent.text && sent.text.includes(DEADLINE), 'plain-text part carries the deadline');
});

test('confirmed email: IST date + time range + venue + early-arrival + manage link, category recruitment', async (t) => {
  const originals: Original[] = [];
  mockEmailSend(originals);
  t.after(() => restore(originals));

  // 2026-01-09 is a Friday. 10:00 IST == 04:30 UTC.
  await sendSlotConfirmedEmail({
    to: 'cand@example.com',
    name: 'Asha',
    role: 'TECHNICAL',
    startsAt: new Date('2026-01-09T04:30:00.000Z'),
    endsAt: new Date('2026-01-09T05:30:00.000Z'),
    venue: 'SCRIET Block B, Room 204',
    magicLink: MAGIC,
  });

  assert.equal(captured.length, 1);
  const sent = captured[0];
  assert.equal(sent.category, 'recruitment');
  assert.ok(sent.subject.includes('Friday'), 'subject carries the weekday');
  assert.ok(sent.subject.includes('9 Jan'), 'subject carries "9 Jan" style date');
  assert.ok(sent.html.includes('Friday'), 'body carries the weekday');
  assert.ok(sent.html.includes('IST'), 'explicit IST marker');
  assert.ok(sent.html.includes('SCRIET Block B, Room 204'), 'venue present');
  assert.ok(sent.html.includes('arrive 5 minutes early'), 'early-arrival note');
  assert.ok(sent.html.includes(MAGIC), 'change/cancel magic link present');
  assert.ok(sent.text && sent.text.includes('5 minutes early'), 'plain-text part mirrors the note');
});

test('cancelled-by-admin email: apologetic + reason + fresh CTA + new deadline, category recruitment', async (t) => {
  const originals: Original[] = [];
  mockEmailSend(originals);
  t.after(() => restore(originals));

  await sendSlotCancelledByAdminEmail({
    to: 'cand@example.com',
    name: 'Asha',
    reason: 'Room double-booked',
    magicLink: MAGIC,
    deadlineIST: DEADLINE,
  });

  assert.equal(captured.length, 1);
  const sent = captured[0];
  assert.equal(sent.category, 'recruitment');
  assert.match(sent.html, /sorry/i);
  assert.ok(sent.html.includes('Room double-booked'), 'reason surfaced');
  assert.ok(sent.html.includes(MAGIC), 'fresh pick-slot CTA');
  assert.ok(sent.html.includes(DEADLINE), 'new deadline present');
  assert.ok(sent.html.includes('IST'), 'explicit IST marker');
});

test('cancelled-by-admin email without a reason omits the reason line', async (t) => {
  const originals: Original[] = [];
  mockEmailSend(originals);
  t.after(() => restore(originals));

  await sendSlotCancelledByAdminEmail({
    to: 'cand@example.com',
    name: 'Asha',
    magicLink: MAGIC,
    deadlineIST: DEADLINE,
  });

  assert.equal(captured.length, 1);
  assert.ok(!captured[0].html.includes('Reason'), 'no reason block without a reason');
  assert.ok(captured[0].html.includes(MAGIC), 'CTA still present');
});

test('reminder email: 48h / 24h variants, category recruitment', async (t) => {
  const originals: Original[] = [];
  mockEmailSend(originals);
  t.after(() => restore(originals));

  await sendSlotReminderEmail({ to: 'a@example.com', name: 'Asha', hoursLeft: 48, magicLink: MAGIC });
  await sendSlotReminderEmail({ to: 'b@example.com', name: 'Ravi', hoursLeft: 24, magicLink: MAGIC });

  assert.equal(captured.length, 2);
  for (const sent of captured) assert.equal(sent.category, 'recruitment');
  assert.ok(captured[0].subject.includes('48 hours left'), '48h subject variant');
  assert.ok(captured[0].html.includes('48 hours left'), '48h body variant');
  assert.ok(captured[1].subject.includes('24 hours left'), '24h subject variant');
  assert.ok(captured[1].html.includes('24 hours left'), '24h body variant');
  assert.ok(captured[0].html.includes(MAGIC), 'reminder carries the pick link');
});

test('released email: confirms release + re-pick link, category recruitment', async (t) => {
  const originals: Original[] = [];
  mockEmailSend(originals);
  t.after(() => restore(originals));

  await sendSlotReleasedEmail({ to: 'cand@example.com', name: 'Asha', magicLink: MAGIC });

  assert.equal(captured.length, 1);
  const sent = captured[0];
  assert.equal(sent.category, 'recruitment');
  assert.match(sent.html, /released/i);
  assert.ok(sent.html.includes(MAGIC), 're-pick link present');
  assert.ok(sent.text && sent.text.includes(MAGIC), 'plain-text part carries the link');
});

test('no interview email uses emoji', async (t) => {
  const originals: Original[] = [];
  mockEmailSend(originals);
  t.after(() => restore(originals));

  await sendSlotPickEmail({ to: 'a@example.com', name: 'A', role: 'TECHNICAL', magicLink: MAGIC, deadlineIST: DEADLINE });
  await sendSlotConfirmedEmail({
    to: 'a@example.com', name: 'A', role: 'TECHNICAL',
    startsAt: new Date('2026-01-09T04:30:00.000Z'), endsAt: new Date('2026-01-09T05:30:00.000Z'),
    venue: 'Hall', magicLink: MAGIC,
  });
  await sendSlotCancelledByAdminEmail({ to: 'a@example.com', name: 'A', magicLink: MAGIC, deadlineIST: DEADLINE });
  await sendSlotReminderEmail({ to: 'a@example.com', name: 'A', hoursLeft: 24, magicLink: MAGIC });
  await sendSlotReleasedEmail({ to: 'a@example.com', name: 'A', magicLink: MAGIC });

  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
  for (const sent of captured) {
    assert.ok(!emoji.test(sent.subject), `subject has no emoji: ${sent.subject}`);
    assert.ok(!emoji.test(sent.html), 'html has no emoji');
  }
});

test('notifyInterviewScheduledBell writes a CUSTOM hiring bell; skips when no linked user', async (t) => {
  const originals: Original[] = [];
  const feed = prisma.notificationFeed as unknown as Record<string, unknown>;
  const created: Array<Record<string, unknown>> = [];
  originals.push([feed, 'create', feed.create]);
  feed.create = async (args: { data: Record<string, unknown> }) => {
    created.push(args.data);
    return { id: 'bell-1', ...args.data };
  };
  t.after(() => restore(originals));

  notifyInterviewScheduledBell({
    userId: 'user-1',
    deadlineIST: DEADLINE,
    applicationId: 'app-1',
  });
  // Fire-and-forget helper — flush the microtask queue before asserting.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(created.length, 1);
  const row = created[0];
  assert.equal(row.audience, 'CUSTOM');
  assert.deepEqual(row.audienceUserIds, ['user-1']);
  assert.equal(row.category, 'hiring');
  assert.equal(row.title, 'Interview scheduled');
  assert.ok(String(row.body).includes(DEADLINE), 'body carries the deadline');
  assert.equal(row.link, '/dashboard/hiring');

  notifyInterviewScheduledBell({ userId: null, deadlineIST: DEADLINE, applicationId: 'app-2' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(created.length, 1, 'no bell without a linked userId');
});
