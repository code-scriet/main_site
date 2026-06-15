import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { logger } from '../utils/logger.js';
import { ApiResponse } from '../utils/response.js';
import { getQueryString } from '../utils/pagination.js';

export const auditRouter = Router();

// Get audit logs (super admin or president only) — paginated with optional filters
// Note: Uses ADMIN as middleware level but restricts to PRESIDENT/superAdmin internally
auditRouter.get('/', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    // Additional check: only super admin and presidents can view audit logs
    const authUser = getAuthUser(req)!;
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    const isSuperAdmin = superAdminEmail && authUser.email === superAdminEmail;
    const isPresident = authUser.role === 'PRESIDENT';

    if (!isSuperAdmin && !isPresident) {
      return ApiResponse.forbidden(res, 'Only the super admin or president can view audit logs');
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const entity = getQueryString(req.query.entity);
    const action = getQueryString(req.query.action);
    const userId = getQueryString(req.query.userId);
    const search = getQueryString(req.query.search)?.trim() || undefined;

    if (search && search.length > 500) {
      return ApiResponse.badRequest(res, 'search must be at most 500 characters');
    }

    // Build where clause
    const where: Record<string, unknown> = {};

    if (entity) {
      where.entity = entity;
    }

    if (action) {
      where.action = action;
    }

    if (userId) {
      where.userId = userId;
    }

    if (search) {
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { entity: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Fetch user details for all unique userIds.
    // NOTE: intentionally no isDeleted / role filter — audit logs are an
    // immutable historical record, so we must resolve actors that are now
    // soft-deleted or have a NETWORK role (both are hidden from User
    // Management). We surface that status to the UI so admins understand why
    // such an actor can't be found in the user directory.
    const userIds = [...new Set(logs.map((log) => log.userId).filter((id): id is string => Boolean(id)))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      take: 100,
      select: { id: true, name: true, email: true, avatar: true, role: true, isDeleted: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // Attach user info to logs
    const logsWithUser = logs.map(log => ({
      ...log,
      user: log.userId
        ? (userMap.get(log.userId) || { id: log.userId, name: 'Unknown', email: '', avatar: null, role: null, isDeleted: false })
        : { id: 'deleted-user', name: 'Deleted User', email: '', avatar: null, role: null, isDeleted: true },
    }));

    // Get distinct entities and actions for filter dropdowns (scoped to last 90 days for performance)
    let filterEntities: string[] = [];
    let filterActions: string[] = [];
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const [entityResults, actionResults] = await Promise.all([
        prisma.auditLog.findMany({ where: { timestamp: { gte: cutoff } }, select: { entity: true }, distinct: ['entity'], take: 100 }),
        prisma.auditLog.findMany({ where: { timestamp: { gte: cutoff } }, select: { action: true }, distinct: ['action'], take: 100 }),
      ]);
      filterEntities = entityResults.map(e => e.entity);
      filterActions = actionResults.map(a => a.action);
    } catch (err) {
      logger.error('Failed to fetch audit log filters', { error: err instanceof Error ? err.message : String(err) });
    }

    ApiResponse.success(res, {
      logs: logsWithUser,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        entities: filterEntities,
        actions: filterActions,
      },
    });
  } catch (error) {
    ApiResponse.internal(res, 'Failed to fetch audit logs');
  }
});

// Delete audit logs older than N days (super admin only)
auditRouter.delete('/retention', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    const isSuperAdmin = superAdminEmail && authUser.email === superAdminEmail;
    const isPresident = authUser.role === 'PRESIDENT';

    if (!isSuperAdmin && !isPresident) {
      return ApiResponse.forbidden(res, 'Only the super admin or president can delete audit logs');
    }

    const days = Math.max(30, parseInt(req.query.days as string) || 90);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const deleted = await prisma.auditLog.deleteMany({
      where: { timestamp: { lt: cutoff } },
    });

    ApiResponse.success(res, { deleted: deleted.count, olderThan: cutoff.toISOString() });
  } catch (error) {
    ApiResponse.internal(res, 'Failed to delete old audit logs');
  }
});
