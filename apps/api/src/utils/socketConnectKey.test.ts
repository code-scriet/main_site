// Unit tests for the NAT-safe Socket.io connection-limiter key. Same security
// invariant as rateLimitKey.test.ts: only a handshake carrying a token that
// VERIFIES gets a per-user bucket — garbage/forged/expired/special-purpose
// tokens stay pinned to the IP bucket, so an attacker can't mint fresh per-user
// buckets by rotating junk in handshake.auth.token.

import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'socket-connect-key-unit-test-secret';

const { signAccessToken } = await import('./jwt.js');
const {
  extractSocketHandshakeToken,
  resolveSocketConnectKey,
  isUserSocketConnectKey,
} = await import('./socketConnectKey.js');

const USER = { userId: 'user-42', id: 'user-42', name: 'T', email: 't@example.com', role: 'USER' };

// Minimal socket-handshake stand-in: the resolver only touches ip/auth/headers.
function handshake(opts: {
  ip?: string;
  authToken?: unknown;
  authorization?: string;
  cookie?: string;
}) {
  return {
    ip: opts.ip ?? '10.0.0.1',
    auth: opts.authToken !== undefined ? { token: opts.authToken } : {},
    headers: {
      ...(opts.authorization ? { authorization: opts.authorization } : {}),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
  };
}

test('extractSocketHandshakeToken: auth.token wins, then Bearer header, then cookie', () => {
  assert.equal(extractSocketHandshakeToken(handshake({ authToken: 'aaa' })), 'aaa');
  assert.equal(extractSocketHandshakeToken(handshake({ authorization: 'Bearer bbb' })), 'bbb');
  assert.equal(
    extractSocketHandshakeToken(handshake({ cookie: 'foo=1; scriet_session=ccc; bar=2' })),
    'ccc',
  );
  // auth.token preferred over header AND cookie
  assert.equal(
    extractSocketHandshakeToken(
      handshake({ authToken: 'auth-wins', authorization: 'Bearer head', cookie: 'scriet_session=cook' }),
    ),
    'auth-wins',
  );
  // header preferred over cookie when no auth.token
  assert.equal(
    extractSocketHandshakeToken(handshake({ authorization: 'Bearer head', cookie: 'scriet_session=cook' })),
    'head',
  );
  assert.equal(extractSocketHandshakeToken(handshake({})), null);
  assert.equal(extractSocketHandshakeToken(handshake({ authToken: '   ' })), null);
  assert.equal(extractSocketHandshakeToken(handshake({ authToken: 42 })), null);
});

test('valid token in auth.token → per-user bucket', () => {
  const token = signAccessToken(USER);
  const key = resolveSocketConnectKey(handshake({ authToken: token, ip: '10.9.9.9' }));
  assert.equal(key, 'u:user-42');
  assert.equal(isUserSocketConnectKey(key), true);
});

test('valid token via Authorization header → per-user bucket', () => {
  const token = signAccessToken(USER);
  assert.equal(resolveSocketConnectKey(handshake({ authorization: `Bearer ${token}` })), 'u:user-42');
});

test('valid token via session cookie → per-user bucket', () => {
  const token = signAccessToken(USER);
  const key = resolveSocketConnectKey(handshake({ cookie: `scriet_session=${encodeURIComponent(token)}` }));
  assert.equal(key, 'u:user-42');
});

test('auth.token preferred over header/cookie for the resolved user key', () => {
  const userToken = signAccessToken(USER);
  const otherToken = signAccessToken({ ...USER, userId: 'user-99', id: 'user-99' });
  const key = resolveSocketConnectKey(
    handshake({ authToken: userToken, authorization: `Bearer ${otherToken}` }),
  );
  assert.equal(key, 'u:user-42', 'auth.token identity must win over the header token');
});

test('garbage token → IP bucket (no bucket minting by token rotation)', () => {
  const key = resolveSocketConnectKey(handshake({ authToken: 'not-a-jwt', ip: '10.9.8.7' }));
  assert.equal(key, 'ip:10.9.8.7');
  assert.equal(isUserSocketConnectKey(key), false);
});

test('token signed with the WRONG secret → IP bucket', () => {
  const forged = jwt.sign({ userId: 'u1', email: 'a@b.c', role: 'ADMIN' }, 'attacker-secret');
  assert.equal(resolveSocketConnectKey(handshake({ authToken: forged, ip: '1.2.3.4' })), 'ip:1.2.3.4');
});

test('special-purpose token (purpose claim) → IP bucket', () => {
  const special = jwt.sign(
    { userId: 'u1', email: 'a@b.c', role: 'USER', purpose: 'oauth_exchange' },
    process.env.JWT_SECRET as string,
  );
  assert.equal(resolveSocketConnectKey(handshake({ authToken: special, ip: '1.2.3.4' })), 'ip:1.2.3.4');
});

test('missing everything → plain IP bucket', () => {
  assert.equal(resolveSocketConnectKey(handshake({ ip: '5.6.7.8' })), 'ip:5.6.7.8');
});
