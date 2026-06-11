import { Request, Response, NextFunction, RequestHandler } from 'express';
import { prisma } from '../lib/prisma.js';
import { getAuthUser } from './auth.js';
import { ApiResponse } from '../utils/response.js';
import { logger } from '../utils/logger.js';

type UserBlockFeature = 'EVENT' | 'PLAYGROUND' | 'QOTD' | 'QUIZ' | 'NETWORK';

// Bounded 30s LRU over (userId, feature) block lookups — same shape as
// utils/userAuthCache.ts. Every gated request and every /quiz handshake paid
// one point read; blocks change rarely. Worst-case staleness is the 30s TTL;
// the block/unblock/soft-delete/restore handlers in users.ts call
// invalidateUserBlockCache() so admin actions propagate immediately.
const BLOCK_CACHE_TTL_MS = 30_000;
const BLOCK_CACHE_MAX_ENTRIES = 1000;
const blockCache = new Map<string, { blocked: boolean; expiresAt: number }>();

export function invalidateUserBlockCache(userId: string): void {
  for (const key of Array.from(blockCache.keys())) {
    if (key.startsWith(`${userId}:`)) blockCache.delete(key);
  }
}

/**
 * Returns true when an active (not expired) block exists for (userId, feature).
 * Centralised so the /quiz socket auth hook can reuse this without bringing in Express.
 */
export async function isUserBlocked(userId: string, feature: UserBlockFeature): Promise<boolean> {
  if (!userId) return false;

  const cacheKey = `${userId}:${feature}`;
  const cached = blockCache.get(cacheKey);
  if (cached && Date.now() <= cached.expiresAt) {
    // Delete-then-set keeps Map insertion order working as LRU recency.
    blockCache.delete(cacheKey);
    blockCache.set(cacheKey, cached);
    return cached.blocked;
  }

  const block = await prisma.userBlock.findUnique({
    where: { userId_feature: { userId, feature } },
    select: { expiresAt: true },
  });
  const blocked = Boolean(block) && !(block?.expiresAt && block.expiresAt < new Date());

  if (blockCache.size >= BLOCK_CACHE_MAX_ENTRIES && !blockCache.has(cacheKey)) {
    const oldest = blockCache.keys().next().value;
    if (oldest) blockCache.delete(oldest);
  }
  blockCache.set(cacheKey, { blocked, expiresAt: Date.now() + BLOCK_CACHE_TTL_MS });

  return blocked;
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
