import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { AccessTokenPayload, getJwtSecret } from '../utils/jwt.js';

// Custom user type for authenticated requests
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string | null;
  phone?: string | null;
  course?: string | null;
  branch?: string | null;
  year?: string | null;
  profileCompleted?: boolean | null;
  /** Current DB-side tokenVersion. Carried so /me refresh signs tokens with the right watermark. */
  tokenVersion?: number;
}

// AuthRequest extends Request with custom user
export interface AuthRequest extends Request {
  authUser?: AuthUser;
}

// Helper to get auth user from request
export const getAuthUser = (req: Request): AuthUser | undefined => {
  return (req as AuthRequest).authUser;
};

// Helper to get required auth user (throws if not present)
export const requireAuthUser = (req: Request): AuthUser => {
  const user = (req as AuthRequest).authUser;
  if (!user) {
    throw new Error('User not authenticated');
  }
  return user;
};

/** Extract token from Bearer header OR scriet_session cookie */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  // Fallback: read scriet_session cookie (set by API on login, httpOnly:false)
  const cookies = req.headers.cookie;
  if (cookies) {
    const match = cookies.split(';').find(c => c.trim().startsWith('scriet_session='));
    if (match) {
      return decodeURIComponent(match.split('=').slice(1).join('=').trim());
    }
  }
  return null;
}

const authMiddlewareImpl = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as Partial<AccessTokenPayload>;
    const userId = typeof decoded.userId === 'string'
      ? decoded.userId
      : typeof decoded.id === 'string'
        ? decoded.id
        : null;

    if (!userId) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    // Reject attendance QR tokens — they share the signing key but must not grant auth
    if ((decoded as Record<string, unknown>).purpose === 'attendance') {
      return res.status(401).json({ error: 'Attendance tokens cannot be used for authentication' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
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
        // admin-deep-control: tokenVersion + soft-delete enforcement
        tokenVersion: true,
        isDeleted: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Soft-delete + force-logout enforcement (admin-deep-control).
    // - isDeleted: account disabled by admin → reject token even if signed
    // - tokenVersion: DB watermark must be <= claim. Legacy tokens (no claim)
    //   treat the claim as 0; new tokens carry the watermark from issuance.
    if (user.isDeleted === true) {
      return res.status(401).json({ error: 'Account has been disabled' });
    }
    const claimVersion = typeof (decoded as Record<string, unknown>).tokenVersion === 'number'
      ? (decoded as Record<string, unknown>).tokenVersion as number
      : 0;
    const dbVersion = typeof user.tokenVersion === 'number' ? user.tokenVersion : 0;
    if (dbVersion > claimVersion) {
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }

    // Strip isDeleted before attaching authUser; keep tokenVersion so /me refresh
    // signs new tokens with the current DB watermark.
    const { isDeleted: _isd, ...authUser } = user;
    (req as AuthRequest).authUser = authUser as AuthUser;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Cast to RequestHandler to fix Express type compatibility
export const authMiddleware: RequestHandler = authMiddlewareImpl as RequestHandler;

const optionalAuthMiddlewareImpl = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return next();
    }
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as Partial<AccessTokenPayload>;
    const userId = typeof decoded.userId === 'string'
      ? decoded.userId
      : typeof decoded.id === 'string'
        ? decoded.id
        : null;

    if (!userId) {
      return next();
    }

    // Skip attendance QR tokens — they share the signing key but must not grant auth
    if ((decoded as Record<string, unknown>).purpose === 'attendance') {
      return next();
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
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

    if (user && !user.isDeleted) {
      const claimVersion = typeof (decoded as Record<string, unknown>).tokenVersion === 'number'
        ? (decoded as Record<string, unknown>).tokenVersion as number
        : 0;
      const dbVersion = typeof user.tokenVersion === 'number' ? user.tokenVersion : 0;
      if (dbVersion <= claimVersion) {
        const { isDeleted: _isd, ...authUser } = user;
        (req as AuthRequest).authUser = authUser as AuthUser;
      }
    }

    next();
  } catch (error) {
    next();
  }
};

// Cast to RequestHandler to fix Express type compatibility
export const optionalAuthMiddleware: RequestHandler = optionalAuthMiddlewareImpl as RequestHandler;
