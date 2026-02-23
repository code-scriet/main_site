import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';

export const auditRouter = Router();

// Get audit logs (super admin only) — paginated with optional filters
auditRouter.get('/', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    // Only the super admin and presidents can view audit logs
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
    const search = req.query.search as string | undefined;

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
    const userIds = [...new Set(logs.map(log => log.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, avatar: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // Attach user info to logs
    const logsWithUser = logs.map(log => ({
      ...log,
      user: userMap.get(log.userId) || { id: log.userId, name: 'Unknown', email: '', avatar: null },
    }));

    // Get distinct entities and actions for filter dropdowns
    const [entities, actions] = await Promise.all([
      prisma.auditLog.findMany({ select: { entity: true }, distinct: ['entity'] }),
      prisma.auditLog.findMany({ select: { action: true }, distinct: ['action'] }),
    ]);

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
          entities: entities.map(e => e.entity),
          actions: actions.map(a => a.action),
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
