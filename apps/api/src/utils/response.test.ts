import assert from 'node:assert/strict';
import test from 'node:test';
import type { Response } from 'express';
import { ApiResponse } from './response.js';

// Minimal Express Response stub that captures the status code and JSON body.
function mockRes() {
  const captured: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
      return res;
    },
  } as unknown as Response;
  return { res, captured };
}

function withNodeEnv<T>(value: string, fn: () => T): T {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = value;
  try {
    return fn();
  } finally {
    process.env.NODE_ENV = prev;
  }
}

// Regression guard for the production-only bug where sanitizeErrorDetails rebuilt
// arrays via Object.entries into a {"0":{...}} map, silently breaking every
// frontend consumer that requires Array.isArray(error.details) (the inline
// field-error feature). Invisible in dev because the sanitizer no-ops there.
test('validationError keeps error.details an array in production', () => {
  const { res, captured } = mockRes();
  withNodeEnv('production', () => {
    ApiResponse.validationError(res, [
      { field: 'name', message: 'Name is required' },
      { field: 'email', message: 'Email is invalid' },
    ]);
  });

  assert.equal(captured.status, 400);
  const body = captured.body as { success: boolean; error: { details: unknown } };
  assert.equal(body.success, false);
  assert.ok(Array.isArray(body.error.details), 'error.details must remain an array in production');
  assert.deepEqual(body.error.details, [
    { field: 'name', message: 'Name is required' },
    { field: 'email', message: 'Email is invalid' },
  ]);
});

test('validationError keeps error.details an array in development', () => {
  const { res, captured } = mockRes();
  withNodeEnv('development', () => {
    ApiResponse.validationError(res, [{ field: 'phone', message: 'Phone must be 10 digits' }]);
  });

  const body = captured.body as { error: { details: unknown } };
  assert.ok(Array.isArray(body.error.details));
  assert.deepEqual(body.error.details, [{ field: 'phone', message: 'Phone must be 10 digits' }]);
});

// The array fix must not regress the stack-stripping contract: error-like
// objects nested inside the details array still get their stack removed in prod.
test('production sanitization still strips stack traces inside array details', () => {
  const { res, captured } = mockRes();
  withNodeEnv('production', () => {
    ApiResponse.error(res, {
      code: 'INTERNAL_ERROR',
      message: 'boom',
       
      details: [{ field: 'x', message: 'bad', stack: 'Error: leak\n    at foo' }] as any,
      status: 500,
    });
  });

  const body = captured.body as { error: { details: Array<Record<string, unknown>> } };
  assert.ok(Array.isArray(body.error.details));
  assert.equal(body.error.details[0].stack, undefined, 'stack must be stripped');
  assert.equal(body.error.details[0].field, 'x');
  assert.equal(body.error.details[0].message, 'bad');
});
