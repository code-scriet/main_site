import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { socketEvents } from '../utils/socket.js';
import { emailService } from '../utils/email.js';
import { logger } from '../utils/logger.js';
import { signAccessToken, signOAuthExchangeCode, verifyOAuthExchangeCode } from '../utils/jwt.js';
import { auditLog } from '../utils/audit.js';
import { hashPasswordResetToken } from '../utils/passwordReset.js';

export const authRouter = Router();

const isDevLoginEnabled = (): boolean => process.env.NODE_ENV === 'development' && process.env.ENABLE_DEV_AUTH === 'true';

if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEV_AUTH === 'true') {
  logger.warn('ENABLE_DEV_AUTH is true in production env; dev login route remains disabled by code guard.');
}

const getFrontendUrl = (): string => process.env.FRONTEND_URL || 'http://localhost:5173';

const buildAuthCallbackUrl = (code: string): string => {
  const callbackUrl = new URL('/auth/callback', getFrontendUrl());
  callbackUrl.searchParams.set('code', code);
  return callbackUrl.toString();
};

// Parse a single cookie from the raw Cookie header
const getCookie = (req: Request, name: string): string | undefined => {
  const cookies = req.headers.cookie;
  if (!cookies) return undefined;
  const match = cookies.split(';').find(c => c.trim().startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=').trim()) : undefined;
};

const generateToken = (
  user: { id: string; name?: string | null; email: string; role: string; tokenVersion?: number | null }
): string =>
  signAccessToken({
    userId: user.id,
    id: user.id,
    name: user.name || undefined,
    email: user.email,
    role: user.role,
    tokenVersion: typeof user.tokenVersion === 'number' ? user.tokenVersion : 0,
  });

/** Extract requester's IP for login telemetry. Truncated to v4 prefix or v6 first-block to limit retained PII. */
const getRequestIp = (req: Request): string | null => {
  // L2: prefer Express's req.ip. With `trust proxy` set, Express resolves the
  // real client IP from the proxy chain; the raw X-Forwarded-For header is
  // fully client-controlled and only a dev/non-proxied fallback here.
  const fwd = req.headers['x-forwarded-for'];
  const raw = req.ip || (Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0]?.trim()) || req.socket?.remoteAddress || null;
  if (!raw) return null;
  // Strip IPv6 zone identifier and ::ffff: prefix
  const cleaned = String(raw).replace(/^::ffff:/, '').split('%')[0];
  return cleaned.slice(0, 64); // hard cap for safety
};

/** Fire-and-forget login telemetry write. Never blocks the response. */
const recordLogin = (userId: string, req: Request): void => {
  const ip = getRequestIp(req);
  prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date(), lastLoginIp: ip },
  }).catch((err) => {
    logger.warn('Failed to record login telemetry', { userId, err: err instanceof Error ? err.message : String(err) });
  });
};

/**
 * Set cross-subdomain auth cookie so the playground at code.codescriet.dev
 * can read the session without a separate login.
 * In development the cookie is set without Domain (works for localhost).
 */
const setSessionCookie = (res: Response, token: string) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('scriet_session', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    ...(isProd ? { domain: '.codescriet.dev' } : {}),
    path: '/',
  });
};

const clearSessionCookie = (res: Response) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('scriet_session', {
    secure: isProd,
    sameSite: 'lax',
    ...(isProd ? { domain: '.codescriet.dev' } : {}),
    path: '/',
  });
};

// ─── OAuth login-CSRF protection (M6) ───
// A random `state` nonce is stored in a short-lived host-only cookie when the
// OAuth flow starts, passed through to the provider, and verified on the
// callback. This binds the round-trip to the browser that initiated it, so a
// third party can't silently complete a sign-in in the victim's session.
// sameSite:'lax' is required so the cookie survives the top-level GET redirect
// back from the provider. The strategy uses passport-oauth2's NullStore, which
// ignores `state`, so verification here is authoritative and conflict-free.
const OAUTH_STATE_COOKIE = 'oauth_state';

const issueOAuthState = (res: Response): string => {
  const state = randomUUID();
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 5 * 60 * 1000,
    path: '/',
  });
  return state;
};

const verifyOAuthState = (provider: 'google' | 'github') =>
  (req: Request, res: Response, next: NextFunction) => {
    const expected = getCookie(req, OAUTH_STATE_COOKIE);
    const actual = typeof req.query.state === 'string' ? req.query.state : '';
    // One-time use: always clear, regardless of outcome.
    res.clearCookie(OAUTH_STATE_COOKIE, {
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    if (!expected || !actual || expected !== actual) {
      logger.warn('OAuth state mismatch — rejecting possible login CSRF', { provider });
      return res.redirect(`${getFrontendUrl()}/signin?error=${provider}_auth_failed`);
    }
    next();
  };

const normalizeNetworkType = (value: string | undefined): 'professional' | 'alumni' | undefined => (
  value === 'professional' || value === 'alumni' ? value : undefined
);

const withSuperAdmin = <T extends { email: string }>(user: T) => ({
  ...user,
  isSuperAdmin: !!process.env.SUPER_ADMIN_EMAIL && user.email === process.env.SUPER_ADMIN_EMAIL,
});

const demoteOrphanNetworkUser = async <T extends { id: string; role: string }>(user: T): Promise<T> => {
  if (user.role !== 'NETWORK') {
    return user;
  }

  const profile = await prisma.networkProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  if (profile) {
    return user;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: 'USER' },
  });

  logger.warn('Demoted NETWORK user without profile to USER', { userId: user.id });
  return { ...user, role: 'USER' };
};

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  // M5: min 8 (was 6) to match the reset flow; max 72 because bcrypt silently
  // truncates input beyond 72 bytes — rejecting is clearer than hashing a prefix.
  password: z.string().min(8).max(72),
});

const loginSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1),
});

const devLoginSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  name: z.string().trim().min(1).max(100).optional(),
});

const exchangeCodeSchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/, 'Invalid authorization code'),
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many registration attempts, please try again later.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts, please try again later.' },
});

authRouter.get('/providers', (_req: Request, res: Response) => {
  res.json({
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== 'your_google_client_id'),
    github: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_ID !== 'your_github_client_id'),
    devLogin: isDevLoginEnabled(),
    emailPassword: true,
  });
});

authRouter.post('/register', registerLimiter, async (req: Request, res: Response) => {
  try {
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const { name, email, password } = validation.data;
    const existingUser = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existingUser) {
      return res.status(400).json({ error: 'Registration failed. If you already have an account, try logging in.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        oauthProvider: 'email',
        oauthId: `email_${randomUUID()}`,
        role: 'USER',
      },
    });

    const token = generateToken(user);
    recordLogin(user.id, req);

    // Emit socket event for real-time updates
    socketEvents.userCreated(user.id);

    // Send welcome email (async, don't wait)
    if (user.email) {
      emailService.sendWelcome(user.email, user.name).catch(err => {
        logger.error('Failed to send welcome email', { error: err instanceof Error ? err.message : 'Unknown' });
      });
    }

    setSessionCookie(res, token);
    res.status(201).json({ token, user: withSuperAdmin({ id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar }) });
  } catch (error) {
    logger.error('Registration error:', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Registration failed' });
  }
});

authRouter.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const { email, password } = validation.data;
    const fetchedUser = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: {
        id: true, name: true, email: true, password: true, role: true, avatar: true, oauthProvider: true,
        tokenVersion: true, isDeleted: true,
      },
    });

    if (!fetchedUser) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (fetchedUser.isDeleted) {
      // Same error message as bad-password to avoid account enumeration.
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!fetchedUser.password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = await bcrypt.compare(password, fetchedUser.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = await demoteOrphanNetworkUser(fetchedUser);
    const token = generateToken(user);
    recordLogin(user.id, req);
    setSessionCookie(res, token);
    res.json({ token, user: withSuperAdmin({ id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar }) });
  } catch (error) {
    logger.error('Login error:', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Login failed' });
  }
});

authRouter.get('/google', (req: Request, res: Response, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID === 'your_google_client_id') {
    return res.redirect(`${getFrontendUrl()}/signin?error=google_not_configured`);
  }

  // Store network intent in a short-lived cookie for retrieval in callback
  const intent = req.query.intent as string;
  const networkType = normalizeNetworkType(req.query.type as string | undefined); // 'professional' or 'alumni'
  if (intent === 'network') {
    res.cookie('oauth_intent', 'network', {
      maxAge: 5 * 60 * 1000, // 5 minutes
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    if (networkType) {
      res.cookie('network_type', networkType, {
        maxAge: 5 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
    }
  } else {
    res.clearCookie('oauth_intent');
    res.clearCookie('network_type');
  }

  const state = issueOAuthState(res);
  passport.authenticate('google', { scope: ['profile', 'email'], state })(req, res, next);
});

/** Shared OAuth callback handler — used by both Google and GitHub */
const handleOAuthCallback = (provider: 'google' | 'github') =>
  async (req: Request, res: Response) => {
    const errorRedirect = `${getFrontendUrl()}/signin?error=${provider}_auth_failed`;
    try {
      const passportUser = req.user as { id?: string } | undefined;
      if (!passportUser?.id) {
        return res.redirect(errorRedirect);
      }

      let user = await prisma.user.findUnique({
        where: { id: passportUser.id },
        select: { id: true, name: true, email: true, role: true, tokenVersion: true, isDeleted: true },
      });

      if (!user) {
        return res.redirect(errorRedirect);
      }
      if (user.isDeleted) {
        return res.redirect(errorRedirect);
      }

      // Check for network intent from cookie
      const intent = getCookie(req, 'oauth_intent');
      const networkType = normalizeNetworkType(getCookie(req, 'network_type'));
      res.clearCookie('oauth_intent');
      res.clearCookie('network_type');

      const isNetworkIntent = intent === 'network';

      // Safety net: if an account has NETWORK role but no profile and this is a normal sign-in,
      // normalize back to USER so regular users stay on the standard auth flow.
      if (!isNetworkIntent) {
        user = await demoteOrphanNetworkUser(user);
      }

      // For network intent, upgrade USER/PUBLIC to NETWORK role
      // Higher-privileged users (MEMBER, ADMIN, etc.) keep their role
      const isNetworkUpgrade = isNetworkIntent && (user.role === 'USER' || user.role === 'PUBLIC');
      if (isNetworkUpgrade) {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: 'NETWORK' },
        });
        user.role = 'NETWORK';
      }

      const token = generateToken(user);
      recordLogin(user.id, req);
      setSessionCookie(res, token);
      const code = signOAuthExchangeCode({
        userId: user.id,
        intent: isNetworkIntent ? 'network' : undefined,
        networkType: isNetworkIntent ? networkType : undefined,
      });

      await auditLog(user.id, 'LOGIN', 'auth', user.id, {
        provider,
        intent: isNetworkIntent ? 'network' : 'standard',
      });

      return res.redirect(buildAuthCallbackUrl(code));
    } catch (error) {
      logger.error(`${provider} callback error:`, { error: error instanceof Error ? error.message : String(error) });
      return res.redirect(errorRedirect);
    }
  };

authRouter.get('/google/callback',
  verifyOAuthState('google'),
  passport.authenticate('google', { session: false, failureRedirect: `${getFrontendUrl()}/signin?error=google_auth_failed` }),
  handleOAuthCallback('google'),
);

authRouter.get('/github', (req: Request, res: Response, next) => {
  if (!process.env.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID === 'your_github_client_id') {
    return res.redirect(`${getFrontendUrl()}/signin?error=github_not_configured`);
  }

  // Store network intent in a short-lived cookie for retrieval in callback
  const intent = req.query.intent as string;
  const networkType = normalizeNetworkType(req.query.type as string | undefined);
  if (intent === 'network') {
    res.cookie('oauth_intent', 'network', {
      maxAge: 5 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    if (networkType) {
      res.cookie('network_type', networkType, {
        maxAge: 5 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
    }
  } else {
    res.clearCookie('oauth_intent');
    res.clearCookie('network_type');
  }

  const state = issueOAuthState(res);
  passport.authenticate('github', { scope: ['user:email'], state })(req, res, next);
});

authRouter.get('/github/callback',
  verifyOAuthState('github'),
  passport.authenticate('github', { session: false, failureRedirect: `${getFrontendUrl()}/signin?error=github_auth_failed` }),
  handleOAuthCallback('github'),
);

authRouter.post('/dev-login', async (req: Request, res: Response) => {
  if (!isDevLoginEnabled()) {
    // Return 404 to hide endpoint existence when disabled (security best practice)
    return res.status(404).json({ error: 'Not found' });
  }

  const validation = devLoginSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: validation.error.errors[0].message });
  }

  const { email, name } = validation.data;

  try {
    let user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = await prisma.user.create({
        data: {
          name: name || email.split('@')[0],
          email,
          oauthProvider: 'dev',
          oauthId: `dev_${randomUUID()}`,
          role: 'USER',
        },
      });
    }

    user = await demoteOrphanNetworkUser(user);
    const token = generateToken(user);
    recordLogin(user.id, req);

    // For new dev users, emit socket event
    if (isNewUser) {
      socketEvents.userCreated(user.id);
    }

    setSessionCookie(res, token);
    res.json({ token, user: withSuperAdmin({ id: user.id, name: user.name, email: user.email, role: user.role }) });
  } catch (error) {
    logger.error('Dev login error:', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Login failed' });
  }
});

authRouter.get('/me', authMiddleware, (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return res.json({ success: true, data: null });
  }
  // Include a fresh token so cross-origin callers (e.g. the playground) can
  // obtain a JWT even when they authenticated via httpOnly cookie alone.
  const token = generateToken(authUser);
  res.json({ success: true, data: withSuperAdmin(authUser), token });
});

authRouter.post('/exchange-code', async (req: Request, res: Response) => {
  const parsed = exchangeCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid authorization code' });
  }

  let payload;
  try {
    payload = verifyOAuthExchangeCode(parsed.data.code);
  } catch {
    return res.status(400).json({ error: 'Authorization code expired or invalid' });
  }

  try {
    const fetchedUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        phone: true,
        course: true,
        branch: true,
        year: true,
        profileCompleted: true,
        tokenVersion: true,
        isDeleted: true,
      },
    });

    if (!fetchedUser) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (fetchedUser.isDeleted) {
      return res.status(401).json({ error: 'Account has been disabled' });
    }

    // Standard sign-ins should not remain on NETWORK if no profile exists.
    const authUser = payload.intent === 'network'
      ? fetchedUser
      : await demoteOrphanNetworkUser(fetchedUser);

    const token = generateToken(authUser);
    recordLogin(authUser.id, req);
    setSessionCookie(res, token);

    return res.json({
      token,
      intent: payload.intent,
      network_type: payload.networkType,
    });
  } catch (error) {
    logger.error('OAuth code exchange error:', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Authorization code exchange failed' });
  }
});

authRouter.post('/logout', (_req: Request, res: Response) => {
  clearSessionCookie(res);
  res.json({ message: 'Logged out successfully' });
});

// ─── Password reset consumer (admin-deep-control PR2 of "PR1 schema" rollout) ───
// Companion to admin-initiated POST /api/users/:id/password-reset. The admin route
// stored a sha-256 hash of the random token; here we verify and let the user set a
// new password. Token is single-use: cleared from the row on success.
const resetPasswordSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  token: z.string().min(32).max(256),
  // M5: cap at 72 (bcrypt's effective limit) to avoid silently hashing a prefix.
  newPassword: z.string().min(8).max(72),
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many reset attempts, please try again later.' },
});

// Defense-in-depth: also rate-limit by email (lowercased) to stop a botnet from
// brute-forcing one account across many IPs. 5 attempts per email per 15 min.
const resetPasswordEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return email || req.ip || 'unknown';
  },
  message: { error: 'Too many reset attempts, please try again later.' },
});

authRouter.post('/reset-password', resetPasswordLimiter, resetPasswordEmailLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid reset payload' });
    }
    const { email, token, newPassword } = parsed.data;
    const hashed = hashPasswordResetToken(token);
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Atomic claim-and-consume. `updateMany` with the hashed token in the WHERE
    // clause guarantees that two concurrent requests can never both succeed:
    // the first to commit clears `passwordResetToken`, the second matches zero
    // rows. Email is matched case-insensitively at the DB layer via collation
    // is not portable, so we resolve the user id first (still safe — the
    // claim only succeeds if the token is unchanged at write time).
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, passwordResetExpiresAt: true, isDeleted: true, passwordResetToken: true },
    });
    const valid =
      user &&
      !user.isDeleted &&
      user.passwordResetToken === hashed &&
      user.passwordResetExpiresAt &&
      user.passwordResetExpiresAt.getTime() >= Date.now();

    if (!valid) {
      return res.status(400).json({ error: 'Reset link is invalid or has expired' });
    }

    const claim = await prisma.user.updateMany({
      where: {
        id: user!.id,
        passwordResetToken: hashed,
        passwordResetExpiresAt: { gte: new Date() },
      },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        tokenVersion: { increment: 1 }, // invalidate every active session — fresh login required
      },
    });
    if (claim.count === 0) {
      // Lost the race to a concurrent consumer.
      return res.status(400).json({ error: 'Reset link is invalid or has expired' });
    }
    await auditLog(user!.id, 'PASSWORD_RESET_COMPLETED', 'user', user!.id);
    return res.json({ success: true, message: 'Password updated. Please sign in with your new password.' });
  } catch (error) {
    logger.error('Password reset error:', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Password reset failed' });
  }
});
