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
    { ...payload, purpose: 'oauth_exchange' },
    getJwtSecret(),
    { algorithm: 'HS256', expiresIn: '30s' },
  )
);

export const signInvitationClaimToken = (payload: InvitationClaimTokenPayload): string => (
  jwt.sign(
    { ...payload, purpose: 'invitation_claim' },
    getJwtSecret(),
    { algorithm: 'HS256', expiresIn: '30d' },
  )
);

export const verifyOAuthExchangeCode = (code: string): OAuthExchangeCodePayload => {
  const decoded = jwt.verify(code, getJwtSecret(), { algorithms: ['HS256'] }) as Partial<OAuthExchangeCodePayload> & {
    purpose?: string;
  };

  if (decoded.purpose !== 'oauth_exchange' || typeof decoded.userId !== 'string') {
    throw new Error('Invalid authorization code');
  }

  return {
    userId: decoded.userId,
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

  if (decoded.purpose === 'attendance') {
    throw new Error('Attendance tokens cannot be used for authentication');
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
