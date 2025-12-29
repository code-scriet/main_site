import { Router, Request, Response } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

export const authRouter = Router();

const generateToken = (userId: string): string => {
  const secret = process.env.JWT_SECRET || 'secret';
  const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];
  return jwt.sign({ userId }, secret, { expiresIn });
};

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.get('/providers', (_req: Request, res: Response) => {
  res.json({
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== 'your_google_client_id'),
    github: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_ID !== 'your_github_client_id'),
    devLogin: process.env.NODE_ENV !== 'production',
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
    const existingUser = await prisma.user.findUnique({ where: { email } });
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
        role: email === process.env.SUPER_ADMIN_EMAIL ? 'ADMIN' : 'USER',
      },
    });

    const token = generateToken(user.id);
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar } });
  } catch (error) {
    console.error('Registration error:', error);
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
    const user = await prisma.user.findUnique({ 
      where: { email },
      select: { id: true, name: true, email: true, password: true, role: true, avatar: true },
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.password) {
      return res.status(401).json({ error: 'This account uses OAuth sign-in' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user.id);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

authRouter.get('/google', (req: Request, res: Response, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID === 'your_google_client_id') {
    return res.redirect(`${process.env.FRONTEND_URL}/signin?error=google_not_configured`);
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

authRouter.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/signin?error=google_auth_failed` }),
  (req: Request, res: Response) => {
    const user = req.user as { id: string };
    const token = generateToken(user.id);
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
  }
);

authRouter.get('/github', (req: Request, res: Response, next) => {
  if (!process.env.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID === 'your_github_client_id') {
    return res.redirect(`${process.env.FRONTEND_URL}/signin?error=github_not_configured`);
  }
  passport.authenticate('github', { scope: ['user:email'] })(req, res, next);
});

authRouter.get('/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/signin?error=github_auth_failed` }),
  (req: Request, res: Response) => {
    const user = req.user as { id: string };
    const token = generateToken(user.id);
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
  }
);

authRouter.post('/dev-login', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Development login not available in production' });
  }

  const { email, name } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: name || email.split('@')[0],
          email,
          oauthProvider: 'dev',
          oauthId: `dev_${Date.now()}`,
          role: email === process.env.SUPER_ADMIN_EMAIL ? 'ADMIN' : 'USER',
        },
      });
    }

    const token = generateToken(user.id);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    console.error('Dev login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

authRouter.get('/me', authMiddleware, (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  res.json(authUser);
});

authRouter.post('/logout', (_req: Request, res: Response) => {
  res.json({ message: 'Logged out successfully' });
});
