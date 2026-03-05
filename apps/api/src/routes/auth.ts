import { Router, Request, Response } from 'express';
import passport from 'passport';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { socketEvents } from '../utils/socket.js';
import { emailService } from '../utils/email.js';
import { logger } from '../utils/logger.js';
import { signAccessToken } from '../utils/jwt.js';

export const authRouter = Router();

const isDevLoginEnabled = (): boolean => process.env.NODE_ENV === 'development' && process.env.ENABLE_DEV_AUTH === 'true';

const getFrontendUrl = (): string => process.env.FRONTEND_URL || 'http://localhost:5173';

const buildAuthCallbackUrl = (token: string, intent?: string, networkType?: string): string => {
  const callbackUrl = new URL('/auth/callback', getFrontendUrl());
  let hash = `token=${encodeURIComponent(token)}`;
  if (intent) hash += `&intent=${encodeURIComponent(intent)}`;
  if (networkType) hash += `&network_type=${encodeURIComponent(networkType)}`;
  callbackUrl.hash = hash;
  return callbackUrl.toString();
};

// Parse a single cookie from the raw Cookie header
const getCookie = (req: Request, name: string): string | undefined => {
  const cookies = req.headers.cookie;
  if (!cookies) return undefined;
  const match = cookies.split(';').find(c => c.trim().startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=').trim()) : undefined;
};

const generateToken = (user: { id: string; name?: string | null; email: string; role: string }): string =>
  signAccessToken({
    userId: user.id,
    id: user.id,
    name: user.name || undefined,
    email: user.email,
    role: user.role,
  });

/**
 * Set cross-subdomain auth cookie so the playground at code.codescriet.dev
 * can read the session without a separate login.
 * In development the cookie is set without Domain (works for localhost).
 */
const setSessionCookie = (res: Response, token: string) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('scriet_session', token, {
    httpOnly: false,          // frontend needs to read it for auth header
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
    ...(isProd ? { domain: '.codescriet.dev' } : {}),
    path: '/',
  });
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
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1),
});

const devLoginSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  name: z.string().trim().min(1).max(100).optional(),
});

authRouter.get('/providers', (_req: Request, res: Response) => {
  res.json({
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== 'your_google_client_id'),
    github: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_ID !== 'your_github_client_id'),
    devLogin: isDevLoginEnabled(),
    emailPassword: true,
  });
});

authRouter.post('/register', async (req: Request, res: Response) => {
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
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        oauthProvider: 'email',
        oauthId: `email_${Date.now()}`,
        role: 'USER',
      },
    });

    const token = generateToken(user);
    
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

authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const { email, password } = validation.data;
    const fetchedUser = await prisma.user.findFirst({ 
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, name: true, email: true, password: true, role: true, avatar: true, oauthProvider: true },
    });
    
    if (!fetchedUser) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!fetchedUser.password) {
      return res.status(401).json({ error: 'This account uses OAuth sign-in only. Please sign in with OAuth or add a password first.' });
    }

    const isValid = await bcrypt.compare(password, fetchedUser.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = await demoteOrphanNetworkUser(fetchedUser);
    const token = generateToken(user);
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

  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

authRouter.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${getFrontendUrl()}/signin?error=google_auth_failed` }),
  async (req: Request, res: Response) => {
    try {
      const passportUser = req.user as { id?: string } | undefined;
      if (!passportUser?.id) {
        return res.redirect(`${getFrontendUrl()}/signin?error=google_auth_failed`);
      }

      let user = await prisma.user.findUnique({
        where: { id: passportUser.id },
        select: { id: true, email: true, role: true },
      });

      if (!user) {
        return res.redirect(`${getFrontendUrl()}/signin?error=google_auth_failed`);
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
      setSessionCookie(res, token);
      const shouldPassNetworkIntent = isNetworkIntent;
      return res.redirect(buildAuthCallbackUrl(token, shouldPassNetworkIntent ? 'network' : undefined, shouldPassNetworkIntent ? networkType : undefined));
    } catch (error) {
      logger.error('Google callback error:', { error: error instanceof Error ? error.message : String(error) });
      return res.redirect(`${getFrontendUrl()}/signin?error=google_auth_failed`);
    }
  }
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

  passport.authenticate('github', { scope: ['user:email'] })(req, res, next);
});

authRouter.get('/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: `${getFrontendUrl()}/signin?error=github_auth_failed` }),
  async (req: Request, res: Response) => {
    try {
      const passportUser = req.user as { id?: string } | undefined;
      if (!passportUser?.id) {
        return res.redirect(`${getFrontendUrl()}/signin?error=github_auth_failed`);
      }

      let user = await prisma.user.findUnique({
        where: { id: passportUser.id },
        select: { id: true, email: true, role: true },
      });

      if (!user) {
        return res.redirect(`${getFrontendUrl()}/signin?error=github_auth_failed`);
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

      const token = generateToken(user);      setSessionCookie(res, token);      const shouldPassNetworkIntent = isNetworkIntent;
      return res.redirect(buildAuthCallbackUrl(token, shouldPassNetworkIntent ? 'network' : undefined, shouldPassNetworkIntent ? networkType : undefined));
    } catch (error) {
      logger.error('GitHub callback error:', { error: error instanceof Error ? error.message : String(error) });
      return res.redirect(`${getFrontendUrl()}/signin?error=github_auth_failed`);
    }
  }
);

authRouter.post('/dev-login', async (req: Request, res: Response) => {
  if (!isDevLoginEnabled()) {
    return res.status(403).json({ error: 'Development login is disabled' });
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
          oauthId: `dev_${Date.now()}`,
          role: 'USER',
        },
      });
    }

    user = await demoteOrphanNetworkUser(user);
    const token = generateToken(user);
    
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
  res.json({ success: true, data: authUser ? withSuperAdmin(authUser) : authUser });
});

authRouter.post('/logout', (_req: Request, res: Response) => {
  clearSessionCookie(res);
  res.json({ message: 'Logged out successfully' });
});
