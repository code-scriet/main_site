import jwt from 'jsonwebtoken';

export interface AccessTokenPayload {
  userId: string;
  id: string;
  email: string;
  role: string;
}

const INSECURE_DEFAULT_SECRETS = new Set([
  'secret',
  'your_super_secret_key_change_this_in_production',
]);

const DEV_FALLBACK_SECRET = 'dev_local_jwt_secret_change_me_before_production';
let hasWarnedAboutDevSecret = false;

export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET?.trim();
  const looksPlaceholder = Boolean(secret && secret.toLowerCase().includes('replace_with'));
  const isInsecure = !secret || INSECURE_DEFAULT_SECRETS.has(secret) || looksPlaceholder;

  if (!isInsecure) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured with a non-default value');
  }

  if (!hasWarnedAboutDevSecret) {
    hasWarnedAboutDevSecret = true;
    console.warn('⚠️ Using development JWT fallback secret. Set JWT_SECRET in your environment.');
  }

  return DEV_FALLBACK_SECRET;
};

export const signAccessToken = (payload: AccessTokenPayload): string => {
  const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
};
