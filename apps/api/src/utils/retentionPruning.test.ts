import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../lib/prisma.js';
import {
  pruneOldRecords,
  computePruneCutoffs,
  isQuizAnswerPruningEnabled,
  getAuditLogRetentionDays,
  EXECUTION_RETENTION_DAYS,
  NOTIFICATION_FEED_RETENTION_DAYS,
  COMPETITION_AUTOSAVE_RETENTION_DAYS,
  QUIZ_ANSWER_RETENTION_DAYS,
} from './scheduler.js';

process.env.NODE_ENV = 'test';

const DAY = 24 * 60 * 60 * 1000;

interface Captured {
  executionWhere?: any;
  dailyUsageWhere?: any;
  notificationWhere?: any;
  autosaveWhere?: any;
  quizAnswerFindCalls: number;
  quizAnswerWhere?: any;
  auditFindCalls: number;
  auditWhere?: any;
}

function installMock(counts: {
  executions: number;
  dailyUsage: number;
  notification: number;
  autosave: number;
  quizAnswers: number;
  auditLogs?: number;
}) {
  const captured: Captured = { quizAnswerFindCalls: 0, auditFindCalls: 0 };
  const originals: Array<[Record<string, unknown>, string, unknown]> = [];
  const set = (delegateName: string, fn: string, impl: unknown) => {
    const delegate = (prisma as unknown as Record<string, Record<string, unknown>>)[delegateName];
    originals.push([delegate, fn, delegate[fn]]);
    delegate[fn] = impl;
  };

  // execution: batched find→delete. Return all ids on the first find, then empty.
  let executionDrained = false;
  set('execution', 'findMany', async (args: { where: unknown }) => {
    captured.executionWhere = args.where;
    if (executionDrained) return [];
    executionDrained = true;
    return Array.from({ length: counts.executions }, (_, i) => ({ id: `ex-${i}` }));
  });
  set('execution', 'deleteMany', async () => ({ count: counts.executions }));

  set('playgroundDailyUsage', 'deleteMany', async (args: { where: unknown }) => {
    captured.dailyUsageWhere = args.where;
    return { count: counts.dailyUsage };
  });
  set('notificationFeed', 'deleteMany', async (args: { where: unknown }) => {
    captured.notificationWhere = args.where;
    return { count: counts.notification };
  });
  set('competitionAutoSave', 'deleteMany', async (args: { where: unknown }) => {
    captured.autosaveWhere = args.where;
    return { count: counts.autosave };
  });

  let quizDrained = false;
  set('quizAnswer', 'findMany', async (args: { where: unknown }) => {
    captured.quizAnswerFindCalls += 1;
    captured.quizAnswerWhere = args.where;
    if (quizDrained) return [];
    quizDrained = true;
    return Array.from({ length: counts.quizAnswers }, (_, i) => ({ id: `qa-${i}` }));
  });
  set('quizAnswer', 'deleteMany', async () => ({ count: counts.quizAnswers }));

  let auditDrained = false;
  set('auditLog', 'findMany', async (args: { where: unknown }) => {
    captured.auditFindCalls += 1;
    captured.auditWhere = args.where;
    if (auditDrained) return [];
    auditDrained = true;
    return Array.from({ length: counts.auditLogs ?? 0 }, (_, i) => ({ id: `al-${i}` }));
  });
  set('auditLog', 'deleteMany', async () => ({ count: counts.auditLogs ?? 0 }));

  return {
    captured,
    restore() {
      for (const [target, key, value] of originals) target[key] = value;
    },
  };
}

function approxDaysAgo(date: Date, days: number) {
  const expected = Date.now() - days * DAY;
  // within 5s tolerance of "now - days"
  assert.ok(Math.abs(date.getTime() - expected) < 5000, `expected ~${days}d ago, got ${date.toISOString()}`);
}

test('computePruneCutoffs returns the documented windows', () => {
  const now = Date.UTC(2026, 5, 13);
  const c = computePruneCutoffs(now);
  assert.equal(c.execution.getTime(), now - EXECUTION_RETENTION_DAYS * DAY);
  assert.equal(c.notificationFeed.getTime(), now - NOTIFICATION_FEED_RETENTION_DAYS * DAY);
  assert.equal(c.competitionAutoSave.getTime(), now - COMPETITION_AUTOSAVE_RETENTION_DAYS * DAY);
  assert.equal(c.quizAnswer.getTime(), now - QUIZ_ANSWER_RETENTION_DAYS * DAY);
});

test('pruneOldRecords deletes the right tables with correct filters; quiz answers OFF by default', async (t) => {
  delete process.env.PRUNE_QUIZ_ANSWERS;
  const mock = installMock({ executions: 12, dailyUsage: 3, notification: 7, autosave: 4, quizAnswers: 99 });
  t.after(mock.restore);

  const result = await pruneOldRecords();

  // Counts aggregated correctly; quiz answers + audit logs skipped (both env off).
  assert.deepEqual(result, {
    executions: 12,
    dailyUsage: 3,
    notificationFeed: 7,
    competitionAutoSaves: 4,
    quizAnswers: 0,
    auditLogs: 0,
  });
  assert.equal(mock.captured.quizAnswerFindCalls, 0, 'quizAnswer must not be touched when disabled');
  assert.equal(mock.captured.auditFindCalls, 0, 'auditLog must not be touched when retention unset');

  // Cutoffs.
  approxDaysAgo(mock.captured.executionWhere.executedAt.lt, EXECUTION_RETENTION_DAYS);
  approxDaysAgo(mock.captured.dailyUsageWhere.usageDate.lt, 60);

  // NotificationFeed: expired OR older-than-window.
  const orClauses = mock.captured.notificationWhere.OR;
  assert.equal(orClauses.length, 2);
  assert.ok(orClauses.some((c: any) => c.expiresAt && c.expiresAt.lt instanceof Date && c.expiresAt.not === null));
  assert.ok(orClauses.some((c: any) => c.createdAt && c.createdAt.lt instanceof Date));

  // CompetitionAutoSave: only FINISHED rounds older than 30d.
  assert.equal(mock.captured.autosaveWhere.round.status, 'FINISHED');
  approxDaysAgo(mock.captured.autosaveWhere.round.updatedAt.lt, COMPETITION_AUTOSAVE_RETENTION_DAYS);
});

test('pruneOldRecords prunes quiz answers (365d) when PRUNE_QUIZ_ANSWERS=true', async (t) => {
  process.env.PRUNE_QUIZ_ANSWERS = 'true';
  t.after(() => { delete process.env.PRUNE_QUIZ_ANSWERS; });
  assert.equal(isQuizAnswerPruningEnabled(), true);

  const mock = installMock({ executions: 0, dailyUsage: 0, notification: 0, autosave: 0, quizAnswers: 250 });
  t.after(mock.restore);

  const result = await pruneOldRecords();
  assert.equal(result.quizAnswers, 250);
  assert.ok(mock.captured.quizAnswerFindCalls >= 1, 'quizAnswer pruned when enabled');
  approxDaysAgo(mock.captured.quizAnswerWhere.submittedAt.lt, QUIZ_ANSWER_RETENTION_DAYS);
});

test('AuditLog is NOT auto-pruned by default (retention unset)', async (t) => {
  delete process.env.PRUNE_QUIZ_ANSWERS;
  delete process.env.AUDIT_LOG_RETENTION_DAYS;
  assert.equal(getAuditLogRetentionDays(), null);

  const mock = installMock({ executions: 0, dailyUsage: 0, notification: 0, autosave: 0, quizAnswers: 0, auditLogs: 500 });
  t.after(mock.restore);

  const result = await pruneOldRecords();
  assert.equal(mock.captured.auditFindCalls, 0, 'audit log is the compliance trail — untouched unless opted in');
  assert.equal(result.auditLogs, 0);
});

test('AuditLog IS pruned when AUDIT_LOG_RETENTION_DAYS is set', async (t) => {
  delete process.env.PRUNE_QUIZ_ANSWERS;
  process.env.AUDIT_LOG_RETENTION_DAYS = '365';
  t.after(() => { delete process.env.AUDIT_LOG_RETENTION_DAYS; });
  assert.equal(getAuditLogRetentionDays(), 365);

  const mock = installMock({ executions: 0, dailyUsage: 0, notification: 0, autosave: 0, quizAnswers: 0, auditLogs: 250 });
  t.after(mock.restore);

  const result = await pruneOldRecords();
  assert.equal(result.auditLogs, 250);
  assert.ok(mock.captured.auditFindCalls >= 1, 'auditLog pruned when opted in');
  approxDaysAgo(mock.captured.auditWhere.timestamp.lt, 365);
});

test('AUDIT_LOG_RETENTION_DAYS below the 30-day floor (or junk) disables pruning', () => {
  for (const bad of ['0', '10', '29', '-5', 'abc', '']) {
    process.env.AUDIT_LOG_RETENTION_DAYS = bad;
    assert.equal(getAuditLogRetentionDays(), null, `"${bad}" must disable`);
  }
  process.env.AUDIT_LOG_RETENTION_DAYS = '30';
  assert.equal(getAuditLogRetentionDays(), 30, '30 (the floor) is allowed');
  delete process.env.AUDIT_LOG_RETENTION_DAYS;
});
