import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import {
  startReminderScheduler,
  stopReminderScheduler,
  startQotdAutoPublishScheduler,
  stopQotdAutoPublishScheduler,
  armQotdPublishTimer,
  cancelQotdPublishTimer,
} from './scheduler.js';

test('startReminderScheduler is idempotent', () => {
  stopReminderScheduler();

  const timeoutHandle = { kind: 'timeout' } as unknown as NodeJS.Timeout;
  const intervalHandle = { kind: 'interval' } as unknown as NodeJS.Timeout;

  const setTimeoutMock = mock.method(global, 'setTimeout', (() => timeoutHandle) as unknown as typeof setTimeout);
  const setIntervalMock = mock.method(global, 'setInterval', (() => intervalHandle) as unknown as typeof setInterval);
  const clearTimeoutMock = mock.method(global, 'clearTimeout', (() => undefined) as unknown as typeof clearTimeout);
  const clearIntervalMock = mock.method(global, 'clearInterval', (() => undefined) as unknown as typeof clearInterval);

  startReminderScheduler();
  startReminderScheduler();

  assert.equal(setTimeoutMock.mock.calls.length, 1);
  assert.equal(setIntervalMock.mock.calls.length, 1);

  stopReminderScheduler();

  assert.equal(clearTimeoutMock.mock.calls.length, 1);
  assert.equal(clearIntervalMock.mock.calls.length, 1);
  assert.equal(clearTimeoutMock.mock.calls[0]?.arguments[0], timeoutHandle);
  assert.equal(clearIntervalMock.mock.calls[0]?.arguments[0], intervalHandle);

  setTimeoutMock.mock.restore();
  setIntervalMock.mock.restore();
  clearTimeoutMock.mock.restore();
  clearIntervalMock.mock.restore();
});

test('armQotdPublishTimer is a no-op until the scheduler is active', () => {
  stopQotdAutoPublishScheduler(); // ensure inactive

  const setTimeoutMock = mock.method(global, 'setTimeout', (() => ({}) as NodeJS.Timeout) as unknown as typeof setTimeout);

  // Inactive (dev default): arming must NOT schedule anything.
  armQotdPublishTimer({
    id: 'q1',
    publishAt: new Date(Date.now() + 10 * 60 * 1000),
    isPublished: false,
    heldBy: null,
  });
  assert.equal(setTimeoutMock.mock.calls.length, 0);

  setTimeoutMock.mock.restore();
  stopQotdAutoPublishScheduler();
});

test('armQotdPublishTimer arms a precise future timer when active, cancel clears it', () => {
  stopQotdAutoPublishScheduler();

  const timerHandle = { kind: 'qotd-timer' } as unknown as NodeJS.Timeout;
  const setTimeoutMock = mock.method(global, 'setTimeout', (() => timerHandle) as unknown as typeof setTimeout);
  const setIntervalMock = mock.method(global, 'setInterval', (() => ({}) as NodeJS.Timeout) as unknown as typeof setInterval);
  const clearTimeoutMock = mock.method(global, 'clearTimeout', (() => undefined) as unknown as typeof clearTimeout);
  const clearIntervalMock = mock.method(global, 'clearInterval', (() => undefined) as unknown as typeof clearInterval);

  startQotdAutoPublishScheduler(); // sets active=true (+ a startup setTimeout + hourly setInterval)
  const baselineTimeouts = setTimeoutMock.mock.calls.length;

  // Future, within the arm horizon → one setTimeout with the right delay.
  const delayMs = 10 * 60 * 1000;
  armQotdPublishTimer({
    id: 'q1',
    publishAt: new Date(Date.now() + delayMs),
    isPublished: false,
    heldBy: null,
  });
  assert.equal(setTimeoutMock.mock.calls.length, baselineTimeouts + 1);
  const armedDelay = setTimeoutMock.mock.calls.at(-1)?.arguments[1] as number;
  assert.ok(Math.abs(armedDelay - delayMs) < 1000, 'delay should match publishAt');

  // Arming the same id again must not double-arm.
  armQotdPublishTimer({ id: 'q1', publishAt: new Date(Date.now() + delayMs), isPublished: false, heldBy: null });
  assert.equal(setTimeoutMock.mock.calls.length, baselineTimeouts + 1);

  // A far-future schedule (days out) is still armed — no horizon limit anymore.
  armQotdPublishTimer({ id: 'q2', publishAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), isPublished: false, heldBy: null });
  assert.equal(setTimeoutMock.mock.calls.length, baselineTimeouts + 2);

  // Already published / held QOTDs are never armed.
  armQotdPublishTimer({ id: 'q3', publishAt: new Date(Date.now() + delayMs), isPublished: true, heldBy: null });
  armQotdPublishTimer({ id: 'q4', publishAt: new Date(Date.now() + delayMs), isPublished: false, heldBy: 'admin' });
  assert.equal(setTimeoutMock.mock.calls.length, baselineTimeouts + 2);

  // Cancel clears exactly the armed handle.
  cancelQotdPublishTimer('q1');
  assert.ok(clearTimeoutMock.mock.calls.some((c) => c.arguments[0] === timerHandle));

  stopQotdAutoPublishScheduler();
  setTimeoutMock.mock.restore();
  setIntervalMock.mock.restore();
  clearTimeoutMock.mock.restore();
  clearIntervalMock.mock.restore();
});
