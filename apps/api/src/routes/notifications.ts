// Dashboard v2 — notification bell aggregate.
// Groups four real DB sources into a single unified feed for the topbar bell menu.
// Read state is a single `User.notificationsReadAt` timestamp — items older than
// that cutoff are 'read'. This avoids an unbounded per-notification join table
// on the free-tier 512 MB box.

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ApiResponse } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { sanitizeUrl } from '../utils/sanitize.js';
import { auditLog } from '../utils/audit.js';
import { requireUuid } from '../utils/idParams.js';
import { broadcastNotification } from '../utils/notifications.js';

export const notificationsRouter = Router();

type NotifGroup = 'invitations' | 'quiz' | 'certificates' | 'system' | 'broadcasts';

interface NotifItem {
  id: string;
  group: NotifGroup;
  icon: string;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  link?: string;
}

notificationsRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  const auth = getAuthUser(req)!;

  try {
    // `me` (read cutoff) and `myNetwork` (audience derivation) are independent —
    // fetch both in one round-trip before building the audience filter. Shaves a
    // sequential hop off an endpoint NotifMenu polls every 30s while open.
    const [me, myNetwork] = await Promise.all([
      prisma.user.findUnique({
        where: { id: auth.id },
        select: { notificationsReadAt: true },
      }),
      prisma.networkProfile.findUnique({
        where: { userId: auth.id },
        select: { connectionType: true, status: true },
      }),
    ]);
    const readCutoff = me?.notificationsReadAt ?? new Date(0);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // last 30 days

    // Audience-targeted broadcast feed. We fetch a generous window and then filter
    // in code because the audience logic depends on the user's role / network status.
    const audienceClauses: Prisma.NotificationFeedWhereInput[] = [
      { audience: 'ALL' },
    ];
    if (auth.role === 'NETWORK') audienceClauses.push({ audience: 'NETWORK' });
    if (auth.role !== 'NETWORK') audienceClauses.push({ audience: 'USERS' });
    if (auth.role === 'ADMIN' || auth.role === 'PRESIDENT') audienceClauses.push({ audience: 'ADMIN' });
    if (['CORE_MEMBER', 'ADMIN', 'PRESIDENT'].includes(auth.role)) audienceClauses.push({ audience: 'CORE_MEMBER' });
    // ALUMNI + NETWORK_AND_ALUMNI: derive from network profile presence
    if (myNetwork?.status === 'VERIFIED') {
      audienceClauses.push({ audience: 'NETWORK_AND_ALUMNI' });
      if (myNetwork.connectionType === 'ALUMNI') {
        audienceClauses.push({ audience: 'ALUMNI' });
      }
    }
    // CUSTOM: filter on audience_user_ids JSON array or audience_roles JSON array.
    // Postgres JSONB '?' operator works via Prisma `path` + `array_contains` but it's awkward;
    // we hand-roll a where with raw query helpers via `Prisma.sql`. Simpler: fetch up to 50
    // CUSTOM rows and filter in JS.
    const [pendingInvites, recentCerts, recentQuizzes, recentAudits, recentBroadcasts, customBroadcasts] = await Promise.all([
      // Invitations — pending only, plus any recently responded
      prisma.eventInvitation.findMany({
        where: {
          inviteeUserId: auth.id,
          OR: [
            { status: 'PENDING' },
            { respondedAt: { gte: since } },
          ],
        },
        select: {
          id: true,
          status: true,
          role: true,
          invitedAt: true,
          respondedAt: true,
          invitedBy: { select: { name: true } },
          event: { select: { title: true, slug: true, startDate: true } },
        },
        orderBy: { invitedAt: 'desc' },
        take: 10,
      }),
      // Certificates issued to me in the last 30d
      prisma.certificate.findMany({
        where: { recipientId: auth.id, issuedAt: { gte: since } },
        select: { id: true, certId: true, type: true, eventName: true, issuedAt: true },
        orderBy: { issuedAt: 'desc' },
        take: 10,
      }),
      // Quiz sessions I joined or that are currently joinable — tagged as 'starting'
      prisma.quiz.findMany({
        where: {
          status: { in: ['WAITING', 'ACTIVE'] },
          updatedAt: { gte: since },
        },
        select: { id: true, title: true, pin: true, status: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      // System events: admin actions that targeted ME (entity='user', entityId=me).
      // Block/unblock entries live under entity='user_block' with target in metadata; skipped for now to avoid metadata querying.
      prisma.auditLog.findMany({
        where: {
          entity: 'user',
          entityId: auth.id,
          action: { in: ['FORCE_LOGOUT', 'PASSWORD_RESET_INITIATED', 'UPDATE_ROLE', 'RESTORE_USER', 'SOFT_DELETE'] },
          timestamp: { gte: since },
        },
        select: { id: true, action: true, entity: true, timestamp: true, metadata: true },
        orderBy: { timestamp: 'desc' },
        take: 5,
      }),
      // Audience-matched broadcasts (ALL/USERS/NETWORK/ALUMNI/NETWORK_AND_ALUMNI/ADMIN/CORE_MEMBER)
      prisma.notificationFeed.findMany({
        where: {
          AND: [
            { OR: audienceClauses },
            { createdAt: { gte: since } },
            { OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] },
          ],
        },
        select: { id: true, source: true, category: true, icon: true, title: true, body: true, link: true, createdAt: true, expiresAt: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      // CUSTOM-audience rows that may target this specific user (handle in JS).
      prisma.notificationFeed.findMany({
        where: { audience: 'CUSTOM', createdAt: { gte: since } },
        select: { id: true, source: true, category: true, icon: true, title: true, body: true, link: true, createdAt: true, expiresAt: true, audienceUserIds: true, audienceRoles: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    const items: NotifItem[] = [];

    for (const inv of pendingInvites) {
      const t = inv.respondedAt ?? inv.invitedAt;
      const isResponded = inv.status !== 'PENDING';
      items.push({
        id: `inv-${inv.id}`,
        group: 'invitations',
        icon: 'inbox',
        title: isResponded
          ? `Invitation ${inv.status.toLowerCase()}: ${inv.role}`
          : `${inv.invitedBy?.name ?? 'Someone'} invited you as ${inv.role}`,
        body: inv.event?.title ?? '',
        timestamp: t.toISOString(),
        read: t < readCutoff,
        link: `/dashboard/invitations/${inv.id}`,
      });
    }

    for (const c of recentCerts) {
      items.push({
        id: `cert-${c.id}`,
        group: 'certificates',
        icon: 'award',
        title: `Certificate issued: ${c.type}`,
        body: `${c.eventName} · ${c.certId}`,
        timestamp: c.issuedAt.toISOString(),
        read: c.issuedAt < readCutoff,
        link: `/verify/${c.certId}`,
      });
    }

    for (const q of recentQuizzes) {
      items.push({
        id: `quiz-${q.id}`,
        group: 'quiz',
        icon: 'zap',
        title: q.status === 'ACTIVE' ? `${q.title} is live` : `${q.title} — waiting for players`,
        body: q.pin ? `PIN ${q.pin}` : 'Join now',
        timestamp: q.updatedAt.toISOString(),
        read: q.updatedAt < readCutoff,
        link: '/quiz/join',
      });
    }

    for (const a of recentAudits) {
      const metaTitle = humanizeAuditAction(a.action);
      items.push({
        id: `audit-${a.id}`,
        group: 'system',
        icon: 'shield',
        title: metaTitle,
        body: '',
        timestamp: a.timestamp.toISOString(),
        read: a.timestamp < readCutoff,
      });
    }

    // Audience-matched broadcasts
    for (const b of recentBroadcasts) {
      items.push({
        id: `feed-${b.id}`,
        group: 'broadcasts',
        icon: b.icon || 'bell',
        title: b.title,
        body: b.body ?? '',
        timestamp: b.createdAt.toISOString(),
        read: b.createdAt < readCutoff,
        link: b.link ?? undefined,
      });
    }
    // CUSTOM-audience matches: targets us if our id is in audienceUserIds OR our role is in audienceRoles
    for (const b of customBroadcasts) {
      const userIds = Array.isArray(b.audienceUserIds) ? (b.audienceUserIds as unknown as string[]) : [];
      const roles = Array.isArray(b.audienceRoles) ? (b.audienceRoles as unknown as string[]) : [];
      if (!userIds.includes(auth.id) && !roles.includes(auth.role)) continue;
      if (b.expiresAt && b.expiresAt.getTime() < Date.now()) continue;
      items.push({
        id: `feed-${b.id}`,
        group: 'broadcasts',
        icon: b.icon || 'bell',
        title: b.title,
        body: b.body ?? '',
        timestamp: b.createdAt.toISOString(),
        read: b.createdAt < readCutoff,
        link: b.link ?? undefined,
      });
    }

    // Sort newest first
    items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const groups: Record<NotifGroup, NotifItem[]> = {
      invitations: items.filter(i => i.group === 'invitations'),
      quiz: items.filter(i => i.group === 'quiz'),
      certificates: items.filter(i => i.group === 'certificates'),
      system: items.filter(i => i.group === 'system'),
      broadcasts: items.filter(i => i.group === 'broadcasts'),
    };
    const unreadCount = items.filter(i => !i.read).length;

    return ApiResponse.success(res, { unreadCount, total: items.length, groups, readCutoff: readCutoff.toISOString() });
  } catch (error) {
    logger.error('Failed to load notifications', { userId: auth.id, error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to load notifications');
  }
});

const markReadSchema = z.object({
  // Cutoff in ISO string; defaults to "now" if omitted. We never persist per-item read state.
  at: z.string().datetime().optional(),
});

notificationsRouter.post('/mark-read', authMiddleware, async (req: Request, res: Response) => {
  const auth = getAuthUser(req)!;
  const parsed = markReadSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return ApiResponse.validationError(res, parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })));
  }
  const cutoff = parsed.data.at ? new Date(parsed.data.at) : new Date();
  try {
    await prisma.user.update({
      where: { id: auth.id },
      data: { notificationsReadAt: cutoff },
    });
    return ApiResponse.success(res, { readCutoff: cutoff.toISOString() });
  } catch (error) {
    logger.error('Failed to mark notifications read', { userId: auth.id, error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to mark notifications read');
  }
});

function humanizeAuditAction(action: string): string {
  const map: Record<string, string> = {
    FORCE_LOGOUT: 'You were signed out from all devices',
    PASSWORD_RESET_INITIATED: 'A password reset link was sent to your email',
    UPDATE_ROLE: 'Your role was updated',
    RESTORE_USER: 'Your account was restored',
    SOFT_DELETE: 'Your account was deactivated',
  };
  return map[action] ?? action.replace(/_/g, ' ').toLowerCase();
}

// ─── Admin: send a custom broadcast notification ──────────────────────────
const composeSchema = z.object({
  audience: z.enum(['ALL', 'USERS', 'NETWORK', 'ALUMNI', 'NETWORK_AND_ALUMNI', 'ADMIN', 'CORE_MEMBER', 'CUSTOM']),
  audienceRoles: z.array(z.string()).optional(),
  audienceUserIds: z.array(z.string().uuid()).optional(),
  category: z.string().trim().min(1).max(40).default('admin'),
  icon: z.string().trim().min(1).max(20).default('bell'),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(2000).optional(),
  link: z.string().trim().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
});

notificationsRouter.post('/compose', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const auth = getAuthUser(req)!;
  const parsed = composeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return ApiResponse.validationError(res, parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })));
  }
  const p = parsed.data;
  // Defence-in-depth: only allow http(s)/mailto/tel/relative links into the feed.
  // The bell opens absolute links in a new tab, so reject javascript:/data:/`//host`
  // at the source rather than relying on the renderer.
  let safeLink: string | undefined;
  if (p.link) {
    safeLink = sanitizeUrl(p.link);
    if (!safeLink) {
      return ApiResponse.validationError(res, [{ field: 'link', message: 'link must be a valid http(s), mailto, tel, or site-relative URL' }]);
    }
  }
  try {
    const created = await broadcastNotification({
      source: 'ADMIN',
      audience: p.audience,
      audienceRoles: p.audienceRoles,
      audienceUserIds: p.audienceUserIds,
      category: p.category,
      icon: p.icon,
      title: p.title,
      body: p.body,
      link: safeLink,
      expiresAt: p.expiresAt ? new Date(p.expiresAt) : undefined,
      createdById: auth.id,
    });
    await auditLog(auth.id, 'NOTIFICATION_BROADCAST', 'notification', created.id, {
      audience: p.audience,
      audienceUserIds: p.audienceUserIds?.length ?? 0,
      title: p.title,
    });
    return ApiResponse.success(res, { id: created.id });
  } catch (error) {
    logger.error('Failed to compose notification', { userId: auth.id, error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to send notification');
  }
});

// List admin-authored broadcasts (history view).
notificationsRouter.get('/admin/broadcasts', authMiddleware, requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.notificationFeed.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { createdBy: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    return ApiResponse.success(res, rows.map(r => ({
      id: r.id,
      source: r.source,
      audience: r.audience,
      audienceRoles: r.audienceRoles,
      audienceUserIds: r.audienceUserIds,
      category: r.category,
      icon: r.icon,
      title: r.title,
      body: r.body,
      link: r.link,
      refEntity: r.refEntity,
      refEntityId: r.refEntityId,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
      createdBy: r.createdBy,
    })));
  } catch (error) {
    logger.error('Failed to list broadcasts', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to load broadcasts');
  }
});

notificationsRouter.delete('/admin/broadcasts/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const auth = getAuthUser(req)!;
  try {
    if (!requireUuid(res, req.params.id, 'notification ID')) {
      return;
    }
    await prisma.notificationFeed.delete({ where: { id: req.params.id } });
    await auditLog(auth.id, 'NOTIFICATION_DELETE', 'notification', req.params.id);
    return ApiResponse.success(res, { id: req.params.id });
  } catch (error) {
    logger.error('Failed to delete broadcast', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Failed to delete');
  }
});
