import jwt from 'jsonwebtoken';

export interface AccessTokenPayload {
  userId: string;
  id: string;
  name?: string;
  email: string;
  role: string;
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

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `JWT secret must be configured with a non-default value using one of: ${JWT_SECRET_ENV_CANDIDATES.join(', ')}`
    );
  }

  if (!hasWarnedAboutDevSecret) {
    hasWarnedAboutDevSecret = true;
    console.warn(
      `⚠️ Using development JWT fallback secret. Set one of ${JWT_SECRET_ENV_CANDIDATES.join(', ')} in your environment.`
    );
  }

  return DEV_FALLBACK_SECRET;
};

export const signAccessToken = (payload: AccessTokenPayload): string => {
  const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
};
