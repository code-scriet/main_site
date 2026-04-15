import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { signAccessToken } from './jwt.js';

test('signAccessToken always issues 7-day tokens', () => {
  const token = signAccessToken({
    userId: 'user-1',
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'USER',
  });

  const decoded = jwt.decode(token) as jwt.JwtPayload | null;
  assert.ok(decoded);
  assert.ok(typeof decoded.iat === 'number');
  assert.ok(typeof decoded.exp === 'number');

  const sevenDaysInSeconds = 7 * 24 * 60 * 60;
  assert.equal(decoded.exp! - decoded.iat!, sevenDaysInSeconds);
});
