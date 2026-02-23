import { Request, Response, NextFunction, RequestHandler } from 'express';
import { getAuthUser } from './auth.js';

type Role = 'PUBLIC' | 'USER' | 'NETWORK' | 'MEMBER' | 'CORE_MEMBER' | 'ADMIN' | 'PRESIDENT';

const roleHierarchy: Record<Role, number> = {
  PUBLIC: 0,
  USER: 1,
  NETWORK: 1,
  MEMBER: 2,
  CORE_MEMBER: 3,
  ADMIN: 4,
  PRESIDENT: 4,
};

export const hasPermission = (userRole: string, requiredRole: Role): boolean => {
  const userLevel = roleHierarchy[userRole as Role] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;
  return userLevel >= requiredLevel;
};

export const requireRole = (minRole: Role): RequestHandler => {
  return ((req: Request, res: Response, next: NextFunction) => {
    const authUser = getAuthUser(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!hasPermission(authUser.role, minRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }


    next();
  }) as RequestHandler;
};
