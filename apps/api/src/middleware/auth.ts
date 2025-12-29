import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

// Custom user type for authenticated requests
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string | null;
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

const authMiddlewareImpl = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const secret = process.env.JWT_SECRET || 'secret';

    const decoded = jwt.verify(token, secret) as { userId: string };
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Assign auth user to custom property
    (req as AuthRequest).authUser = user;
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
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const secret = process.env.JWT_SECRET || 'secret';

    const decoded = jwt.verify(token, secret) as { userId: string };
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
      },
    });

    if (user) {
      (req as AuthRequest).authUser = user;
    }
    
    next();
  } catch (error) {
    next();
  }
};

// Cast to RequestHandler to fix Express type compatibility
export const optionalAuthMiddleware: RequestHandler = optionalAuthMiddlewareImpl as RequestHandler;
