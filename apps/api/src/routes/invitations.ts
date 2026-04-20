import { randomUUID } from 'crypto';
import { CertType, Prisma, RegistrationType } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { hasPermission, requireRole } from '../middleware/role.js';
import { ApiResponse, ErrorCodes } from '../utils/response.js';
import { auditLog } from '../utils/audit.js';
import { generateAttendanceToken } from '../utils/attendanceToken.js';
import { emailService } from '../utils/email.js';
import { verifyInvitationClaimToken } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';
import { sanitizeText } from '../utils/sanitize.js';
import { deriveInvitationStatus, getEffectiveEventEnd } from '../utils/invitationStatus.js';

export const invitationsRouter = Router();

const INVITATION_TRANSACTION_RETRIES = 3;
const RESEND_COOLDOWN_MS = 5 * 60 * 1000;
const CERT_TYPES = ['PARTICIPATION', 'COMPLETION', 'WINNER', 'SPEAKER'] as const;
const EMAIL_ADDRESS_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const claimRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, error: { message: 'Too many invitation claim attempts. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

const invitationDetailInclude = Prisma.validator<Prisma.EventInvitationInclude>()({
  event: {
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      shortDescription: true,
      startDate: true,
      endDate: true,
      venue: true,
      location: true,
      imageUrl: true,
      eventType: true,
      status: true,
      eventDays: true,
    },
  },
  inviteeUser: {
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      role: true,
      networkProfile: {
        select: {
          id: true,
          fullName: true,
          designation: true,
          company: true,
          profilePhoto: true,
          slug: true,
          isPublic: true,
          status: true,
        },
      },
    },
  },
  invitedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  registration: {
    select: {
      id: true,
      eventId: true,
      attendanceToken: true,
      attended: true,
      registrationType: true,
    },
  },
});

const invitableUserSelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  name: true,
  email: true,
  role: true,
  networkProfile: {
    select: {
      id: true,
      status: true,
      fullName: true,
      designation: true,
      company: true,
      profilePhoto: true,
      slug: true,
      isPublic: true,
    },
  },
});

type InvitationRecord = Prisma.EventInvitationGetPayload<{ include: typeof invitationDetailInclude }>;
type InvitableUserRecord = Prisma.UserGetPayload<{ select: typeof invitableUserSelect }>;

class InvitationHttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const searchInviteesQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  eventId: z.string().uuid(),
});

const inviteeInputSchema = z.object({
  userId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  role: z.string().trim().min(1).max(50).optional(),
  certificateEnabled: z.boolean().optional(),
  certificateType: z.enum(CERT_TYPES).optional(),
}).refine((value) => Boolean(value.userId) !== Boolean(value.email), {
  message: 'Each invitee must provide exactly one of userId or email',
});

const bulkCreateInvitationsSchema = z.object({
  eventId: z.string().uuid(),
  invitees: z.array(inviteeInputSchema).min(1).max(50),
  customMessage: z.string().max(5000).optional(),
}).strict();

const updateInvitationSchema = z.object({
  role: z.string().trim().min(1).max(50).optional(),
  customMessage: z.string().max(5000).nullable().optional(),
  certificateEnabled: z.boolean().optional(),
  certificateType: z.enum(CERT_TYPES).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required',
});

const claimInvitationSchema = z.object({
  token: z.string().trim().min(1),
});

function normalizeEmailAddress(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || !EMAIL_ADDRESS_REGEX.test(normalized)) {
    return null;
  }
  return normalized;
}

function normalizeRole(role?: string): string {
  const normalized = sanitizeText(role || 'Guest').trim();
  return normalized.slice(0, 50) || 'Guest';
}

function normalizeOptionalMessage(message?: string | null): string | null | undefined {
  if (message === undefined) {
    return undefined;
  }

  const normalized = sanitizeText(message).trim();
  return normalized ? normalized : null;
}

function backoffDelay(attempt: number): Promise<void> {
  const baseMs = 50 * Math.pow(2, attempt);
  const jitter = Math.random() * baseMs;
  return new Promise((resolve) => setTimeout(resolve, baseMs + jitter));
}

function getResendCooldownRemainingMs(lastEmailResentAt: Date | null, now: Date): number {
  if (!lastEmailResentAt) {
    return 0;
  }

  return Math.max(lastEmailResentAt.getTime() + RESEND_COOLDOWN_MS - now.getTime(), 0);
}

function getRetryAfterSeconds(remainingMs: number): number {
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

function isPrivilegedInternalUser(role: string): boolean {
  return hasPermission(role, 'CORE_MEMBER');
}

function isVerifiedOrInternalInvitee(user: InvitableUserRecord): boolean {
  return isPrivilegedInternalUser(user.role) || user.networkProfile?.status === 'VERIFIED';
}

function buildInviteeSnapshots(user: InvitableUserRecord) {
  return {
    inviteeNameSnapshot: user.networkProfile?.fullName?.trim() || user.name?.trim() || null,
    inviteeDesignationSnapshot: user.networkProfile?.designation?.trim() || null,
    inviteeCompanySnapshot: user.networkProfile?.company?.trim() || null,
  };
}

function matchesInvitationInvitee(
  invitation: { inviteeUserId: string | null; inviteeEmail: string | null },
  authUser: { id: string; email: string },
): boolean {
  if (invitation.inviteeUserId) {
    return invitation.inviteeUserId === authUser.id;
  }

  const normalizedInvitationEmail = normalizeEmailAddress(invitation.inviteeEmail || '');
  const normalizedUserEmail = normalizeEmailAddress(authUser.email || '');
  return Boolean(normalizedInvitationEmail && normalizedUserEmail && normalizedInvitationEmail === normalizedUserEmail);
}

function serializeInvitation(invitation: InvitationRecord, options?: { includeAttendanceToken?: boolean }) {
  const includeAttendanceToken = options?.includeAttendanceToken ?? false;

  return {
    id: invitation.id,
    eventId: invitation.eventId,
    event: invitation.event,
    inviteeUserId: invitation.inviteeUserId,
    inviteeEmail: invitation.inviteeEmail,
    inviteeNameSnapshot: invitation.inviteeNameSnapshot,
    inviteeDesignationSnapshot: invitation.inviteeDesignationSnapshot,
    inviteeCompanySnapshot: invitation.inviteeCompanySnapshot,
    role: invitation.role,
    customMessage: invitation.customMessage,
    status: deriveInvitationStatus(invitation),
    certificateEnabled: invitation.certificateEnabled,
    certificateType: invitation.certificateType,
    invitedById: invitation.invitedById,
    invitedBy: invitation.invitedBy,
    inviteeUser: invitation.inviteeUser,
    invitedAt: invitation.invitedAt,
    respondedAt: invitation.respondedAt,
    revokedAt: invitation.revokedAt,
    emailSent: invitation.emailSent,
    emailSentAt: invitation.emailSentAt,
    lastEmailResentAt: invitation.lastEmailResentAt,
    registrationId: invitation.registration?.id || invitation.registrationId,
    registration: invitation.registration
      ? {
          id: invitation.registration.id,
          eventId: invitation.registration.eventId,
          attended: invitation.registration.attended,
          registrationType: invitation.registration.registrationType,
        }
      : null,
    attendanceToken: includeAttendanceToken ? invitation.registration?.attendanceToken ?? undefined : undefined,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
  };
}

function sendInvitationHttpError(res: Response, error: InvitationHttpError) {
  const code =
    error.status === 404
      ? ErrorCodes.NOT_FOUND
      : error.status === 403
        ? ErrorCodes.FORBIDDEN
        : error.status === 409
          ? ErrorCodes.CONFLICT
          : error.status === 410
            ? ErrorCodes.CONFLICT
            : ErrorCodes.BAD_REQUEST;

  return ApiResponse.error(res, {
    code,
    message: error.message,
    details: error.details,
    status: error.status,
  });
}

async function loadInvitableUserById(tx: Prisma.TransactionClient, userId: string): Promise<InvitableUserRecord | null> {
  return tx.user.findUnique({
    where: { id: userId },
    select: invitableUserSelect,
  });
}

async function loadInvitableUserByEmail(tx: Prisma.TransactionClient, email: string): Promise<InvitableUserRecord | null> {
  return tx.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: 'insensitive',
      },
    },
    select: invitableUserSelect,
  });
}

async function sendInvitationEmail(invitation: InvitationRecord): Promise<void> {
  try {
    const sent = await emailService.sendEventInvitation(invitation);
    if (!sent) {
      return;
    }

    const sentAt = new Date();
    await prisma.eventInvitation.update({
      where: { id: invitation.id },
      data: {
        emailSent: true,
        emailSentAt: sentAt,
      },
    });
  } catch (error) {
    logger.error('Failed to send invitation email', {
      invitationId: invitation.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function sendInvitationWithdrawalEmail(invitation: InvitationRecord): Promise<void> {
  try {
    await emailService.sendEventInvitationWithdrawn(invitation);
  } catch (error) {
    logger.error('Failed to send withdrawn invitation email', {
      invitationId: invitation.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function cleanupGuestRegistrationForInvitation(
  tx: Prisma.TransactionClient,
  invitation: Pick<InvitationRecord, 'registrationId' | 'inviteeUserId' | 'eventId'>,
  fallbackInviteeUserId?: string,
): Promise<void> {
  const effectiveInviteeUserId = fallbackInviteeUserId || invitation.inviteeUserId || null;

  const operations: Promise<unknown>[] = [];
  if (invitation.registrationId) {
    operations.push(
      tx.eventRegistration.deleteMany({
        where: {
          id: invitation.registrationId,
          registrationType: RegistrationType.GUEST,
        },
      }),
    );
  }

  if (effectiveInviteeUserId) {
    operations.push(
      tx.eventRegistration.deleteMany({
        where: {
          userId: effectiveInviteeUserId,
          eventId: invitation.eventId,
          registrationType: RegistrationType.GUEST,
        },
      }),
    );
  }

  if (operations.length > 0) {
    await Promise.all(operations);
  }
}

async function upsertUserInvitation(args: {
  tx: Prisma.TransactionClient;
  eventId: string;
  user: InvitableUserRecord;
  role: string;
  customMessage: string | null;
  certificateEnabled: boolean;
  certificateType: CertType;
  invitedById: string;
}): Promise<InvitationRecord | { skipped: true; reason: string }> {
  const { tx, eventId, user, role, customMessage, certificateEnabled, certificateType, invitedById } = args;

  if (!isVerifiedOrInternalInvitee(user)) {
    return { skipped: true, reason: 'invitee_not_verified' };
  }

  const existingRegistration = await tx.eventRegistration.findUnique({
    where: {
      userId_eventId: {
        userId: user.id,
        eventId,
      },
    },
    select: {
      id: true,
      registrationType: true,
    },
  });

  if (existingRegistration?.registrationType === RegistrationType.PARTICIPANT) {
    return { skipped: true, reason: 'already_registered_as_participant' };
  }

  if (existingRegistration?.registrationType === RegistrationType.GUEST) {
    return { skipped: true, reason: 'already_registered_for_event' };
  }

  const existingInvitation = await tx.eventInvitation.findFirst({
    where: {
      eventId,
      OR: [
        { inviteeUserId: user.id },
        ...(user.email
          ? [{
              inviteeEmail: {
                equals: user.email,
                mode: 'insensitive' as const,
              },
            }]
          : []),
      ],
    },
    include: invitationDetailInclude,
  });

  const snapshots = buildInviteeSnapshots(user);

  if (existingInvitation && existingInvitation.status !== 'REVOKED') {
    return { skipped: true, reason: 'already_invited' };
  }

  if (existingInvitation) {
    return tx.eventInvitation.update({
      where: { id: existingInvitation.id },
      data: {
        inviteeUserId: user.id,
        inviteeEmail: normalizeEmailAddress(user.email || '') || existingInvitation.inviteeEmail,
        ...snapshots,
        role,
        customMessage,
        status: 'PENDING',
        certificateEnabled,
        certificateType,
        invitedById,
        invitedAt: new Date(),
        respondedAt: null,
        revokedAt: null,
        emailSent: false,
        emailSentAt: null,
        lastEmailResentAt: null,
        registrationId: null,
      },
      include: invitationDetailInclude,
    });
  }

  return tx.eventInvitation.create({
    data: {
      eventId,
      inviteeUserId: user.id,
      inviteeEmail: normalizeEmailAddress(user.email || '') || null,
      ...snapshots,
      role,
      customMessage,
      certificateEnabled,
      certificateType,
      invitedById,
    },
    include: invitationDetailInclude,
  });
}

async function upsertEmailInvitation(args: {
  tx: Prisma.TransactionClient;
  eventId: string;
  email: string;
  role: string;
  customMessage: string | null;
  certificateEnabled: boolean;
  certificateType: CertType;
  invitedById: string;
}): Promise<InvitationRecord | { skipped: true; reason: string }> {
  const { tx, eventId, email, role, customMessage, certificateEnabled, certificateType, invitedById } = args;

  const existingUser = await loadInvitableUserByEmail(tx, email);
  if (existingUser) {
    return upsertUserInvitation({
      tx,
      eventId,
      user: existingUser,
      role,
      customMessage,
      certificateEnabled,
      certificateType,
      invitedById,
    });
  }

  const existingInvitation = await tx.eventInvitation.findFirst({
    where: {
      eventId,
      inviteeEmail: {
        equals: email,
        mode: 'insensitive',
      },
    },
    include: invitationDetailInclude,
  });

  if (existingInvitation && existingInvitation.status !== 'REVOKED') {
    return { skipped: true, reason: 'already_invited' };
  }

  if (existingInvitation) {
    return tx.eventInvitation.update({
      where: { id: existingInvitation.id },
      data: {
        inviteeUserId: null,
        inviteeEmail: email,
        inviteeNameSnapshot: null,
        inviteeDesignationSnapshot: null,
        inviteeCompanySnapshot: null,
        role,
        customMessage,
        status: 'PENDING',
        certificateEnabled,
        certificateType,
        invitedById,
        invitedAt: new Date(),
        respondedAt: null,
        revokedAt: null,
        emailSent: false,
        emailSentAt: null,
        lastEmailResentAt: null,
        registrationId: null,
      },
      include: invitationDetailInclude,
    });
  }

  return tx.eventInvitation.create({
    data: {
      eventId,
      inviteeEmail: email,
      role,
      customMessage,
      certificateEnabled,
      certificateType,
      invitedById,
    },
    include: invitationDetailInclude,
  });
}

// GET /api/invitations/search-invitees
invitationsRouter.get('/search-invitees', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const parsed = searchInviteesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid invitee search query');
    }

    const query = parsed.data.q.trim();
    if (!query) {
      return ApiResponse.success(res, []);
    }

  const [existingInvitations, existingParticipantRegistrations] = await Promise.all([
      prisma.eventInvitation.findMany({
        where: {
          eventId: parsed.data.eventId,
          status: { not: 'REVOKED' },
        },
        select: {
          inviteeUserId: true,
          inviteeEmail: true,
        },
      }),
      prisma.eventRegistration.findMany({
        // Participant discovery: exclude people already occupying the participant lane for this event.
        where: {
          eventId: parsed.data.eventId,
          registrationType: RegistrationType.PARTICIPANT,
        },
        select: { userId: true },
      }),
    ]);

    const excludedUserIds = new Set([
      ...existingInvitations.map((item) => item.inviteeUserId).filter((value): value is string => Boolean(value)),
      ...existingParticipantRegistrations.map((item) => item.userId),
    ]);
    const excludedEmails = Array.from(new Set(
      existingInvitations
        .map((item) => normalizeEmailAddress(item.inviteeEmail || ''))
        .filter((value): value is string => Boolean(value)),
    ));

    const profiles = await prisma.networkProfile.findMany({
      where: {
        status: 'VERIFIED',
        OR: [
          { fullName: { contains: query, mode: 'insensitive' } },
          { designation: { contains: query, mode: 'insensitive' } },
          { company: { contains: query, mode: 'insensitive' } },
          { user: { email: { contains: query, mode: 'insensitive' } } },
        ],
        ...(excludedUserIds.size > 0 ? { userId: { notIn: Array.from(excludedUserIds) } } : {}),
      },
      select: {
        userId: true,
        fullName: true,
        designation: true,
        company: true,
        profilePhoto: true,
        user: {
          select: {
            email: true,
          },
        },
      },
      take: 40,
      orderBy: [
        { fullName: 'asc' },
      ],
    });

    const filteredProfiles = profiles
      .filter((profile) => {
        const normalizedProfileEmail = normalizeEmailAddress(profile.user.email || '');
        return !normalizedProfileEmail || !excludedEmails.includes(normalizedProfileEmail);
      })
      .slice(0, 12);

    return ApiResponse.success(res, filteredProfiles.map((profile) => ({
      userId: profile.userId,
      name: profile.fullName,
      designation: profile.designation,
      company: profile.company,
      photo: profile.profilePhoto,
    })));
  } catch (error) {
    logger.error('Failed to search invitees', {
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to search invitees');
  }
});

// POST /api/invitations
invitationsRouter.post('/', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const parsed = bulkCreateInvitationsSchema.safeParse(req.body);

    if (!parsed.success) {
      return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid invitation payload');
    }

    const sharedCustomMessage = normalizeOptionalMessage(parsed.data.customMessage) ?? null;

    const requestedUserIds = Array.from(
      new Set(
        parsed.data.invitees
          .map((invitee) => invitee.userId)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );
    const requestedEmails = Array.from(
      new Set(
        parsed.data.invitees
          .map((invitee) => (invitee.userId ? null : normalizeEmailAddress(invitee.email || '')))
          .filter((email): email is string => Boolean(email)),
      ),
    );

    const [prefetchedUsersById, prefetchedUsersByEmail] = await Promise.all([
      requestedUserIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: requestedUserIds } },
            select: invitableUserSelect,
          })
        : Promise.resolve([] as InvitableUserRecord[]),
      requestedEmails.length > 0
        ? prisma.user.findMany({
            where: { email: { in: requestedEmails, mode: 'insensitive' } },
            select: invitableUserSelect,
          })
        : Promise.resolve([] as InvitableUserRecord[]),
    ]);

    const usersByIdMap = new Map<string, InvitableUserRecord>();
    for (const user of prefetchedUsersById) {
      usersByIdMap.set(user.id, user);
    }
    const usersByEmailMap = new Map<string, InvitableUserRecord>();
    for (const user of prefetchedUsersByEmail) {
      const normalized = normalizeEmailAddress(user.email || '');
      if (normalized) {
        usersByEmailMap.set(normalized, user);
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const event = await tx.event.findUnique({
        where: { id: parsed.data.eventId },
        select: {
          id: true,
          title: true,
          slug: true,
          description: true,
          shortDescription: true,
          startDate: true,
          endDate: true,
          venue: true,
          location: true,
          imageUrl: true,
          eventType: true,
          status: true,
          eventDays: true,
        },
      });

      if (!event) {
        throw new InvitationHttpError(404, 'Event not found');
      }

      if (event.status === 'PAST' || getEffectiveEventEnd(event) < new Date()) {
        throw new InvitationHttpError(400, 'Cannot invite guests to a past event');
      }

      const created: InvitationRecord[] = [];
      const skipped: Array<{ identifier: string; reason: string }> = [];

      for (const invitee of parsed.data.invitees) {
        const role = normalizeRole(invitee.role);
        const certificateEnabled = invitee.certificateEnabled ?? true;
        const certificateType = invitee.certificateType ?? CertType.SPEAKER;

        if (invitee.userId) {
          const user = usersByIdMap.get(invitee.userId);
          if (!user) {
            skipped.push({ identifier: invitee.userId, reason: 'user_not_found' });
            continue;
          }

          const createdOrSkipped = await upsertUserInvitation({
            tx,
            eventId: parsed.data.eventId,
            user,
            role,
            customMessage: sharedCustomMessage,
            certificateEnabled,
            certificateType,
            invitedById: authUser.id,
          });

          if ('skipped' in createdOrSkipped) {
            skipped.push({ identifier: invitee.userId, reason: createdOrSkipped.reason });
            continue;
          }

          created.push(createdOrSkipped);
          continue;
        }

        const normalizedEmail = normalizeEmailAddress(invitee.email || '');
        if (!normalizedEmail) {
          skipped.push({ identifier: invitee.email || 'unknown', reason: 'invalid_email' });
          continue;
        }

        const prefetchedEmailUser = usersByEmailMap.get(normalizedEmail);
        const createdOrSkipped = prefetchedEmailUser
          ? await upsertUserInvitation({
              tx,
              eventId: parsed.data.eventId,
              user: prefetchedEmailUser,
              role,
              customMessage: sharedCustomMessage,
              certificateEnabled,
              certificateType,
              invitedById: authUser.id,
            })
          : await upsertEmailInvitation({
              tx,
              eventId: parsed.data.eventId,
              email: normalizedEmail,
              role,
              customMessage: sharedCustomMessage,
              certificateEnabled,
              certificateType,
              invitedById: authUser.id,
            });

        if ('skipped' in createdOrSkipped) {
          skipped.push({ identifier: normalizedEmail, reason: createdOrSkipped.reason });
          continue;
        }

        created.push(createdOrSkipped);
      }

      return { created, skipped };
    });

    await Promise.all(result.created.map((invitation) => (
      auditLog(authUser.id, 'INVITATION_CREATE', 'EventInvitation', invitation.id, {
        eventId: invitation.eventId,
        inviteeUserId: invitation.inviteeUserId,
        inviteeEmail: invitation.inviteeEmail,
        role: invitation.role,
      })
    )));

    for (const invitation of result.created) {
      void sendInvitationEmail(invitation);
    }

    return res.status(201).json({
      success: true,
      data: {
        created: result.created.map((invitation) => serializeInvitation(invitation)),
        skipped: result.skipped,
      },
    });
  } catch (error) {
    if (error instanceof InvitationHttpError) {
      return sendInvitationHttpError(res, error);
    }

    logger.error('Failed to create invitations', {
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to create invitations');
  }
});

// GET /api/invitations/event/:eventId
invitationsRouter.get('/event/:eventId', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const eventId = req.params.eventId;
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });

    if (!event) {
      return ApiResponse.notFound(res, 'Event not found');
    }

    const invitations = await prisma.eventInvitation.findMany({
      where: { eventId },
      include: invitationDetailInclude,
      orderBy: [
        { invitedAt: 'desc' },
      ],
    });

    return ApiResponse.success(res, invitations.map((invitation) => serializeInvitation(invitation)));
  } catch (error) {
    logger.error('Failed to fetch event invitations', {
      eventId: req.params.eventId,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to fetch event invitations');
  }
});

// GET /api/invitations/my
invitationsRouter.get('/my', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const invitations = await prisma.eventInvitation.findMany({
      where: {
        OR: [
          { inviteeUserId: authUser.id },
          {
            inviteeEmail: {
              equals: authUser.email,
              mode: 'insensitive',
            },
          },
        ],
      },
      include: invitationDetailInclude,
      orderBy: [
        { invitedAt: 'desc' },
      ],
    });

    return ApiResponse.success(res, invitations.map((invitation) => serializeInvitation(invitation, {
      includeAttendanceToken: true,
    })));
  } catch (error) {
    logger.error('Failed to fetch my invitations', {
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to fetch invitations');
  }
});

// POST /api/invitations/claim
invitationsRouter.post('/claim', claimRateLimiter, authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const parsed = claimInvitationSchema.safeParse(req.body);
    if (!parsed.success) {
      return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid claim payload');
    }

    const tokenPayload = verifyInvitationClaimToken(parsed.data.token);
    const normalizedTokenEmail = normalizeEmailAddress(tokenPayload.email || '');
    const normalizedUserEmail = normalizeEmailAddress(authUser.email || '');

    if (!normalizedTokenEmail || !normalizedUserEmail || normalizedTokenEmail !== normalizedUserEmail) {
      return ApiResponse.forbidden(res, 'This invitation token does not match your account email');
    }

    const invitation = await prisma.$transaction(async (tx) => {
      const existingInvitation = await tx.eventInvitation.findUnique({
        where: { id: tokenPayload.invitationId },
        include: invitationDetailInclude,
      });

      if (!existingInvitation) {
        throw new InvitationHttpError(404, 'Invitation not found');
      }

      if (existingInvitation.status === 'REVOKED') {
        throw new InvitationHttpError(409, 'This invitation has been revoked');
      }

      if (existingInvitation.inviteeUserId && existingInvitation.inviteeUserId !== authUser.id) {
        throw new InvitationHttpError(409, 'This invitation has already been claimed by another account');
      }

      if (
        existingInvitation.inviteeEmail &&
        normalizeEmailAddress(existingInvitation.inviteeEmail) !== normalizedTokenEmail
      ) {
        throw new InvitationHttpError(403, 'This invitation token is invalid for the current invitation');
      }

      const user = await loadInvitableUserById(tx, authUser.id);
      if (!user) {
        throw new InvitationHttpError(404, 'Authenticated user not found');
      }

      if (!isVerifiedOrInternalInvitee(user) && user.networkProfile?.status !== 'PENDING') {
        throw new InvitationHttpError(400, 'Complete your network onboarding before claiming this invitation');
      }

      const updatedInvitation = await tx.eventInvitation.update({
        where: { id: existingInvitation.id },
        data: {
          inviteeUserId: authUser.id,
          ...buildInviteeSnapshots(user),
        },
        include: invitationDetailInclude,
      });

      return updatedInvitation;
    });

    await auditLog(authUser.id, 'INVITATION_CLAIM', 'EventInvitation', invitation.id, {
      eventId: invitation.eventId,
      inviteeEmail: invitation.inviteeEmail,
    });

    return ApiResponse.success(res, serializeInvitation(invitation, { includeAttendanceToken: true }));
  } catch (error) {
    if (error instanceof InvitationHttpError) {
      return sendInvitationHttpError(res, error);
    }

    logger.error('Failed to claim invitation', {
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to claim invitation');
  }
});

// PATCH /api/invitations/:id
invitationsRouter.patch('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const parsed = updateInvitationSchema.safeParse(req.body);
    if (!parsed.success) {
      return ApiResponse.badRequest(res, parsed.error.errors[0]?.message || 'Invalid invitation update payload');
    }

    const updateData = {
      ...(parsed.data.role !== undefined ? { role: normalizeRole(parsed.data.role) } : {}),
      ...(parsed.data.customMessage !== undefined ? { customMessage: normalizeOptionalMessage(parsed.data.customMessage) ?? null } : {}),
      ...(parsed.data.certificateEnabled !== undefined ? { certificateEnabled: parsed.data.certificateEnabled } : {}),
      ...(parsed.data.certificateType !== undefined ? { certificateType: parsed.data.certificateType } : {}),
    };

    const updateResult = await prisma.eventInvitation.updateMany({
      where: { id: req.params.id, status: { not: 'REVOKED' } },
      data: updateData,
    });

    if (updateResult.count === 0) {
      const existingInvitation = await prisma.eventInvitation.findUnique({
        where: { id: req.params.id },
        select: { id: true, status: true },
      });
      if (!existingInvitation) {
        return ApiResponse.notFound(res, 'Invitation not found');
      }
      return ApiResponse.conflict(res, 'Revoked invitations cannot be edited');
    }

    const updatedInvitation = await prisma.eventInvitation.findUnique({
      where: { id: req.params.id },
      include: invitationDetailInclude,
    });

    if (!updatedInvitation) {
      return ApiResponse.notFound(res, 'Invitation not found');
    }

    await auditLog(authUser.id, 'INVITATION_UPDATE', 'EventInvitation', updatedInvitation.id, parsed.data);

    return ApiResponse.success(res, serializeInvitation(updatedInvitation));
  } catch (error) {
    logger.error('Failed to update invitation', {
      invitationId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to update invitation');
  }
});

// DELETE /api/invitations/:id
invitationsRouter.delete('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    let revokedInvitation: InvitationRecord | null = null;

    for (let attempt = 0; attempt < INVITATION_TRANSACTION_RETRIES; attempt += 1) {
      try {
        revokedInvitation = await prisma.$transaction(async (tx) => {
          const existingInvitation = await tx.eventInvitation.findUnique({
            where: { id: req.params.id },
            include: invitationDetailInclude,
          });

          if (!existingInvitation) {
            throw new InvitationHttpError(404, 'Invitation not found');
          }

          if (existingInvitation.status === 'REVOKED') {
            throw new InvitationHttpError(409, 'Invitation is already revoked');
          }

          await cleanupGuestRegistrationForInvitation(tx, existingInvitation);

          return tx.eventInvitation.update({
            where: { id: existingInvitation.id },
            data: {
              status: 'REVOKED',
              revokedAt: new Date(),
              registrationId: null,
            },
            include: invitationDetailInclude,
          });
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });

        break;
      } catch (error) {
        if (error instanceof InvitationHttpError) {
          return sendInvitationHttpError(res, error);
        }

        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < INVITATION_TRANSACTION_RETRIES - 1
        ) {
          await backoffDelay(attempt);
          continue;
        }

        throw error;
      }
    }

    if (!revokedInvitation) {
      return ApiResponse.conflict(res, 'Please try again. The invitation was updated by another request.');
    }

    await auditLog(authUser.id, 'INVITATION_REVOKE', 'EventInvitation', revokedInvitation.id, {
      eventId: revokedInvitation.eventId,
      inviteeUserId: revokedInvitation.inviteeUserId,
      inviteeEmail: revokedInvitation.inviteeEmail,
    });

    void sendInvitationWithdrawalEmail(revokedInvitation);

    return ApiResponse.success(res, { success: true });
  } catch (error) {
    logger.error('Failed to revoke invitation', {
      invitationId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to revoke invitation');
  }
});

// POST /api/invitations/:id/resend
invitationsRouter.post('/:id/resend', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const invitation = await prisma.eventInvitation.findUnique({
      where: { id: req.params.id },
      include: invitationDetailInclude,
    });

    if (!invitation) {
      return ApiResponse.notFound(res, 'Invitation not found');
    }

    const effectiveStatus = deriveInvitationStatus(invitation);
    if (effectiveStatus === 'EXPIRED') {
      return ApiResponse.error(res, {
        code: ErrorCodes.CONFLICT,
        message: 'This invitation has expired',
        status: 410,
      });
    }

    if (invitation.status === 'REVOKED') {
      return ApiResponse.conflict(res, 'Revoked invitations cannot be resent');
    }

    const now = new Date();
    const cooldownRemainingMs = getResendCooldownRemainingMs(invitation.lastEmailResentAt, now);
    if (cooldownRemainingMs > 0) {
      const retryAfterSeconds = getRetryAfterSeconds(cooldownRemainingMs);
      const nextAllowedAt = new Date(now.getTime() + cooldownRemainingMs);
      res.setHeader('Retry-After', String(retryAfterSeconds));

      return ApiResponse.error(res, {
        code: ErrorCodes.RATE_LIMITED,
        message: `Please wait ${retryAfterSeconds}s before resending this invitation email`,
        details: {
          retryAfterSeconds,
          nextAllowedAt: nextAllowedAt.toISOString(),
        },
        status: 429,
      });
    }

    const attemptedAt = now;
    const sent = await emailService.sendEventInvitation(invitation);
    const updatedInvitation = await prisma.eventInvitation.update({
      where: { id: invitation.id },
      data: {
        lastEmailResentAt: attemptedAt,
        ...(sent ? {
          emailSent: true,
          emailSentAt: attemptedAt,
        } : {}),
      },
      include: invitationDetailInclude,
    });

    await auditLog(authUser.id, 'INVITATION_RESEND', 'EventInvitation', invitation.id, {
      eventId: invitation.eventId,
      sent,
    });

    return ApiResponse.success(res, serializeInvitation(updatedInvitation));
  } catch (error) {
    logger.error('Failed to resend invitation email', {
      invitationId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to resend invitation email');
  }
});

// POST /api/invitations/:id/accept
invitationsRouter.post('/:id/accept', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    let result:
      | {
          invitation: InvitationRecord;
          registration: { id: string; attendanceToken: string; eventId: string };
        }
      | null = null;

    for (let attempt = 0; attempt < INVITATION_TRANSACTION_RETRIES; attempt += 1) {
      const registrationId = randomUUID();
      const respondedAt = new Date();

      try {
        result = await prisma.$transaction(async (tx) => {
          const invitation = await tx.eventInvitation.findUnique({
            where: { id: req.params.id },
            include: invitationDetailInclude,
          });

          if (!invitation) {
            throw new InvitationHttpError(404, 'Invitation not found');
          }

          if (!matchesInvitationInvitee(invitation, authUser)) {
            throw new InvitationHttpError(403, 'You are not allowed to accept this invitation');
          }

          if (invitation.status === 'REVOKED') {
            throw new InvitationHttpError(409, 'This invitation has been revoked');
          }

          if (deriveInvitationStatus(invitation) === 'EXPIRED') {
            throw new InvitationHttpError(410, 'This invitation has expired');
          }

          const user = await loadInvitableUserById(tx, authUser.id);
          if (!user) {
            throw new InvitationHttpError(404, 'Authenticated user not found');
          }

          if (!isVerifiedOrInternalInvitee(user)) {
            throw new InvitationHttpError(403, 'Your network profile must be verified before accepting this invitation');
          }

          const existingRegistration = await tx.eventRegistration.findUnique({
            where: {
              userId_eventId: {
                userId: authUser.id,
                eventId: invitation.eventId,
              },
            },
            select: {
              id: true,
              eventId: true,
              attendanceToken: true,
              registrationType: true,
            },
          });

          if (existingRegistration?.registrationType === RegistrationType.PARTICIPANT) {
            throw new InvitationHttpError(409, 'You are already registered as a participant for this event');
          }

          if (existingRegistration?.registrationType === RegistrationType.GUEST) {
            const syncedRegistration = existingRegistration.attendanceToken
              ? existingRegistration
              : await tx.eventRegistration.update({
                  where: { id: existingRegistration.id },
                  data: {
                    attendanceToken: generateAttendanceToken(authUser.id, invitation.eventId, existingRegistration.id),
                  },
                  select: {
                    id: true,
                    eventId: true,
                    attendanceToken: true,
                    registrationType: true,
                  },
                });

            const syncedInvitation = await tx.eventInvitation.update({
              where: { id: invitation.id },
              data: {
                status: 'ACCEPTED',
                respondedAt,
                inviteeUserId: authUser.id,
                ...buildInviteeSnapshots(user),
                registrationId: syncedRegistration.id,
              },
              include: invitationDetailInclude,
            });

            return {
              invitation: syncedInvitation,
              registration: {
                id: syncedRegistration.id,
                attendanceToken: syncedRegistration.attendanceToken!,
                eventId: syncedRegistration.eventId,
              },
            };
          }

          const attendanceToken = generateAttendanceToken(authUser.id, invitation.eventId, registrationId);
          const createdRegistration = await tx.eventRegistration.create({
            data: {
              id: registrationId,
              userId: authUser.id,
              eventId: invitation.eventId,
              registrationType: RegistrationType.GUEST,
              attendanceToken,
            },
            select: {
              id: true,
              eventId: true,
              attendanceToken: true,
            },
          });

          const normalizedEventDays = Number.isInteger(invitation.event.eventDays) && invitation.event.eventDays > 0
            ? Math.min(invitation.event.eventDays, 10)
            : 1;
          const dayRows = Array.from({ length: normalizedEventDays }, (_, index) => ({
            registrationId: createdRegistration.id,
            dayNumber: index + 1,
            attended: false,
          }));
          await tx.dayAttendance.createMany({ data: dayRows });

          const updatedInvitation = await tx.eventInvitation.update({
            where: { id: invitation.id },
            data: {
              status: 'ACCEPTED',
              respondedAt,
              inviteeUserId: authUser.id,
              ...buildInviteeSnapshots(user),
              registrationId: createdRegistration.id,
            },
            include: invitationDetailInclude,
          });

          return {
            invitation: updatedInvitation,
            registration: {
              id: createdRegistration.id,
              attendanceToken: createdRegistration.attendanceToken!,
              eventId: createdRegistration.eventId,
            },
          };
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });

        break;
      } catch (error) {
        if (error instanceof InvitationHttpError) {
          return sendInvitationHttpError(res, error);
        }

        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < INVITATION_TRANSACTION_RETRIES - 1
        ) {
          await backoffDelay(attempt);
          continue;
        }

        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return ApiResponse.conflict(res, 'You are already registered for this event');
        }

        throw error;
      }
    }

    if (!result) {
      return ApiResponse.conflict(res, 'Please try again. The invitation was updated by another request.');
    }

    await auditLog(authUser.id, 'INVITATION_ACCEPT', 'EventInvitation', result.invitation.id, {
      eventId: result.invitation.eventId,
      registrationId: result.registration.id,
    });

    return ApiResponse.success(res, {
      invitation: serializeInvitation(result.invitation, { includeAttendanceToken: true }),
      registration: result.registration,
    });
  } catch (error) {
    logger.error('Failed to accept invitation', {
      invitationId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to accept invitation');
  }
});

// POST /api/invitations/:id/decline
invitationsRouter.post('/:id/decline', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    let invitation: InvitationRecord | null = null;

    for (let attempt = 0; attempt < INVITATION_TRANSACTION_RETRIES; attempt += 1) {
      try {
        invitation = await prisma.$transaction(async (tx) => {
          const existingInvitation = await tx.eventInvitation.findUnique({
            where: { id: req.params.id },
            include: invitationDetailInclude,
          });

          if (!existingInvitation) {
            throw new InvitationHttpError(404, 'Invitation not found');
          }

          if (!matchesInvitationInvitee(existingInvitation, authUser)) {
            throw new InvitationHttpError(403, 'You are not allowed to decline this invitation');
          }

          if (existingInvitation.status === 'REVOKED') {
            throw new InvitationHttpError(409, 'This invitation has been revoked');
          }

          if (deriveInvitationStatus(existingInvitation) === 'EXPIRED') {
            throw new InvitationHttpError(410, 'This invitation has expired');
          }

          await cleanupGuestRegistrationForInvitation(tx, existingInvitation, authUser.id);

          return tx.eventInvitation.update({
            where: { id: existingInvitation.id },
            data: {
              status: 'DECLINED',
              respondedAt: new Date(),
              inviteeUserId: authUser.id,
              registrationId: null,
            },
            include: invitationDetailInclude,
          });
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });

        break;
      } catch (error) {
        if (error instanceof InvitationHttpError) {
          return sendInvitationHttpError(res, error);
        }

        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < INVITATION_TRANSACTION_RETRIES - 1
        ) {
          await backoffDelay(attempt);
          continue;
        }

        throw error;
      }
    }

    if (!invitation) {
      return ApiResponse.conflict(res, 'Please try again. The invitation was updated by another request.');
    }

    await auditLog(authUser.id, 'INVITATION_DECLINE', 'EventInvitation', invitation.id, {
      eventId: invitation.eventId,
    });

    return ApiResponse.success(res, serializeInvitation(invitation, { includeAttendanceToken: true }));
  } catch (error) {
    if (error instanceof InvitationHttpError) {
      return sendInvitationHttpError(res, error);
    }

    logger.error('Failed to decline invitation', {
      invitationId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiResponse.internal(res, 'Failed to decline invitation');
  }
});
