// Unit tests for NAT-safe rate-limit keying. The invariant that matters for
// security: only a request carrying a token that VERIFIES gets a per-user
// bucket — garbage/forged/expired tokens must stay pinned to the IP bucket, or
// an attacker could mint unlimited fresh buckets by rotating junk tokens.

import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'rate-limit-key-unit-test-secret';

const { signAccessToken } = await import('./jwt.js');
const { extractSessionToken, resolveRateLimitKey, resolveAuthRateLimitKey, isUserRateLimitKey } = await import('./rateLimitKey.js');

const USER = { userId: 'user-42', id: 'user-42', name: 'T', email: 't@example.com', role: 'USER' };

// Minimal Request stand-in: the resolver only touches headers/body/ip.
function mockReq(opts: { authorization?: string; cookie?: string; body?: unknown; ip?: string }): Request {
  return {
    headers: {
      ...(opts.authorization ? { authorization: opts.authorization } : {}),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: opts.body,
    ip: opts.ip ?? '10.0.0.1',
  } as unknown as Request;
}

test('extractSessionToken: Bearer header wins, cookie is the fallback', () => {
  assert.equal(extractSessionToken(mockReq({ authorization: 'Bearer abc' })), 'abc');
  assert.equal(extractSessionToken(mockReq({ cookie: 'foo=1; scriet_session=xyz; bar=2' })), 'xyz');
  assert.equal(
    extractSessionToken(mockReq({ authorization: 'Bearer head', cookie: 'scriet_session=cook' })),
    'head',
  );
  assert.equal(extractSessionToken(mockReq({})), null);
  assert.equal(extractSessionToken(mockReq({ authorization: 'Bearer ' })), null);
});

test('valid token → per-user bucket', () => {
  const token = signAccessToken(USER);
  const key = resolveRateLimitKey(mockReq({ authorization: `Bearer ${token}` }));
  assert.equal(key, 'u:user-42');
  assert.equal(isUserRateLimitKey(key), true);
});

test('valid session cookie → per-user bucket', () => {
  const token = signAccessToken(USER);
  const key = resolveRateLimitKey(mockReq({ cookie: `scriet_session=${encodeURIComponent(token)}` }));
  assert.equal(key, 'u:user-42');
});

test('garbage token → IP bucket (no bucket minting by token rotation)', () => {
  const key = resolveRateLimitKey(mockReq({ authorization: 'Bearer not-a-jwt', ip: '10.9.8.7' }));
  assert.equal(key, 'ip:10.9.8.7');
  assert.equal(isUserRateLimitKey(key), false);
});

test('token signed with the WRONG secret → IP bucket', () => {
  const forged = jwt.sign({ userId: 'u1', email: 'a@b.c', role: 'ADMIN' }, 'attacker-secret');
  assert.equal(resolveRateLimitKey(mockReq({ authorization: `Bearer ${forged}`, ip: '1.2.3.4' })), 'ip:1.2.3.4');
});

test('special-purpose token (purpose claim) → IP bucket', () => {
  const special = jwt.sign(
    { userId: 'u1', email: 'a@b.c', role: 'USER', purpose: 'oauth_exchange' },
    process.env.JWT_SECRET as string,
  );
  assert.equal(resolveRateLimitKey(mockReq({ authorization: `Bearer ${special}`, ip: '1.2.3.4' })), 'ip:1.2.3.4');
});

test('key is memoized on the request object (verify runs once)', () => {
  const req = mockReq({ authorization: `Bearer ${signAccessToken(USER)}` });
  const first = resolveRateLimitKey(req);
  (req.headers as Record<string, string>).authorization = 'Bearer now-garbage';
  assert.equal(resolveRateLimitKey(req), first);
});

test('auth key: anonymous login is bucketed per (IP, email)', () => {
  const key = resolveAuthRateLimitKey(mockReq({ body: { email: ' Student1@CCSU.edu ' }, ip: '5.6.7.8' }));
  assert.equal(key, 'ip:5.6.7.8:student1@ccsu.edu');
});

test('auth key: anonymous request without email stays a plain IP bucket', () => {
  assert.equal(resolveAuthRateLimitKey(mockReq({ ip: '5.6.7.8' })), 'ip:5.6.7.8');
  assert.equal(resolveAuthRateLimitKey(mockReq({ ip: '5.6.7.8', body: { email: 42 } })), 'ip:5.6.7.8');
});

test('auth key: verified session (e.g. /auth/me) is per-user, not per-email', () => {
  const token = signAccessToken(USER);
  const key = resolveAuthRateLimitKey(mockReq({ authorization: `Bearer ${token}`, body: { email: 'x@y.z' } }));
  assert.equal(key, 'u:user-42');
});
