import { Router, Response } from 'express';
import type { Request } from '../lib/http.js';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser, optionalAuthMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import { generateSlug, generateUniqueSlug } from '../utils/slug.js';
import { emailService } from '../utils/email.js';
import { broadcastNotification } from '../utils/notifications.js';
import { socketEvents } from '../utils/socket.js';
import { logger } from '../utils/logger.js';
import { submitUrl } from '../utils/indexnow.js';
import { setSharedPublicCache } from '../utils/response.js';
import { getQueryString, parsePaginationNumber } from '../utils/pagination.js';
import { requireUuid } from '../utils/idParams.js';
import { sanitizeHtml } from '../utils/sanitize.js';
import { hashSlotToken } from '../utils/interviewSlotToken.js';
import { selectCohortEmails } from '../utils/interviewReminders.js';

// Interview-cohort visibility: only live interview-pipeline applications grant
// cohort access — rejection hides instantly.
const COHORT_VISIBLE_STATUSES = ['INTERVIEW_SCHEDULED', 'SLOT_BOOKED', 'INTERVIEWED'] as const;

async function getAnnouncementCohortCycles(req: { query?: unknown; headers?: unknown }): Promise<string[]> {
  const cycles = new Set<string>();
  try {
    const token = getQueryString((req.query as Record<string, unknown> | undefined)?.token);
    if (token) {
      const tokenHash = hashSlotToken(token);
      const row = (await prisma.interviewSlotToken.findUnique({
        where: { tokenHash },
        select: { expiresAt: true, applicationId: true },
      })) as unknown as { expiresAt: Date; applicationId: string } | null;
      if (row && row.expiresAt.getTime() > Date.now()) {
        const app = (await prisma.hiringApplication.findUnique({
          where: { id: row.applicationId },
          select: { cycle: true, status: true },
        })) as unknown as { cycle: string; status: string } | null;
        if (app && (COHORT_VISIBLE_STATUSES as readonly string[]).includes(app.status)) {
          cycles.add(app.cycle);
        }
      }
    }
  } catch {
    // Token visibility is best-effort — invalid tokens fall back to anonymous.
  }
  return [...cycles];
}

async function getVisibleCohortCycles(
  req: Parameters<typeof getAuthUser>[0] & { query?: unknown },
): Promise<string[]> {
  const cycles = new Set<string>(await getAnnouncementCohortCycles(req));
  try {
    const authUser = getAuthUser(req);
    if (authUser) {
      const apps = (await prisma.hiringApplication.findMany({
        where: {
          OR: [{ userId: authUser.id }, { email: { equals: authUser.email, mode: 'insensitive' } }],
          status: { in: [...COHORT_VISIBLE_STATUSES] as never },
        },
        select: { cycle: true },
      })) as unknown as Array<{ cycle: string }>;
      for (const a of apps) {
        if (a.cycle) cycles.add(a.cycle);
      }
    }
  } catch {
    // Logged-in lookup is best-effort — fall back to token/anonymous visibility.
  }
  return [...cycles];
}

export const announcementsRouter = Router();

// Max body chars shipped in the LIST response (the detail route returns the full
// body). Sized to comfortably cover the clamped one-line/short previews the list
// consumers render, without shipping up to 20,000-char markdown per card.
const BODY_PREVIEW_CHARS = 300;

const optionalUrl = z.union([z.string().url('Must be a valid URL'), z.literal(''), z.null()]).optional();

const announcementLinkSchema = z.object({
  title: z.string().trim().min(1).max(120).refine((value) => !/[<>"&]/.test(value), {
    message: 'Link title contains invalid characters',
  }),
  url: z.string().url('Link URL must be valid'),
});

const announcementAttachmentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  url: z.string().url('Attachment URL must be valid'),
  type: z.string().trim().max(40).optional(),
});

const createAnnouncementSchema = z.object({
  title: z.string().trim().min(3).max(180),
  body: z.string().trim().min(10).max(20000),
  shortDescription: z.string().trim().max(320).optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  imageUrl: optionalUrl,
  imageGallery: z.array(z.string().url('Image URL must be valid')).max(20).optional().nullable(),
  attachments: z.array(announcementAttachmentSchema).max(20).optional().nullable(),
  links: z.array(announcementLinkSchema).max(20).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  featured: z.boolean().optional(),
  pinned: z.boolean().optional(),
  expiresAt: z.coerce.date().optional().nullable(),
  audience: z.enum(['ALL', 'HIRING_COHORT']).optional().default('ALL'),
  audienceCycle: z.string().trim().min(1).max(60).optional().nullable(),
  notifyCohort: z.boolean().optional(),
});

const updateAnnouncementSchema = createAnnouncementSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required' }
);

const normalizeOptionalText = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toNullableJsonValue = (
  value: unknown
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
};

// Get all announcements (with pinned first, then by date)
// Visibility: anonymous → ALL only; logged-in → ALL + cohorts of cycles where
// they hold live interview-pipeline applications; ?token= grants its cohort.
announcementsRouter.get('/', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { featured } = req.query;
    const limit = parsePaginationNumber(req.query.limit, 20, { min: 1, max: 100 });
    const offset = parsePaginationNumber(req.query.offset, 0, { min: 0, max: 1000000 });

    if (limit === null) {
      return res.status(400).json({ success: false, error: { message: 'limit must be an integer between 1 and 100' } });
    }

    if (offset === null) {
      return res.status(400).json({ success: false, error: { message: 'offset must be a non-negative integer' } });
    }

    if (offset + limit > 10000) {
      return res.status(400).json({
        success: false,
        error: { message: 'offset + limit must be at most 10000' },
      });
    }

    const cohortCycles = await getVisibleCohortCycles(req);
    const audienceFilter: Record<string, unknown> =
      cohortCycles.length > 0
        ? { OR: [{ audience: 'ALL' as never }, { audience: 'HIRING_COHORT' as never, audienceCycle: { in: cohortCycles } }] }
        : { audience: 'ALL' as never };

    const expiryFilter = {
      OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
    };

    const where = {
      AND: [expiryFilter, audienceFilter],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    if (featured === 'true') {
      (where.AND as Array<Record<string, unknown>>).push({ featured: true });
    }

    const listSelect = {
      id: true,
      title: true,
      slug: true,
      body: true,
      shortDescription: true,
      priority: true,
      imageUrl: true,
      imageGallery: true,
      tags: true,
      featured: true,
      pinned: true,
      expiresAt: true,
      audience: true,
      audienceCycle: true,
      createdBy: true,
      createdAt: true,
      creator: { select: { id: true, name: true, avatar: true } },
    } satisfies Prisma.AnnouncementSelect;

    const announcements = await prisma.announcement.findMany({
      where,
      orderBy: [
        { pinned: 'desc' },
        { createdAt: 'desc' }
      ],
      take: limit,
      skip: offset,
      select: listSelect,
    });
    const shouldCount = !(offset === 0 && announcements.length < limit);
    const total = shouldCount ? await prisma.announcement.count({ where }) : announcements.length;

    // `body` can be up to 20,000 chars; the two list consumers only render it as
    // a clamped one-line preview fallback (AnnouncementsPage / DashboardOverview),
    // so ship a truncated preview instead of the full markdown — the detail route
    // (GET /:slug) still returns the complete body. Cuts up to ~20KB/row off this
    // hot, cached public endpoint while preserving the preview fallback exactly.
    const list = announcements.map((a) => ({
      ...a,
      body: a.body && a.body.length > BODY_PREVIEW_CHARS ? `${a.body.slice(0, BODY_PREVIEW_CHARS)}…` : a.body,
    }));

    // Public list — no per-user fields, identical for every visitor.
    setSharedPublicCache(req, res, 60);
    res.json({
      success: true,
      data: list,
      pagination: { total, limit, offset },
    });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch announcements' } });
  }
});

// Get latest announcements (for homepage widget)
announcementsRouter.get('/latest', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const limit = parsePaginationNumber(req.query.limit, 5, { min: 1, max: 50 });

    if (limit === null) {
      return res.status(400).json({ success: false, error: { message: 'limit must be an integer between 1 and 50' } });
    }

    const cohortCycles = await getVisibleCohortCycles(req);
    const audienceFilter: Record<string, unknown> =
      cohortCycles.length > 0
        ? { OR: [{ audience: 'ALL' as never }, { audience: 'HIRING_COHORT' as never, audienceCycle: { in: cohortCycles } }] }
        : { audience: 'ALL' as never };

    const announcements = await prisma.announcement.findMany({
      where: {
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] },
          audienceFilter,
        ],
      } as never,
      orderBy: [
        { pinned: 'desc' },
        { createdAt: 'desc' }
      ],
      take: limit,
      select: {
        id: true,
        title: true,
        slug: true,
        body: true,
        shortDescription: true,
        priority: true,
        imageUrl: true,
        imageGallery: true,
        tags: true,
        featured: true,
        pinned: true,
        createdBy: true,
        createdAt: true,
        creator: { select: { id: true, name: true, avatar: true } },
      },
    });

    const list = announcements.map((a) => ({
      ...a,
      body: a.body && a.body.length > BODY_PREVIEW_CHARS ? `${a.body.slice(0, BODY_PREVIEW_CHARS)}…` : a.body,
    }));

    setSharedPublicCache(req, res, 60);
    res.json({ success: true, data: list });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch announcements' } });
  }
});

// Get announcement by ID or slug (cohort visibility enforced — hidden cohorts 404)
announcementsRouter.get('/:id', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const idOrSlug = req.params.id;
    const includeOptions = { creator: { select: { id: true, name: true, avatar: true } } } as const;
    // Single round-trip (was 2 sequential findUnique). id and slug are both
    // unique and slugs are generated word-strings that can never collide with
    // a UUID, so the OR has exactly one match. Mirrors resolveProblem().
    const announcement = await prisma.announcement.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: includeOptions,
    });

    if (!announcement) {
      return res.status(404).json({ success: false, error: { message: 'Announcement not found' } });
    }

    const row = announcement as unknown as { audience?: string; audienceCycle?: string | null };
    if (row.audience === 'HIRING_COHORT') {
      const cohortCycles = await getVisibleCohortCycles(req);
      if (!row.audienceCycle || !cohortCycles.includes(row.audienceCycle)) {
        return res.status(404).json({ success: false, error: { message: 'Announcement not found' } });
      }
    }

    res.json({ success: true, data: announcement });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch announcement' } });
  }
});

// Create announcement (supports HIRING_COHORT targeting; cohort email is Phase 2)
announcementsRouter.post('/', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const parsed = createAnnouncementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { message: parsed.error.errors[0]?.message || 'Invalid announcement payload' } });
    }
    const data = parsed.data;
    const audience = data.audience ?? 'ALL';
    const audienceCycle = typeof data.audienceCycle === 'string' && data.audienceCycle.trim()
      ? data.audienceCycle.trim()
      : null;

    if (audience === 'HIRING_COHORT' && !audienceCycle) {
      return res.status(400).json({ success: false, error: { message: 'audienceCycle is required when audience is HIRING_COHORT' } });
    }
    if (audience === 'ALL' && audienceCycle) {
      return res.status(400).json({ success: false, error: { message: 'audienceCycle must not be set when audience is ALL' } });
    }

    // Generate slug from title
    const baseSlug = generateSlug(data.title) || 'announcement';
    const existingSlugs = (
      await prisma.announcement.findMany({
        where: { slug: { startsWith: baseSlug } },
        select: { slug: true },
      })
    ).map((announcement) => announcement.slug).filter(Boolean) as string[];
    const slug = generateUniqueSlug(baseSlug, existingSlugs);

    const announcement = await prisma.announcement.create({
      data: {
        title: data.title,
        slug,
        body: sanitizeHtml(data.body),
        shortDescription: normalizeOptionalText(data.shortDescription),
        priority: data.priority || 'MEDIUM',
        imageUrl: normalizeOptionalText(data.imageUrl),
        imageGallery: toNullableJsonValue(data.imageGallery),
        attachments: toNullableJsonValue(data.attachments),
        links: toNullableJsonValue(data.links),
        tags: data.tags || [],
        featured: data.featured || false,
        pinned: data.pinned || false,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        createdBy: authUser.id,
        audience: audience as never,
        audienceCycle,
      },
      include: { creator: { select: { id: true, name: true, avatar: true } } },
    });

    await auditLog(authUser.id, 'CREATE', 'announcement', announcement.id, {
      title: data.title,
      audience,
      audienceCycle,
    });

    // Notify search engines about the new announcement page
    if (announcement.slug) submitUrl(`/announcements/${announcement.slug}`);
    socketEvents.liveInvalidate('announcements');

    if (audience === 'HIRING_COHORT') {
      // In-app bell for the cohort (independent of the email path): every
      // candidate still live in the interview pipeline for this cycle, who has a
      // linked account, gets the update in their notification tray. Fire-and-
      // forget — never blocks or fails the create request.
      void notifyCohortBell({
        cycle: audienceCycle as string,
        title: announcement.title,
        body: announcement.shortDescription || announcement.body?.slice(0, 200) || undefined,
        link: '/dashboard/application',
        announcementId: announcement.id,
        createdById: authUser.id,
      }).catch((err) =>
        logger.error('Cohort bell notification failed', {
          id: announcement.id,
          error: err instanceof Error ? err.message : String(err),
        }),
      );

      // Cohort mail is default-ON (notifyCohort !== false). The post is already
      // published at this point — email failures only shrink the counts, never
      // the 201 ("notified 40/42" semantics).
      if (data.notifyCohort === false) {
        return res.status(201).json({
          success: true,
          data: announcement,
          message: 'Announcement created successfully',
          notifiedCount: 0,
          totalCount: 0,
          failedCount: 0,
        });
      }
      const cohortResult = await sendCohortAnnouncementEmails({
        id: announcement.id,
        title: announcement.title,
        body: announcement.body,
        slug: announcement.slug,
        audienceCycle: audienceCycle as string,
      });
      await auditLog(authUser.id, 'COHORT_NOTIFY', 'announcement', announcement.id, {
        audienceCycle,
        ...cohortResult,
      });
      return res.status(201).json({
        success: true,
        data: announcement,
        message: 'Announcement created successfully',
        ...cohortResult,
      });
    }

    // Send email notification to all users (async, don't wait)
    void sendAnnouncementEmailsAsync(announcement);

    // Dashboard v3: in-app broadcast
    broadcastNotification({
      source: 'AUTO_ANNOUNCEMENT',
      audience: 'ALL',
      category: 'announcement',
      icon: 'megaphone',
      title: announcement.title,
      body: announcement.shortDescription || announcement.body?.slice(0, 200) || undefined,
      link: `/announcements/${announcement.slug || announcement.id}`,
      refEntity: 'announcement',
      refEntityId: announcement.id,
      createdById: authUser.id,
    }).catch((err) => logger.error('broadcastNotification(announcement) failed', { id: announcement.id, error: err instanceof Error ? err.message : String(err) }));

    res.status(201).json({ success: true, data: announcement, message: 'Announcement created successfully' });
  } catch (error) {
    logger.error('Failed to create announcement:', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: { message: 'Failed to create announcement' } });
  }
});

// Helper function to send announcement emails asynchronously
async function sendAnnouncementEmailsAsync(announcement: {
  title: string;
  body: string;
  priority: string;
  slug: string | null;
  shortDescription?: string | null;
  imageUrl?: string | null;
  tags?: string[];
}) {
  try {
    // Get all users with email, excluding NETWORK role users (they should never receive bulk emails)
    const users = await prisma.user.findMany({
      where: { 
        email: { not: '' },
        role: { not: 'NETWORK' },
      },
      select: { email: true },
    });

    const emails = users.map(u => u.email).filter(Boolean) as string[];
    
    if (emails.length === 0) {
      logger.info('No users to notify for announcement');
      return;
    }

    logger.info(`📧 Sending announcement email to ${emails.length} users...`, { title: announcement.title });

    await emailService.sendAnnouncementToAll(
      emails,
      announcement.title,
      announcement.body,
      announcement.priority,
      announcement.slug || '',
      announcement.shortDescription || undefined,
      announcement.imageUrl || undefined,
      announcement.tags || []
    );

    logger.info(`✅ Announcement emails sent to ${emails.length} users`);
  } catch (error) {
    logger.error('Failed to send announcement emails', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Cohort email fan-out for HIRING_COHORT announcements (Phase 2). Targets the
// DISTINCT applicant emails holding live interview-pipeline applications in the
// announcement's cycle — rejection hides instantly, PENDING/SELECTED/REJECTED
// are never mailed. Per-address try/catch with failure logging; a partial
// failure still resolves with real counts ("notified 40/42" semantics) and the
// post itself is unaffected (it was created before this runs).
// Push a hiring-cohort announcement into the notification bell for every
// live-pipeline candidate in the cycle that has a linked account.
async function notifyCohortBell(params: {
  cycle: string;
  title: string;
  body?: string;
  link: string;
  announcementId: string;
  createdById: string;
}): Promise<void> {
  if (!params.cycle) return;
  const rows = (await prisma.hiringApplication.findMany({
    where: {
      cycle: params.cycle,
      status: { in: [...COHORT_VISIBLE_STATUSES] as never },
      userId: { not: null },
    },
    select: { userId: true },
  })) as unknown as Array<{ userId: string | null }>;

  const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is string => Boolean(id)))];
  if (userIds.length === 0) return;

  await broadcastNotification({
    source: 'AUTO_ANNOUNCEMENT',
    audience: 'CUSTOM',
    audienceUserIds: userIds,
    category: 'hiring',
    icon: 'megaphone',
    title: params.title,
    body: params.body,
    link: params.link,
    refEntity: 'announcement',
    refEntityId: params.announcementId,
    createdById: params.createdById,
  });
}

async function sendCohortAnnouncementEmails(announcement: {
  id: string;
  title: string;
  body: string;
  slug: string | null;
  audienceCycle: string;
}): Promise<{ notifiedCount: number; totalCount: number; failedCount: number }> {
  const zero = { notifiedCount: 0, totalCount: 0, failedCount: 0 };
  try {
    const applications = (await prisma.hiringApplication.findMany({
      where: {
        cycle: announcement.audienceCycle,
        status: { in: [...COHORT_VISIBLE_STATUSES] as never },
      },
      select: { email: true, status: true },
    })) as unknown as Array<{ email: string; status: string }>;

    const emails = selectCohortEmails(applications);
    if (emails.length === 0) {
      logger.info('No in-pipeline applicants to notify for hiring cohort announcement', {
        announcementId: announcement.id,
        audienceCycle: announcement.audienceCycle,
      });
      return zero;
    }

    const frontendBase = (process.env.FRONTEND_URL || 'https://codescriet.dev').replace(/\/+$/, '');
    const link = `${frontendBase}/announcements/${announcement.slug || announcement.id}`;
    const subject = `Hiring update · ${announcement.title}`;
    const plainBody = announcement.body
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const html = [
      `<p>Hi,</p>`,
      `<p>There is a new update for hiring cycle <strong>${announcement.audienceCycle}</strong>:</p>`,
      `<h2>${announcement.title}</h2>`,
      `<div>${announcement.body}</div>`,
      `<p><a href="${link}">Read the full announcement</a></p>`,
    ].join('');
    const text = `New update for hiring cycle ${announcement.audienceCycle}: ${announcement.title}\n\n${plainBody}\n\nRead more: ${link}`;

    let notifiedCount = 0;
    let failedCount = 0;
    for (const email of emails) {
      try {
        const ok = await emailService.send({ to: email, subject, html, text, category: 'recruitment' });
        if (ok) notifiedCount += 1;
        else {
          failedCount += 1;
          logger.error('Cohort announcement email send returned false', {
            announcementId: announcement.id,
            email,
          });
        }
      } catch (error) {
        failedCount += 1;
        logger.error('Cohort announcement email send failed', {
          announcementId: announcement.id,
          email,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Cohort announcement emails complete', {
      announcementId: announcement.id,
      notifiedCount,
      totalCount: emails.length,
      failedCount,
    });
    return { notifiedCount, totalCount: emails.length, failedCount };
  } catch (error) {
    logger.error('Failed to send cohort announcement emails', {
      announcementId: announcement.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return zero;
  }
}

// Shared audience validation: audienceCycle required iff HIRING_COHORT.
function validateAudiencePair(
  audience: 'ALL' | 'HIRING_COHORT' | undefined,
  audienceCycle: string | null | undefined,
  current: { audience?: string; audienceCycle?: string | null },
): { audience: 'ALL' | 'HIRING_COHORT'; audienceCycle: string | null } | { error: string } {
  const nextAudience = (audience ?? current.audience ?? 'ALL') as 'ALL' | 'HIRING_COHORT';
  const rawCycle = audienceCycle !== undefined ? audienceCycle : (current.audienceCycle ?? null);
  const nextCycle =
    typeof rawCycle === 'string' && rawCycle.trim() ? rawCycle.trim() : null;
  if (nextAudience === 'HIRING_COHORT' && !nextCycle) {
    return { error: 'audienceCycle is required when audience is HIRING_COHORT' };
  }
  if (nextAudience === 'ALL' && nextCycle) {
    return { error: 'audienceCycle must not be set when audience is ALL' };
  }
  return { audience: nextAudience, audienceCycle: nextCycle };
}

async function handleAnnouncementUpdate(req: Request, res: Response) {
  if (!requireUuid(res, req.params.id, 'announcement ID')) {
    return;
  }
  const authUser = getAuthUser(req)!;
  const parsed = updateAnnouncementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: { message: parsed.error.errors[0]?.message || 'Invalid announcement payload' } });
  }
  const data = parsed.data;

  const current = (await prisma.announcement.findUnique({
    where: { id: req.params.id },
    select: { audience: true, audienceCycle: true },
  })) as unknown as { audience: string; audienceCycle: string | null } | null;
  if (!current) {
    return res.status(404).json({ success: false, error: { message: 'Announcement not found' } });
  }

  const audienceResult = validateAudiencePair(
    data.audience as 'ALL' | 'HIRING_COHORT' | undefined,
    data.audienceCycle as string | null | undefined,
    current,
  );
  if ('error' in audienceResult) {
    return res.status(400).json({ success: false, error: { message: audienceResult.error } });
  }

  // If title changed, regenerate slug
  let slugUpdate = {};
  if (data.title) {
    const baseSlug = generateSlug(data.title) || 'announcement';
    const existingSlugs = (
      await prisma.announcement.findMany({
        where: {
          id: { not: req.params.id },
          slug: { startsWith: baseSlug },
        },
        select: { slug: true },
      })
    ).map((announcement) => announcement.slug).filter(Boolean) as string[];
    const newSlug = generateUniqueSlug(baseSlug, existingSlugs);
    slugUpdate = { slug: newSlug };
  }

  const announcement = await prisma.announcement.update({
    where: { id: req.params.id },
    data: {
      ...(data.title && { title: data.title }),
      ...slugUpdate,
      ...(data.body !== undefined && { body: sanitizeHtml(data.body) }),
      ...(data.shortDescription !== undefined && { shortDescription: normalizeOptionalText(data.shortDescription) }),
      ...(data.priority && { priority: data.priority }),
      ...(data.imageUrl !== undefined && { imageUrl: normalizeOptionalText(data.imageUrl) }),
      ...(data.imageGallery !== undefined && { imageGallery: toNullableJsonValue(data.imageGallery) }),
      ...(data.attachments !== undefined && { attachments: toNullableJsonValue(data.attachments) }),
      ...(data.links !== undefined && { links: toNullableJsonValue(data.links) }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.featured !== undefined && { featured: data.featured }),
      ...(data.pinned !== undefined && { pinned: data.pinned }),
      ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt || null }),
      audience: audienceResult.audience as never,
      audienceCycle: audienceResult.audienceCycle,
    },
    include: { creator: { select: { id: true, name: true, avatar: true } } },
  });

  await auditLog(authUser.id, 'UPDATE', 'announcement', announcement.id, {
    audience: audienceResult.audience,
    audienceCycle: audienceResult.audienceCycle,
  });

  // Notify search engines about the updated announcement page
  if (announcement.slug) submitUrl(`/announcements/${announcement.slug}`);

  // Narrowing audience never sends mail; widening to ALL does not retro-send
  // either (updates never mail — only creates do).
  res.json({ success: true, data: announcement, message: 'Announcement updated successfully' });
}

// Update announcement
announcementsRouter.put('/:id', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    await handleAnnouncementUpdate(req, res);
  } catch {
    res.status(500).json({ success: false, error: { message: 'Failed to update announcement' } });
  }
});

// Audience may widen/narrow via PATCH; narrowing never sends mail (updates never mail).
announcementsRouter.patch('/:id', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    await handleAnnouncementUpdate(req, res);
  } catch {
    res.status(500).json({ success: false, error: { message: 'Failed to update announcement' } });
  }
});

// Delete announcement
announcementsRouter.delete('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    if (!requireUuid(res, req.params.id, 'announcement ID')) {
      return;
    }
    const authUser = getAuthUser(req)!;
    await prisma.announcement.delete({ where: { id: req.params.id } });
    await auditLog(authUser.id, 'DELETE', 'announcement', req.params.id);
    res.json({ success: true, message: 'Announcement deleted successfully' });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Failed to delete announcement' } });
  }
});
