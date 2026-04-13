import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { logger } from '../utils/logger.js';

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
      return res.status(403).json({
        success: false,
        error: { message: 'Only the super admin or president can view audit logs' },
      });
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const entity = req.query.entity as string | undefined;
    const action = req.query.action as string | undefined;
    const userId = req.query.userId as string | undefined;
    const rawSearch = req.query.search;
    const search = typeof rawSearch === 'string' ? rawSearch.trim() : undefined;

    if (search && search.length > 500) {
      return res.status(400).json({
        success: false,
        error: { message: 'search must be at most 500 characters' },
      });
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

    // Fetch user details for all unique userIds
    const userIds = [...new Set(logs.map((log) => log.userId).filter((id): id is string => Boolean(id)))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      take: 100,
      select: { id: true, name: true, email: true, avatar: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // Attach user info to logs
    const logsWithUser = logs.map(log => ({
      ...log,
      user: log.userId
        ? (userMap.get(log.userId) || { id: log.userId, name: 'Unknown', email: '', avatar: null })
        : { id: 'deleted-user', name: 'Deleted User', email: '', avatar: null },
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

    res.json({
      success: true,
      data: {
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
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch audit logs' },
    });
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
      return res.status(403).json({
        success: false,
        error: { message: 'Only the super admin or president can delete audit logs' },
      });
    }

    const days = Math.max(30, parseInt(req.query.days as string) || 90);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const deleted = await prisma.auditLog.deleteMany({
      where: { timestamp: { lt: cutoff } },
    });

    res.json({
      success: true,
      data: { deleted: deleted.count, olderThan: cutoff.toISOString() },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: 'Failed to delete old audit logs' },
    });
  }
});
