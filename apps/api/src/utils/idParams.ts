// Path-param format guards for Prisma @id lookups.
// Malformed ids never reach the DB: handlers 400 early instead of bubbling a
// Prisma error (or a confusing 404/500) out of the generic catch block.
// uuid → most models; cuid → NetworkProfile / Signatory / Certificate.
import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ApiResponse } from './response.js';

const uuidSchema = z.string().uuid();
const CUID_REGEX = /^c[a-z0-9]{24}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidSchema.safeParse(value).success;
}

export function isCuid(value: unknown): value is string {
  return typeof value === 'string' && CUID_REGEX.test(value);
}

export function requireUuid(res: Response, value: unknown, label: string): value is string {
  if (!isUuid(value)) {
    ApiResponse.badRequest(res, `Invalid ${label} format`);
    return false;
  }

  return true;
}

export function requireCuid(res: Response, value: unknown, label: string): value is string {
  if (!isCuid(value)) {
    ApiResponse.badRequest(res, `Invalid ${label} format`);
    return false;
  }

  return true;
}

// router.param() guard for routers whose every use of a param name is a uuid PK
// (users :id, quiz :quizId, competition :roundId/:eventId/:submissionId, qotd
// :id/:qotdId). One registration replaces an inline requireUuid in each handler.
// Don't use it where the same param name may legitimately carry a slug.
export function uuidParamGuard(label: string) {
  return (_req: Request, res: Response, next: NextFunction, value: string): void => {
    if (!isUuid(value)) {
      ApiResponse.badRequest(res, `Invalid ${label} format`);
      return;
    }
    next();
  };
}
