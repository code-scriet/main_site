// S-09 — curated problem sheets ("topic ladders").
//
// Mounted at /api/problems/sheets BEFORE the problems router so "sheets" is never
// captured by the problems `/:idOrSlug` catch-all. Per-member progress is computed
// live from problem_submissions (PRACTICE-context ACCEPTED) — no per-user state,
// so this stays free-tier safe. Authoring mirrors problem authoring: create =
// CORE_MEMBER+ (non-admins forced isPublished:false), update/delete = ADMIN.

import { Router, Response } from 'express';
import type { Request } from '../lib/http.js';
import { z } from 'zod';
import { prisma, withRetry } from '../lib/prisma.js';
import { optionalAuthMiddleware, authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ApiResponse } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { auditLog } from '../utils/audit.js';
import { isAdminUser } from '../utils/problemsCore.js';
import { getCachedSettings } from '../utils/settingsCache.js';
import { requireUuid } from '../utils/idParams.js';
import { generateSlug, generateUniqueSlug } from '../utils/slug.js';

export const problemSheetsRouter = Router();

problemSheetsRouter.use(optionalAuthMiddleware);

// Feature gate (same as the problems router): non-admins 404 when problems are off.
problemSheetsRouter.use(async (req, res, next) => {
  try {
    const user = getAuthUser(req);
    if (isAdminUser(user)) return next();
    const settings = await getCachedSettings();
    if (settings?.problemsEnabled !== true) {
      return ApiResponse.notFound(res, 'Problems are not available');
    }
    return next();
  } catch {
    return next();
  }
});

const sheetSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(4000).optional().nullable(),
  isPublished: z.boolean().optional(),
  problemIds: z.array(z.string().uuid()).max(200).default([]),
});

const errMsg = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Per-user solved set for a list of problemIds (PRACTICE-context ACCEPTED).
async function solvedProblemIds(userId: string | undefined, problemIds: string[]): Promise<Set<string>> {
  if (!userId || problemIds.length === 0) return new Set();
  const rows = await prisma.problemSubmission.findMany({
    where: { userId, problemId: { in: problemIds }, contextType: 'PRACTICE', verdict: 'ACCEPTED' },
    select: { problemId: true },
  });
  return new Set(rows.map((r) => r.problemId));
}

// GET /api/problems/sheets — list sheets (published for everyone; all for admins).
problemSheetsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const admin = isAdminUser(user);
    const sheets = await withRetry(() => prisma.problemSheet.findMany({
      where: admin ? {} : { isPublished: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, slug: true, title: true, description: true, isPublished: true,
        createdAt: true,
        items: { select: { problemId: true } },
      },
    }));
    const allProblemIds = [...new Set(sheets.flatMap((s) => s.items.map((i) => i.problemId)))];
    const solved = await solvedProblemIds(user?.id, allProblemIds);
    const data = sheets.map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      description: s.description,
      isPublished: s.isPublished,
      createdAt: s.createdAt.toISOString(),
      total: s.items.length,
      solved: s.items.filter((i) => solved.has(i.problemId)).length,
    }));
    return ApiResponse.success(res, { sheets: data });
  } catch (error) {
    logger.error('Failed to list problem sheets', { error: errMsg(error) });
    return ApiResponse.internal(res, 'Failed to list sheets');
  }
});

// GET /api/problems/sheets/:slug — detail with ordered items + my verdicts.
problemSheetsRouter.get('/:slug', async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const admin = isAdminUser(user);
    const sheet = await prisma.problemSheet.findUnique({
      where: { slug: req.params.slug },
      select: {
        id: true, slug: true, title: true, description: true, isPublished: true, createdAt: true,
        items: {
          orderBy: { order: 'asc' },
          select: {
            order: true,
            problem: { select: { id: true, slug: true, title: true, difficulty: true, tags: true, isPublished: true } },
          },
        },
      },
    });
    if (!sheet || (!sheet.isPublished && !admin)) return ApiResponse.notFound(res, 'Sheet not found');
    // Hide unpublished problems from non-admins.
    const items = sheet.items.filter((i) => admin || i.problem.isPublished);
    const problemIds = items.map((i) => i.problem.id);
    const solved = await solvedProblemIds(user?.id, problemIds);
    return ApiResponse.success(res, {
      sheet: {
        id: sheet.id,
        slug: sheet.slug,
        title: sheet.title,
        description: sheet.description,
        isPublished: sheet.isPublished,
        createdAt: sheet.createdAt.toISOString(),
        total: items.length,
        solved: items.filter((i) => solved.has(i.problem.id)).length,
        items: items.map((i) => ({
          order: i.order,
          id: i.problem.id,
          slug: i.problem.slug,
          title: i.problem.title,
          difficulty: i.problem.difficulty,
          tags: i.problem.tags,
          solved: solved.has(i.problem.id),
        })),
      },
    });
  } catch (error) {
    logger.error('Failed to fetch problem sheet', { slug: req.params.slug, error: errMsg(error) });
    return ApiResponse.internal(res, 'Failed to fetch sheet');
  }
});

// POST /api/problems/sheets — CORE_MEMBER+ create (non-admins forced unpublished).
problemSheetsRouter.post('/', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req)!;
    const parsed = sheetSchema.safeParse(req.body);
    if (!parsed.success) return ApiResponse.badRequest(res, parsed.error.errors[0]?.message ?? 'Invalid sheet');
    const { title, description } = parsed.data;
    const uniqueIds = [...new Set(parsed.data.problemIds)];
    const isPublished = isAdminUser(user) ? (parsed.data.isPublished ?? false) : false;

    // Validate every referenced problem exists (clean 400 instead of an FK 500).
    if (uniqueIds.length > 0) {
      const found = await prisma.problem.count({ where: { id: { in: uniqueIds } } });
      if (found !== uniqueIds.length) return ApiResponse.badRequest(res, 'One or more problems do not exist');
    }

    const baseSlug = generateSlug(title) || 'sheet';
    const existing = (await prisma.problemSheet.findMany({
      where: { slug: { startsWith: baseSlug } },
      select: { slug: true },
    })).map((s) => s.slug);
    const slug = generateUniqueSlug(baseSlug, existing);

    const sheet = await prisma.problemSheet.create({
      data: {
        slug,
        title,
        description: description ?? null,
        isPublished,
        createdBy: user.id,
        items: { create: uniqueIds.map((pid, idx) => ({ problemId: pid, order: idx })) },
      },
      select: { id: true, slug: true },
    });
    await auditLog(user.id, 'CREATE', 'problemSheet', sheet.id, { title, items: uniqueIds.length });
    return ApiResponse.created(res, { sheet }, 'Sheet created');
  } catch (error) {
    logger.error('Failed to create problem sheet', { error: errMsg(error) });
    return ApiResponse.internal(res, 'Failed to create sheet');
  }
});

// PUT /api/problems/sheets/:id — admin update (problemIds, when given, replace items).
problemSheetsRouter.put('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    if (!requireUuid(res, req.params.id, 'sheet ID')) return;
    const admin = getAuthUser(req)!;
    const parsed = sheetSchema.partial().safeParse(req.body);
    if (!parsed.success) return ApiResponse.badRequest(res, parsed.error.errors[0]?.message ?? 'Invalid sheet');
    const data = parsed.data;

    const existing = await prisma.problemSheet.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) return ApiResponse.notFound(res, 'Sheet not found');

    let itemsUpdate: { deleteMany: Record<string, never>; create: Array<{ problemId: string; order: number }> } | undefined;
    if (data.problemIds !== undefined) {
      const uniqueIds = [...new Set(data.problemIds)];
      if (uniqueIds.length > 0) {
        const found = await prisma.problem.count({ where: { id: { in: uniqueIds } } });
        if (found !== uniqueIds.length) return ApiResponse.badRequest(res, 'One or more problems do not exist');
      }
      itemsUpdate = { deleteMany: {}, create: uniqueIds.map((pid, idx) => ({ problemId: pid, order: idx })) };
    }

    const sheet = await prisma.problemSheet.update({
      where: { id: req.params.id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description ?? null } : {}),
        ...(data.isPublished !== undefined ? { isPublished: data.isPublished } : {}),
        ...(itemsUpdate ? { items: itemsUpdate } : {}),
      },
      select: { id: true, slug: true },
    });
    await auditLog(admin.id, 'UPDATE', 'problemSheet', sheet.id);
    return ApiResponse.success(res, { sheet }, 'Sheet updated');
  } catch (error) {
    logger.error('Failed to update problem sheet', { id: req.params.id, error: errMsg(error) });
    return ApiResponse.internal(res, 'Failed to update sheet');
  }
});

// DELETE /api/problems/sheets/:id — admin (items cascade).
problemSheetsRouter.delete('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    if (!requireUuid(res, req.params.id, 'sheet ID')) return;
    const admin = getAuthUser(req)!;
    const existing = await prisma.problemSheet.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!existing) return ApiResponse.notFound(res, 'Sheet not found');
    await prisma.problemSheet.delete({ where: { id: req.params.id } });
    await auditLog(admin.id, 'DELETE', 'problemSheet', req.params.id);
    return ApiResponse.success(res, { id: req.params.id }, 'Sheet deleted');
  } catch (error) {
    logger.error('Failed to delete problem sheet', { id: req.params.id, error: errMsg(error) });
    return ApiResponse.internal(res, 'Failed to delete sheet');
  }
});
