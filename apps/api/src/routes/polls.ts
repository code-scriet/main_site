import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma, withRetry } from '../lib/prisma.js';
import { authMiddleware, getAuthUser, optionalAuthMiddleware } from '../middleware/auth.js';
import { hasPermission, requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import { emailService } from '../utils/email.js';
import { logger } from '../utils/logger.js';
import { parsePaginationNumber } from '../utils/pagination.js';
import { ApiResponse } from '../utils/response.js';
import { generateSlug, generateUniqueSlug } from '../utils/slug.js';
import { requireUuid } from '../utils/idParams.js';
import { sanitizeText } from '../utils/sanitize.js';

export const pollsRouter = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://codescriet.dev').replace(/\/+$/, '');
const IMPOSSIBLE_USER_ID = '__anonymous__';
const IST_LOCALE = 'en-IN';
const IST_TIMEZONE = 'Asia/Kolkata';

const createPollSchema = z.object({
  question: z.string().trim().min(5).max(500),
  description: z.string().trim().max(4000).optional().nullable(),
  options: z.array(z.string().trim().min(1).max(240)).min(0).max(12),
  allowMultipleChoices: z.boolean().optional(),
  allowVoteChange: z.boolean().optional(),
  isAnonymous: z.boolean().optional(),
  deadline: z.coerce.date().optional().nullable(),
  isPublished: z.boolean().optional(),
});

const updatePollSchema = createPollSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });

const voteSchema = z.object({
  optionIds: z.array(z.string().trim().min(1)).min(1).max(12),
});

const feedbackSchema = z.object({
  message: z.string().trim().min(3).max(2000),
});

const adminListFiltersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(['ALL', 'OPEN', 'CLOSED', 'DRAFT']).optional(),
  anonymity: z.enum(['ALL', 'ANONYMOUS', 'NAMED']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
});

const buildPublicPollInclude = (authUserId: string | null) =>
  ({
    creator: { select: { id: true, name: true, avatar: true } },
    options: {
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        text: true,
        sortOrder: true,
        _count: { select: { selections: true } },
      },
    },
    votes: {
      where: { userId: authUserId ?? IMPOSSIBLE_USER_ID },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        selections: { select: { optionId: true } },
      },
    },
    feedbackEntries: {
      where: { userId: authUserId ?? IMPOSSIBLE_USER_ID },
      select: {
        id: true,
        message: true,
        createdAt: true,
        updatedAt: true,
      },
    },
    _count: {
      select: {
        votes: true,
        feedbackEntries: true,
      },
    },
  }) satisfies Prisma.PollInclude;

type PublicPollRecord = Prisma.PollGetPayload<{
  include: ReturnType<typeof buildPublicPollInclude>;
}>;

const adminDetailInclude = {
  creator: { select: { id: true, name: true, email: true, avatar: true } },
  options: {
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      text: true,
      sortOrder: true,
      _count: { select: { selections: true } },
    },
  },
  votes: {
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          role: true,
        },
      },
      selections: {
        select: {
          optionId: true,
          option: {
            select: {
              id: true,
              text: true,
            },
          },
        },
      },
    },
  },
  feedbackEntries: {
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      message: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          role: true,
        },
      },
    },
  },
  _count: {
    select: {
      votes: true,
      feedbackEntries: true,
    },
  },
} satisfies Prisma.PollInclude;

type AdminPollDetailRecord = Prisma.PollGetPayload<{ include: typeof adminDetailInclude }>;

function toPercentage(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function isPollClosed(deadline: Date | null | undefined): boolean {
  return Boolean(deadline && deadline.getTime() < Date.now());
}

function getPollShareUrl(slug: string): string {
  return `${FRONTEND_URL}/polls/${slug}`;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = sanitizeText(value).trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionTexts(options: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const option of options) {
    const text = sanitizeText(option).trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(text);
  }

  return normalized;
}

function serializePublicPoll(poll: PublicPollRecord) {
  const totalVotes = poll._count.votes;
  const currentVote = poll.votes[0] ?? null;
  const currentFeedback = poll.feedbackEntries[0] ?? null;

  return {
    id: poll.id,
    question: poll.question,
    description: poll.description,
    slug: poll.slug,
    shareUrl: getPollShareUrl(poll.slug),
    allowMultipleChoices: poll.allowMultipleChoices,
    allowVoteChange: poll.allowVoteChange,
    isAnonymous: poll.isAnonymous,
    isPublished: poll.isPublished,
    deadline: poll.deadline?.toISOString() ?? null,
    createdAt: poll.createdAt.toISOString(),
    updatedAt: poll.updatedAt.toISOString(),
    isClosed: isPollClosed(poll.deadline),
    totalVotes,
    totalFeedback: poll._count.feedbackEntries,
    creator: poll.creator,
    options: poll.options.map((option) => ({
      id: option.id,
      text: option.text,
      sortOrder: option.sortOrder,
      voteCount: option._count.selections,
      percentage: toPercentage(option._count.selections, totalVotes),
    })),
    currentUserVote: currentVote
      ? {
          id: currentVote.id,
          optionIds: currentVote.selections.map((selection) => selection.optionId),
          createdAt: currentVote.createdAt.toISOString(),
          updatedAt: currentVote.updatedAt.toISOString(),
        }
      : null,
    currentUserFeedback: currentFeedback
      ? {
          id: currentFeedback.id,
          message: currentFeedback.message,
          createdAt: currentFeedback.createdAt.toISOString(),
          updatedAt: currentFeedback.updatedAt.toISOString(),
        }
      : null,
  };
}

function serializeAdminPollDetail(poll: AdminPollDetailRecord) {
  const totalVotes = poll._count.votes;

  return {
    id: poll.id,
    question: poll.question,
    description: poll.description,
    slug: poll.slug,
    shareUrl: getPollShareUrl(poll.slug),
    allowMultipleChoices: poll.allowMultipleChoices,
    allowVoteChange: poll.allowVoteChange,
    isAnonymous: poll.isAnonymous,
    isPublished: poll.isPublished,
    deadline: poll.deadline?.toISOString() ?? null,
    createdAt: poll.createdAt.toISOString(),
    updatedAt: poll.updatedAt.toISOString(),
    isClosed: isPollClosed(poll.deadline),
    totalVotes,
    totalFeedback: poll._count.feedbackEntries,
    creator: {
      id: poll.creator.id,
      name: poll.creator.name,
      email: poll.creator.email,
      avatar: poll.creator.avatar,
    },
    options: poll.options.map((option) => ({
      id: option.id,
      text: option.text,
      sortOrder: option.sortOrder,
      voteCount: option._count.selections,
      percentage: toPercentage(option._count.selections, totalVotes),
    })),
    responses: poll.isAnonymous
      ? []
      : poll.votes.map((vote) => ({
          id: vote.id,
          createdAt: vote.createdAt.toISOString(),
          updatedAt: vote.updatedAt.toISOString(),
          user: vote.user,
          optionIds: vote.selections.map((selection) => selection.optionId),
          optionLabels: vote.selections.map((selection) => selection.option.text),
        })),
    feedback: poll.feedbackEntries.map((entry) => ({
      id: entry.id,
      message: entry.message,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      user: entry.user,
    })),
  };
}

function ensurePollParticipant(req: Request, res: Response) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    ApiResponse.unauthorized(res);
    return null;
  }
  if (authUser.role === 'NETWORK') {
    ApiResponse.forbidden(res, 'Network accounts cannot participate in club polls');
    return null;
  }
  return authUser;
}

async function generatePollSlug(question: string, excludeId?: string): Promise<string> {
  const baseSlug = generateSlug(question) || 'poll';
  const existing = await prisma.poll.findMany({
    where: {
      slug: { startsWith: baseSlug },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { slug: true },
  });
  return generateUniqueSlug(
    baseSlug,
    existing.map((poll) => poll.slug).filter(Boolean),
  );
}

async function findPollByIdOrSlug<T extends Prisma.PollInclude>(
  idOrSlug: string,
  include: T,
) {
  return prisma.poll.findFirst({
    where: {
      OR: UUID_REGEX.test(idOrSlug)
        ? [{ id: idOrSlug }, { slug: idOrSlug }]
        : [{ slug: idOrSlug }, { id: idOrSlug }],
    },
    include,
  });
}

async function findPollForUpdate(id: string) {
  return prisma.poll.findUnique({
    where: { id },
    include: {
      options: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          text: true,
          sortOrder: true,
        },
      },
      _count: {
        select: {
          votes: true,
        },
      },
    },
  });
}

async function sendPollEmailsAsync(poll: {
  question: string;
  slug: string;
  description?: string | null;
  deadline?: Date | null;
  allowMultipleChoices: boolean;
}) {
  try {
    const users = await prisma.user.findMany({
      where: {
        email: { not: '' },
        role: { not: 'NETWORK' },
      },
      select: { email: true },
    });

    const emails = users.map((user) => user.email).filter(Boolean);
    if (emails.length === 0) {
      logger.info('No users to notify for poll');
      return;
    }

    logger.info(`📧 Sending poll email to ${emails.length} users...`, { question: poll.question });
    await emailService.sendPollToAll(
      emails,
      poll.question,
      poll.slug,
      poll.description || undefined,
      poll.deadline || null,
      poll.allowMultipleChoices,
    );
  } catch (error) {
    logger.error('Failed to send poll emails', {
      error: error instanceof Error ? error.message : String(error),
      question: poll.question,
    });
  }
}

function formatIstDateTime(value: Date | null | undefined): string {
  if (!value) return 'N/A';
  return value.toLocaleString(IST_LOCALE, {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

pollsRouter.get('/admin/public-view', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const parsed = adminListFiltersSchema.safeParse({
      search: req.query.search,
      status: req.query.status,
      anonymity: req.query.anonymity,
      limit: req.query.limit,
      offset: req.query.offset,
    });

    if (!parsed.success) {
      return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid filters');
    }

    const { search, status = 'ALL', anonymity = 'ALL', limit = 50, offset = 0 } = parsed.data;
    const conditions: Prisma.PollWhereInput[] = [];

    if (search) {
      conditions.push({
        OR: [
          { question: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { description: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { slug: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { creator: { is: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } } },
          { creator: { is: { email: { contains: search, mode: Prisma.QueryMode.insensitive } } } },
          { options: { some: { text: { contains: search, mode: Prisma.QueryMode.insensitive } } } },
        ],
      });
    }

    if (status === 'DRAFT') {
      conditions.push({ isPublished: false });
    } else if (status === 'OPEN') {
      conditions.push({
        AND: [
          { isPublished: true },
          {
            OR: [
              { deadline: null },
              { deadline: { gte: new Date() } },
            ],
          },
        ],
      });
    } else if (status === 'CLOSED') {
      conditions.push({
        AND: [
          { isPublished: true },
          { deadline: { lt: new Date() } },
        ],
      });
    }

    if (anonymity === 'ANONYMOUS') {
      conditions.push({ isAnonymous: true });
    } else if (anonymity === 'NAMED') {
      conditions.push({ isAnonymous: false });
    }

    const where: Prisma.PollWhereInput = conditions.length > 0 ? { AND: conditions } : {};

    const [polls, total] = await withRetry(() =>
      Promise.all([
        prisma.poll.findMany({
          where,
          orderBy: [{ isPublished: 'desc' }, { createdAt: 'desc' }],
          take: limit,
          skip: offset,
          select: {
            id: true,
            question: true,
            slug: true,
            allowMultipleChoices: true,
            allowVoteChange: true,
            isAnonymous: true,
            isPublished: true,
            deadline: true,
            createdAt: true,
            updatedAt: true,
            creator: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            _count: {
              select: {
                votes: true,
                feedbackEntries: true,
                options: true,
              },
            },
          },
        }),
        prisma.poll.count({ where }),
      ]),
    );

    return ApiResponse.success(res, {
      polls: polls.map((poll) => ({
        id: poll.id,
        question: poll.question,
        slug: poll.slug,
        shareUrl: getPollShareUrl(poll.slug),
        allowMultipleChoices: poll.allowMultipleChoices,
        allowVoteChange: poll.allowVoteChange,
        isAnonymous: poll.isAnonymous,
        isPublished: poll.isPublished,
        deadline: poll.deadline?.toISOString() ?? null,
        createdAt: poll.createdAt.toISOString(),
        updatedAt: poll.updatedAt.toISOString(),
        isClosed: isPollClosed(poll.deadline),
        creator: poll.creator,
        totalVotes: poll._count.votes,
        totalFeedback: poll._count.feedbackEntries,
        optionCount: poll._count.options,
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    logger.error('Failed to fetch admin poll list', {
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to fetch polls');
  }
});

pollsRouter.get('/admin/public-view/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    if (!requireUuid(res, req.params.id, 'poll ID')) {
      return;
    }
    const poll = await withRetry(() =>
      prisma.poll.findUnique({
        where: { id: req.params.id },
        include: adminDetailInclude,
      }),
    );

    if (!poll) {
      return ApiResponse.notFound(res, 'Poll not found');
    }

    return ApiResponse.success(res, serializeAdminPollDetail(poll));
  } catch (error) {
    logger.error('Failed to fetch admin poll detail', {
      pollId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to fetch poll detail');
  }
});

pollsRouter.post('/', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const parsed = createPollSchema.safeParse(req.body);

    if (!parsed.success) {
      return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid poll payload');
    }

    const normalizedOptions = normalizeOptionTexts(parsed.data.options);
    if (normalizedOptions.length === 1) {
      return ApiResponse.badRequest(res, 'Provide either zero options (question-only mode) or at least two unique options');
    }

    const slug = await generatePollSlug(parsed.data.question);
    const description = normalizeOptionalText(parsed.data.description);

    const poll = await withRetry(() =>
      prisma.poll.create({
        data: {
          question: sanitizeText(parsed.data.question).trim(),
          description,
          slug,
          allowMultipleChoices: normalizedOptions.length === 0 ? false : parsed.data.allowMultipleChoices ?? false,
          allowVoteChange: parsed.data.allowVoteChange ?? true,
          isAnonymous: parsed.data.isAnonymous ?? false,
          deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
          isPublished: parsed.data.isPublished ?? true,
          createdBy: authUser.id,
          options: {
            create: normalizedOptions.map((text, index) => ({
              text,
              sortOrder: index,
            })),
          },
        },
        include: adminDetailInclude,
      }),
    );

    await auditLog(authUser.id, 'CREATE', 'poll', poll.id, {
      question: poll.question,
      isPublished: poll.isPublished,
      optionCount: normalizedOptions.length,
    });

    if (poll.isPublished) {
      void sendPollEmailsAsync({
        question: poll.question,
        slug: poll.slug,
        description: poll.description,
        deadline: poll.deadline,
        allowMultipleChoices: poll.allowMultipleChoices,
      });
    }

    return ApiResponse.created(res, serializeAdminPollDetail(poll), 'Poll created successfully');
  } catch (error) {
    logger.error('Failed to create poll', {
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to create poll');
  }
});

pollsRouter.put('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    if (!requireUuid(res, req.params.id, 'poll ID')) {
      return;
    }
    const authUser = getAuthUser(req)!;
    const parsed = updatePollSchema.safeParse(req.body);

    if (!parsed.success) {
      return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid poll payload');
    }

    const existingPoll = await withRetry(() => findPollForUpdate(req.params.id));
    if (!existingPoll) {
      return ApiResponse.notFound(res, 'Poll not found');
    }

    const hasVotes = existingPoll._count.votes > 0;
    if (hasVotes && parsed.data.options) {
      return ApiResponse.conflict(res, 'Poll options cannot be changed after voting has started');
    }
    if (hasVotes && parsed.data.allowMultipleChoices !== undefined && parsed.data.allowMultipleChoices !== existingPoll.allowMultipleChoices) {
      return ApiResponse.conflict(res, 'Choice mode cannot be changed after voting has started');
    }
    if (hasVotes && parsed.data.isAnonymous !== undefined && parsed.data.isAnonymous !== existingPoll.isAnonymous) {
      return ApiResponse.conflict(res, 'Anonymity cannot be changed after voting has started');
    }

    const normalizedOptions = parsed.data.options ? normalizeOptionTexts(parsed.data.options) : null;
    if (parsed.data.options && (!normalizedOptions || normalizedOptions.length === 1)) {
      return ApiResponse.badRequest(res, 'Provide either zero options (question-only mode) or at least two unique options');
    }

    const nextPublished = parsed.data.isPublished ?? existingPoll.isPublished;
    const shouldSendPublishEmail = !existingPoll.isPublished && nextPublished;

    const updateData: Prisma.PollUpdateInput = {
      ...(parsed.data.question !== undefined
        ? {
            question: sanitizeText(parsed.data.question).trim(),
            slug: await generatePollSlug(parsed.data.question, existingPoll.id),
          }
        : {}),
      ...(parsed.data.description !== undefined
        ? { description: normalizeOptionalText(parsed.data.description) }
        : {}),
      ...(parsed.data.allowMultipleChoices !== undefined
        ? { allowMultipleChoices: parsed.data.allowMultipleChoices }
        : {}),
      ...(parsed.data.allowVoteChange !== undefined
        ? { allowVoteChange: parsed.data.allowVoteChange }
        : {}),
      ...(parsed.data.isAnonymous !== undefined
        ? { isAnonymous: parsed.data.isAnonymous }
        : {}),
      ...(parsed.data.deadline !== undefined
        ? { deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null }
        : {}),
      ...(parsed.data.isPublished !== undefined
        ? { isPublished: parsed.data.isPublished }
        : {}),
    };

    if (normalizedOptions) {
      updateData.options = {
        deleteMany: {},
        create: normalizedOptions.map((text, index) => ({
          text,
          sortOrder: index,
        })),
      };

      if (normalizedOptions.length === 0) {
        updateData.allowMultipleChoices = false;
      }
    }

    const poll = await withRetry(() =>
      prisma.poll.update({
        where: { id: existingPoll.id },
        data: updateData,
        include: adminDetailInclude,
      }),
    );

    await auditLog(authUser.id, 'UPDATE', 'poll', poll.id, {
      question: poll.question,
      isPublished: poll.isPublished,
    });

    if (shouldSendPublishEmail) {
      void sendPollEmailsAsync({
        question: poll.question,
        slug: poll.slug,
        description: poll.description,
        deadline: poll.deadline,
        allowMultipleChoices: poll.allowMultipleChoices,
      });
    }

    return ApiResponse.success(res, serializeAdminPollDetail(poll), 'Poll updated successfully');
  } catch (error) {
    logger.error('Failed to update poll', {
      pollId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to update poll');
  }
});

pollsRouter.delete('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    if (!requireUuid(res, req.params.id, 'poll ID')) {
      return;
    }
    const authUser = getAuthUser(req)!;
    const existing = await withRetry(() =>
      prisma.poll.findUnique({
        where: { id: req.params.id },
        select: { id: true, question: true },
      }),
    );

    if (!existing) {
      return ApiResponse.notFound(res, 'Poll not found');
    }

    await withRetry(() => prisma.poll.delete({ where: { id: req.params.id } }));
    await auditLog(authUser.id, 'DELETE', 'poll', existing.id, { question: existing.question });

    return ApiResponse.success(res, { id: existing.id }, 'Poll deleted successfully');
  } catch (error) {
    logger.error('Failed to delete poll', {
      pollId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to delete poll');
  }
});

pollsRouter.get('/:id/admin/export.xlsx', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    if (!requireUuid(res, req.params.id, 'poll ID')) {
      return;
    }
    const poll = await withRetry(() =>
      prisma.poll.findUnique({
        where: { id: req.params.id },
        include: adminDetailInclude,
      }),
    );

    if (!poll) {
      return ApiResponse.notFound(res, 'Poll not found');
    }

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.default.Workbook();
    workbook.creator = 'code.scriet';
    workbook.created = new Date();

    const totalVotes = poll._count.votes;

    const summary = workbook.addWorksheet('Poll Summary');
    summary.columns = [
      { header: 'Option', key: 'option', width: 42 },
      { header: 'Votes', key: 'votes', width: 12 },
      { header: 'Percentage', key: 'percentage', width: 14 },
    ];
    summary.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summary.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' },
    };
    poll.options.forEach((option) => {
      summary.addRow({
        option: option.text,
        votes: option._count.selections,
        percentage: `${toPercentage(option._count.selections, totalVotes)}%`,
      });
    });

    summary.addRow([]);
    summary.addRow(['Question', poll.question]);
    summary.addRow(['Share URL', getPollShareUrl(poll.slug)]);
    summary.addRow(['Total Ballots', totalVotes]);
    summary.addRow(['Total Feedback', poll._count.feedbackEntries]);
    summary.addRow(['Published', poll.isPublished ? 'Yes' : 'No']);
    summary.addRow(['Anonymous', poll.isAnonymous ? 'Yes' : 'No']);
    summary.addRow(['Multiple Choice', poll.allowMultipleChoices ? 'Yes' : 'No']);
    summary.addRow(['Vote Changes', poll.allowVoteChange ? 'Allowed' : 'Locked']);
    summary.addRow(['Deadline', formatIstDateTime(poll.deadline)]);
    summary.addRow(['Created At', formatIstDateTime(poll.createdAt)]);
    summary.addRow(['Exported At', formatIstDateTime(new Date())]);

    const responses = workbook.addWorksheet('User Responses');
    responses.columns = poll.isAnonymous
      ? [
          { header: 'Response ID', key: 'responseId', width: 38 },
          { header: 'Selected Options', key: 'selectedOptions', width: 50 },
          { header: 'Created At', key: 'createdAt', width: 24 },
          { header: 'Updated At', key: 'updatedAt', width: 24 },
        ]
      : [
          { header: 'Response ID', key: 'responseId', width: 38 },
          { header: 'Name', key: 'name', width: 24 },
          { header: 'Email', key: 'email', width: 30 },
          { header: 'Role', key: 'role', width: 16 },
          { header: 'Selected Options', key: 'selectedOptions', width: 50 },
          { header: 'Created At', key: 'createdAt', width: 24 },
          { header: 'Updated At', key: 'updatedAt', width: 24 },
        ];

    responses.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    responses.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD97706' },
    };

    poll.votes.forEach((vote) => {
      responses.addRow(
        poll.isAnonymous
          ? {
              responseId: vote.id,
              selectedOptions: vote.selections.map((selection) => selection.option.text).join(', '),
              createdAt: formatIstDateTime(vote.createdAt),
              updatedAt: formatIstDateTime(vote.updatedAt),
            }
          : {
              responseId: vote.id,
              name: vote.user.name,
              email: vote.user.email,
              role: vote.user.role,
              selectedOptions: vote.selections.map((selection) => selection.option.text).join(', '),
              createdAt: formatIstDateTime(vote.createdAt),
              updatedAt: formatIstDateTime(vote.updatedAt),
            },
      );
    });

    const feedbackSheet = workbook.addWorksheet('Feedback');
    feedbackSheet.columns = [
      { header: 'Feedback ID', key: 'feedbackId', width: 38 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Role', key: 'role', width: 16 },
      { header: 'Message', key: 'message', width: 72 },
      { header: 'Created At', key: 'createdAt', width: 24 },
      { header: 'Updated At', key: 'updatedAt', width: 24 },
    ];
    feedbackSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    feedbackSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF7C3AED' },
    };

    poll.feedbackEntries.forEach((entry) => {
      feedbackSheet.addRow({
        feedbackId: entry.id,
        name: entry.user.name,
        email: entry.user.email,
        role: entry.user.role,
        message: entry.message,
        createdAt: formatIstDateTime(entry.createdAt),
        updatedAt: formatIstDateTime(entry.updatedAt),
      });
    });

    const filenameBase = `${poll.slug || 'poll'}-${new Date().toISOString().split('T')[0]}`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();

    const authUser = getAuthUser(req);
    if (authUser) {
      await auditLog(authUser.id, 'EXPORT', 'poll', poll.id, {
        question: poll.question,
        totalVotes,
        totalFeedback: poll._count.feedbackEntries,
      });
    }
  } catch (error) {
    logger.error('Failed to export poll results', {
      pollId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to export poll results');
  }
});

pollsRouter.get('/', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const limit = parsePaginationNumber(req.query.limit, 25, { min: 1, max: 100 });
    const offset = parsePaginationNumber(req.query.offset, 0, { min: 0, max: 100000 });

    if (limit === null || offset === null) {
      return ApiResponse.badRequest(res, 'Invalid pagination parameters');
    }

    const includeClosed = req.query.includeClosed === 'true';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const authUser = getAuthUser(req);

    const where: Prisma.PollWhereInput = {
      AND: [
        { isPublished: true },
        ...(includeClosed
          ? []
          : [
              {
                OR: [
                  { deadline: null },
                  { deadline: { gte: new Date() } },
                ],
              },
            ]),
        ...(search
          ? [
              {
                OR: [
                  { question: { contains: search, mode: Prisma.QueryMode.insensitive } },
                  { description: { contains: search, mode: Prisma.QueryMode.insensitive } },
                  { options: { some: { text: { contains: search, mode: Prisma.QueryMode.insensitive } } } },
                ],
              },
            ]
          : []),
      ],
    };

    const polls = await withRetry(() =>
      prisma.poll.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
        skip: offset,
        include: buildPublicPollInclude(authUser?.id ?? null),
      }),
    );

    return ApiResponse.success(res, polls.map(serializePublicPoll));
  } catch (error) {
    logger.error('Failed to fetch public polls', {
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to fetch polls');
  }
});

pollsRouter.get('/:idOrSlug', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req);
    const poll = await withRetry(() =>
      findPollByIdOrSlug(req.params.idOrSlug, buildPublicPollInclude(authUser?.id ?? null)),
    );

    if (!poll) {
      return ApiResponse.notFound(res, 'Poll not found');
    }

    const canPreviewUnpublished = authUser ? hasPermission(authUser.role, 'ADMIN') : false;
    if (!poll.isPublished && !canPreviewUnpublished) {
      return ApiResponse.notFound(res, 'Poll not found');
    }

    return ApiResponse.success(res, serializePublicPoll(poll));
  } catch (error) {
    logger.error('Failed to fetch poll', {
      idOrSlug: req.params.idOrSlug,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to fetch poll');
  }
});

pollsRouter.post('/:idOrSlug/vote', authMiddleware, requireRole('USER'), async (req: Request, res: Response) => {
  try {
    const authUser = ensurePollParticipant(req, res);
    if (!authUser) return;

    const parsed = voteSchema.safeParse(req.body);
    if (!parsed.success) {
      return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid vote payload');
    }

    const poll = await withRetry(() =>
      findPollByIdOrSlug(req.params.idOrSlug, {
        options: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, text: true },
        },
        votes: {
          where: { userId: authUser.id },
          select: { id: true },
        },
      } satisfies Prisma.PollInclude),
    );

    if (!poll || !poll.isPublished) {
      return ApiResponse.notFound(res, 'Poll not found');
    }
    if (isPollClosed(poll.deadline)) {
      return ApiResponse.forbidden(res, 'Voting for this poll has closed');
    }

    if (poll.options.length === 0) {
      return ApiResponse.conflict(res, 'This is a question-only poll and does not accept votes');
    }

    const optionIds = Array.from(new Set(parsed.data.optionIds));
    const validOptionIds = new Set(poll.options.map((option) => option.id));
    if (!optionIds.every((optionId) => validOptionIds.has(optionId))) {
      return ApiResponse.badRequest(res, 'One or more selected options are invalid');
    }

    if (!poll.allowMultipleChoices && optionIds.length !== 1) {
      return ApiResponse.badRequest(res, 'This poll only allows one selected option');
    }

    if (poll.allowMultipleChoices && optionIds.length > poll.options.length) {
      return ApiResponse.badRequest(res, 'Too many options selected');
    }

    const existingVote = poll.votes[0] ?? null;
    if (existingVote && !poll.allowVoteChange) {
      return ApiResponse.conflict(res, 'Vote changes are disabled for this poll');
    }

    await withRetry(() =>
      prisma.$transaction(async (tx) => {
        let voteId = existingVote?.id;

        if (!voteId) {
          const createdVote = await tx.pollVote.create({
            data: {
              pollId: poll.id,
              userId: authUser.id,
            },
            select: { id: true },
          });
          voteId = createdVote.id;
        } else {
          await tx.pollVoteSelection.deleteMany({ where: { voteId } });
          await tx.pollVote.update({
            where: { id: voteId },
            data: { updatedAt: new Date() },
          });
        }

        await tx.pollVoteSelection.createMany({
          data: optionIds.map((optionId) => ({
            voteId: voteId!,
            optionId,
          })),
        });
      }),
    );

    const refreshed = await withRetry(() =>
      findPollByIdOrSlug(req.params.idOrSlug, buildPublicPollInclude(authUser.id)),
    );

    if (!refreshed) {
      return ApiResponse.notFound(res, 'Poll not found');
    }

    return ApiResponse.success(res, serializePublicPoll(refreshed), existingVote ? 'Vote updated successfully' : 'Vote submitted successfully');
  } catch (error) {
    logger.error('Failed to submit poll vote', {
      idOrSlug: req.params.idOrSlug,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to submit vote');
  }
});

pollsRouter.post('/:idOrSlug/feedback', authMiddleware, requireRole('USER'), async (req: Request, res: Response) => {
  try {
    const authUser = ensurePollParticipant(req, res);
    if (!authUser) return;

    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid feedback payload');
    }

    const poll = await withRetry(() =>
      prisma.poll.findFirst({
        where: {
          OR: UUID_REGEX.test(req.params.idOrSlug)
            ? [{ id: req.params.idOrSlug }, { slug: req.params.idOrSlug }]
            : [{ slug: req.params.idOrSlug }, { id: req.params.idOrSlug }],
          isPublished: true,
        },
        select: { id: true, slug: true },
      }),
    );

    if (!poll) {
      return ApiResponse.notFound(res, 'Poll not found');
    }

    const feedback = await withRetry(() =>
      prisma.pollFeedback.upsert({
        where: {
          pollId_userId: {
            pollId: poll.id,
            userId: authUser.id,
          },
        },
        update: {
          message: sanitizeText(parsed.data.message).trim(),
        },
        create: {
          pollId: poll.id,
          userId: authUser.id,
          message: sanitizeText(parsed.data.message).trim(),
        },
        select: {
          id: true,
          message: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    );

    return ApiResponse.success(res, {
      id: feedback.id,
      message: feedback.message,
      createdAt: feedback.createdAt.toISOString(),
      updatedAt: feedback.updatedAt.toISOString(),
    }, 'Feedback saved successfully');
  } catch (error) {
    logger.error('Failed to submit poll feedback', {
      idOrSlug: req.params.idOrSlug,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to submit feedback');
  }
});
