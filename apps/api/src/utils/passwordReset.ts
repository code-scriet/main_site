import crypto from 'crypto';
import { getJwtSecret } from './jwt.js';

/**
 * Index-safe hash for one-time password-reset tokens.
 *
 * Uses HMAC-SHA256 with the server's JWT secret as a pepper so that:
 *  - the hash is deterministic and can be used as a `passwordResetToken` lookup column,
 *  - a database leak alone does not let an attacker precompute or reverse the raw token,
 *  - the cost is constant (no bcrypt-style work factor — entropy comes from the 32-byte
 *    random token; bcrypt cannot be used here because we need an indexed equality lookup).
 */
export const hashPasswordResetToken = (raw: string): string =>
  crypto.createHmac('sha256', getJwtSecret()).update(raw).digest('hex');
