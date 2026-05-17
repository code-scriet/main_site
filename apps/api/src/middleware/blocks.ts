import { Request, Response, NextFunction, RequestHandler } from 'express';
import { prisma } from '../lib/prisma.js';
import { getAuthUser } from './auth.js';
import { ApiResponse } from '../utils/response.js';
import { logger } from '../utils/logger.js';

type UserBlockFeature = 'EVENT' | 'PLAYGROUND' | 'QOTD' | 'QUIZ' | 'NETWORK';

/**
 * Returns true when an active (not expired) block exists for (userId, feature).
 * Centralised so the /quiz socket auth hook can reuse this without bringing in Express.
 */
export async function isUserBlocked(userId: string, feature: UserBlockFeature): Promise<boolean> {
  if (!userId) return false;
  const block = await prisma.userBlock.findUnique({
    where: { userId_feature: { userId, feature } },
    select: { expiresAt: true },
  });
  if (!block) return false;
  if (block.expiresAt && block.expiresAt < new Date()) return false;
  return true;
}

/**
 * Gate a route on the absence of an active UserBlock for the given feature.
 * Must be chained AFTER authMiddleware. Anonymous requests pass through (existing
 * downstream auth requirements still apply).
 */
export const requireNotBlocked = (feature: UserBlockFeature): RequestHandler => {
  return (async (req: Request, res: Response, next: NextFunction) => {
    const authUser = getAuthUser(req);
    if (!authUser) return next();
    try {
      const blocked = await isUserBlocked(authUser.id, feature);
      if (blocked) {
        return ApiResponse.forbidden(res, `Your account has been blocked from ${feature.toLowerCase()} actions. Contact an administrator.`);
      }
      return next();
    } catch (err) {
      logger.error('requireNotBlocked check failed', { feature, userId: authUser.id, err: err instanceof Error ? err.message : String(err) });
      // On lookup failure, fail-open (do not block legitimate users due to a transient DB blip).
      return next();
    }
  }) as RequestHandler;
};
