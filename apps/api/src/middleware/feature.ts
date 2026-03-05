import { Request, Response, NextFunction, RequestHandler } from 'express';
import { prisma } from '../lib/prisma.js';

type FeatureKey = 'playgroundEnabled' | 'quizEnabled';

/**
 * Middleware that blocks an API route when the named feature is disabled in Settings.
 * Falls open (allows requests through) if settings cannot be read.
 */
export const requireFeatureEnabled = (featureKey: FeatureKey): RequestHandler => {
  return (async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await prisma.settings.findFirst({
        where: { id: 'default' },
        select: { playgroundEnabled: true, quizEnabled: true },
      });

      // Default to enabled when no settings row exists yet
      const isEnabled = settings == null || settings[featureKey] !== false;

      if (!isEnabled) {
        return res.status(503).json({
          success: false,
          error: { message: 'This feature is currently disabled' },
        });
      }

      next();
    } catch {
      // Fail open: if we cannot read settings, allow the request through
      next();
    }
  }) as RequestHandler;
};
