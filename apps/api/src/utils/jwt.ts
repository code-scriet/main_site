import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { logger } from './logger.js';

export interface AccessTokenPayload {
  userId: string;
  id: string;
  name?: string;
  email: string;
  role: string;
  /**
   * Token-version watermark. When the DB-side `User.tokenVersion` exceeds the
   * value carried by the JWT, the middleware rejects the token. Used for
   * force-logout (PR5 of admin-deep-control). Legacy tokens issued before this
   * change have no claim — treated as 0 in the middleware, so existing sessions
   * keep working unless an admin explicitly force-logs the user out.
   */
  tokenVersion?: number;
}

export interface OAuthExchangeCodePayload {
  userId: string;
  intent?: 'network';
  networkType?: 'professional' | 'alumni';
}

export interface InvitationClaimTokenPayload {
  invitationId: string;
  email: string;
}

export interface QotdReopenTokenPayload {
  qotdId: string;
  date: string; // IST YYYY-MM-DD, informational
  // The reopen-session marker (the QOTD's reopenedAt ISO at issue time). A
  // close→reopen mints a new reopenedAt, so links from a prior session no longer
  // match and stop working — even though they target the same QOTD.
  nonce: string;
}

const INSECURE_DEFAULT_SECRETS = new Set([
  'secret',
  'your_super_secret_key_change_this_in_production',
]);

const JWT_SECRET_ENV_CANDIDATES = [
  'JWT_SECRET',
  'JWT_SECRET_KEY',
  'AUTH_JWT_SECRET',
  'AUTH_SECRET',
] as const;

const DEV_FALLBACK_SECRET = 'dev_local_jwt_secret_change_me_before_production';
let hasWarnedAboutDevSecret = false;
const ACCESS_TOKEN_EXPIRES_IN: jwt.SignOptions['expiresIn'] = '7d';

const getConfiguredJwtSecret = (): string | undefined => {
  for (const key of JWT_SECRET_ENV_CANDIDATES) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
};

export const getJwtSecret = (): string => {
  const secret = getConfiguredJwtSecret();
  const looksPlaceholder = Boolean(secret && secret.toLowerCase().includes('replace_with'));
  const isInsecure = !secret || INSECURE_DEFAULT_SECRETS.has(secret) || looksPlaceholder;

  if (!isInsecure) {
    return secret;
  }

  // Fail-fast unless NODE_ENV is explicitly 'development' or 'test'.
  // An unset NODE_ENV used to fall through to the dev fallback secret, which would
  // sign real-looking 7-day tokens with a known string on any misconfigured deploy.
  const nodeEnv = process.env.NODE_ENV;
  const isDevOrTest = nodeEnv === 'development' || nodeEnv === 'test';
  if (!isDevOrTest) {
    throw new Error(
      `JWT secret must be configured with a non-default value using one of: ${JWT_SECRET_ENV_CANDIDATES.join(', ')}`
    );
  }

  if (!hasWarnedAboutDevSecret) {
    hasWarnedAboutDevSecret = true;
    logger.warn(
      `Using development JWT fallback secret. Set one of ${JWT_SECRET_ENV_CANDIDATES.join(', ')} in your environment.`
    );
  }

  return DEV_FALLBACK_SECRET;
};

export const signAccessToken = (payload: AccessTokenPayload): string => {
  return jwt.sign(payload, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
};

export const signOAuthExchangeCode = (payload: OAuthExchangeCodePayload): string => (
  jwt.sign(
    // jti makes each code single-use: /api/auth/exchange-code records consumed
    // jtis (consumeOAuthExchangeJti below) and rejects replays within the 30s TTL.
    { ...payload, purpose: 'oauth_exchange', jti: randomUUID() },
    getJwtSecret(),
    { algorithm: 'HS256', expiresIn: '30s' },
  )
);

// ─── Single-use tracking for OAuth exchange codes ───────────────────────────
// Codes live 30s, so consumed jtis only need to be remembered ~60s (TTL + skew).
// Bounded by login rate × 60s — a few hundred bytes at any realistic burst.
// Sweep pattern mirrors quizStore's answerRateLimit sweeper (interval + unref).
const USED_EXCHANGE_JTI_TTL_MS = 60_000;
const usedExchangeJtis = new Map<string, number>(); // jti → expiry epoch ms
let usedJtiSweep: ReturnType<typeof setInterval> | null = null;

function ensureUsedJtiSweep() {
  if (usedJtiSweep) return;
  usedJtiSweep = setInterval(() => {
    const now = Date.now();
    for (const [jti, expiresAt] of usedExchangeJtis) {
      if (expiresAt <= now) usedExchangeJtis.delete(jti);
    }
  }, USED_EXCHANGE_JTI_TTL_MS);
  if (typeof usedJtiSweep.unref === 'function') usedJtiSweep.unref();
}

/**
 * Marks an exchange-code jti as consumed. Returns false when the jti was
 * already used (replay) — callers must reject the exchange. Synchronous
 * has-then-set is race-free on Node's single thread.
 */
export const consumeOAuthExchangeJti = (jti: string): boolean => {
  ensureUsedJtiSweep();
  if (usedExchangeJtis.has(jti)) {
    return false;
  }
  usedExchangeJtis.set(jti, Date.now() + USED_EXCHANGE_JTI_TTL_MS);
  return true;
};

export const signInvitationClaimToken = (payload: InvitationClaimTokenPayload): string => (
  jwt.sign(
    { ...payload, purpose: 'invitation_claim' },
    getJwtSecret(),
    { algorithm: 'HS256', expiresIn: '30d' },
  )
);

// QOTD reopen link. The real open/closed gate is QOTD.reopenedAt (admin closes →
// the link stops working immediately), so a generous TTL is fine — the token only
// proves the holder has the private link for this specific QOTD.
export const signQotdReopenToken = (payload: QotdReopenTokenPayload): string => (
  jwt.sign(
    { ...payload, purpose: 'qotd_reopen' },
    getJwtSecret(),
    { algorithm: 'HS256', expiresIn: '180d' },
  )
);

export const verifyQotdReopenToken = (token: string): QotdReopenTokenPayload => {
  const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as Partial<QotdReopenTokenPayload> & {
    purpose?: string;
  };
  if (decoded.purpose !== 'qotd_reopen' || typeof decoded.qotdId !== 'string' || typeof decoded.nonce !== 'string') {
    throw new Error('Invalid QOTD reopen token');
  }
  return {
    qotdId: decoded.qotdId,
    date: typeof decoded.date === 'string' ? decoded.date : '',
    nonce: decoded.nonce,
  };
};

export const verifyOAuthExchangeCode = (code: string): OAuthExchangeCodePayload & { jti: string } => {
  const decoded = jwt.verify(code, getJwtSecret(), { algorithms: ['HS256'] }) as Partial<OAuthExchangeCodePayload> & {
    purpose?: string;
    jti?: string;
  };

  // jti required: codes without one predate the single-use scheme, and at a
  // 30s TTL no legitimately-issued legacy code can still be in flight by the
  // time a deploy carrying this check finishes.
  if (decoded.purpose !== 'oauth_exchange' || typeof decoded.userId !== 'string' || typeof decoded.jti !== 'string') {
    throw new Error('Invalid authorization code');
  }

  return {
    userId: decoded.userId,
    jti: decoded.jti,
    intent: decoded.intent === 'network' ? 'network' : undefined,
    networkType:
      decoded.networkType === 'professional' || decoded.networkType === 'alumni'
        ? decoded.networkType
        : undefined,
  };
};

export const verifyInvitationClaimToken = (token: string): InvitationClaimTokenPayload => {
  const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as Partial<InvitationClaimTokenPayload> & {
    purpose?: string;
  };

  if (
    decoded.purpose !== 'invitation_claim' ||
    typeof decoded.invitationId !== 'string' ||
    typeof decoded.email !== 'string'
  ) {
    throw new Error('Invalid invitation claim token');
  }

  return {
    invitationId: decoded.invitationId,
    email: decoded.email,
  };
};

export const verifyToken = (token: string): AccessTokenPayload => {
  const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as Partial<AccessTokenPayload> & { purpose?: string };

  // Purpose allowlist (audit S1): access tokens never carry a `purpose` claim;
  // special-purpose tokens do. oauth_exchange / invitation_claim / quiz_access
  // share this signing secret — rejecting on purpose (instead of blocklisting
  // individual values) partitions them all out of session auth. Attendance QR
  // tokens use their own runtime secret (attendanceToken.ts), so rejecting
  // their purpose here is defense-in-depth, not the primary barrier.
  if (typeof decoded.purpose === 'string') {
    throw new Error('Special-purpose tokens cannot be used for authentication');
  }

  const userId = typeof decoded.userId === 'string'
    ? decoded.userId
    : typeof decoded.id === 'string'
      ? decoded.id
      : null;

  if (!userId || typeof decoded.email !== 'string' || typeof decoded.role !== 'string') {
    throw new Error('Invalid token payload');
  }

  return {
    userId,
    id: userId,
    name: typeof decoded.name === 'string' ? decoded.name : undefined,
    email: decoded.email,
    role: decoded.role,
    tokenVersion: typeof decoded.tokenVersion === 'number' ? decoded.tokenVersion : 0,
  };
};
