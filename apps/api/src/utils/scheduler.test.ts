import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { startReminderScheduler, stopReminderScheduler } from './scheduler.js';

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
