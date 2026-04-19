import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { Prisma, RegistrationType } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ApiResponse, ErrorCodes } from '../utils/response.js';
import { sanitizeText } from '../utils/sanitize.js';
import { auditLog } from '../utils/audit.js';
import { logger } from '../utils/logger.js';
import { emailService } from '../utils/email.js';
import { getRegistrationStatus } from '../utils/registrationStatus.js';
import { generateAttendanceToken } from '../utils/attendanceToken.js';
import { sanitizeEventRegistrationFields, validateRegistrationFieldSubmissions } from '../utils/eventRegistrationFields.js';

export const teamsRouter = Router();

const TEAM_TRANSACTION_RETRIES = 3;
const MAX_CUSTOM_FIELD_COUNT = 50;

// Generate an 8-character uppercase hex invite code
function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Jittered exponential backoff delay
async function backoffDelay(attempt: number): Promise<void> {
  const baseMs = 50 * Math.pow(2, attempt);
  const jitter = Math.random() * baseMs;
  await new Promise(resolve => setTimeout(resolve, baseMs + jitter));
}

// Validation schemas
const createTeamSchema = z.object({
  eventId: z.string().uuid(),
  teamName: z.string().min(1, 'Team name is required').max(100, 'Team name must be 100 characters or less'),
  customFieldResponses: z.unknown().optional(),
});

const joinTeamSchema = z.object({
  inviteCode: z.string().length(8, 'Invite code must be 8 characters'),
  customFieldResponses: z.unknown().optional(),
});

const transferLeadershipSchema = z.object({
  newLeaderId: z.string().uuid('Invalid user ID'),
});

// Rate limiter for join endpoint (brute-force protection)
const joinRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // 15 join attempts per 15 minutes per IP
  message: { success: false, error: { message: 'Too many join attempts. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// Helper to validate event is open for registration
function validateEventForRegistration(
  event: {
    status: string;
    startDate: Date;
    endDate: Date | null;
    registrationStartDate: Date | null;
    registrationEndDate: Date | null;
    allowLateRegistration: boolean;
    capacity: number | null;
    teamRegistration: boolean;
  },
  currentRegistrationCount: number,
  now: Date
): { valid: true } | { valid: false; status: number; message: string } {
  if (!event.teamRegistration) {
    return { valid: false, status: 400, message: 'This event does not support team registration' };
  }

  if (event.status === 'PAST') {
    return { valid: false, status: 400, message: 'Event has ended' };
  }

  if (event.registrationStartDate && now < event.registrationStartDate) {
    return { valid: false, status: 400, message: 'Registration has not started yet' };
  }

  const registrationStatus = getRegistrationStatus(
    {
      startDate: event.startDate,
      endDate: event.endDate,
      registrationStartDate: event.registrationStartDate,
      registrationEndDate: event.registrationEndDate,
      allowLateRegistration: event.allowLateRegistration,
      capacity: event.capacity,
    },
    currentRegistrationCount,
    now
  );

  if (registrationStatus === 'closed') {
    return { valid: false, status: 400, message: 'Registration has closed' };
  }

  if (registrationStatus === 'full') {
    return { valid: false, status: 409, message: 'Event is at full capacity' };
  }

  return { valid: true };
}

function normalizeCustomFieldResponses(input: unknown): Array<{ fieldId: string; value: unknown }> {
  if (Array.isArray(input)) {
    const normalized = input
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
      .map((entry) => ({
        fieldId: typeof entry.fieldId === 'string' ? entry.fieldId : '',
        value: entry.value,
      }))
      .filter((entry) => entry.fieldId.trim().length > 0);

    if (normalized.length > MAX_CUSTOM_FIELD_COUNT) {
      throw {
        status: 400,
        message: `Too many custom fields. Maximum allowed is ${MAX_CUSTOM_FIELD_COUNT}.`,
      };
    }

    return normalized;
  }

  if (input && typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>);
    if (entries.length > MAX_CUSTOM_FIELD_COUNT) {
      throw {
        status: 400,
        message: `Too many custom fields. Maximum allowed is ${MAX_CUSTOM_FIELD_COUNT}.`,
      };
    }
    return entries.map(([fieldId, value]) => ({ fieldId, value }));
  }

  return [];
}

function validateTeamRegistrationFields(eventRegistrationFields: unknown, submissions: unknown): Prisma.InputJsonValue | undefined {
  const registrationFields = sanitizeEventRegistrationFields(eventRegistrationFields);
  if (registrationFields.length === 0) {
    return undefined;
  }

  const validation = validateRegistrationFieldSubmissions(
    registrationFields,
    normalizeCustomFieldResponses(submissions),
  );

  if (validation.errors.length > 0) {
    throw {
      status: 400,
      message: 'Additional registration details required',
      details: validation.errors,
    };
  }

  return validation.responses.length > 0
    ? (validation.responses as unknown as Prisma.InputJsonValue)
    : undefined;
}

async function sendTeamRegistrationConfirmationEmail(args: {
  email: string;
  name: string;
  teamName: string;
  teamRole: 'LEADER' | 'MEMBER';
  event: {
    title: string;
    startDate: Date;
    slug: string;
    location: string | null;
    imageUrl: string | null;
  };
  attendanceToken?: string;
}): Promise<void> {
  try {
    logger.info('📧 Sending team registration confirmation email', {
      email: args.email,
      teamName: args.teamName,
      teamRole: args.teamRole,
      eventSlug: args.event.slug,
    });

    const sent = await emailService.sendEventRegistration(
      args.email,
      args.name,
      args.event.title,
      args.event.startDate,
      args.event.slug,
      args.event.location || undefined,
      args.event.imageUrl || undefined,
      args.attendanceToken,
      {
        teamName: args.teamName,
        teamRole: args.teamRole,
      },
    );

    if (!sent) {
      logger.warn('Team registration email not sent', {
        email: args.email,
        teamName: args.teamName,
        eventSlug: args.event.slug,
      });
      return;
    }

    logger.info('✅ Team registration confirmation sent', {
      email: args.email,
      teamName: args.teamName,
      teamRole: args.teamRole,
      eventSlug: args.event.slug,
    });
  } catch (error) {
    logger.error('Failed to send team registration email', {
      email: args.email,
      teamName: args.teamName,
      teamRole: args.teamRole,
      eventSlug: args.event.slug,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ========================================
// POST /api/teams/create - Create team + self-register as leader
// ========================================
teamsRouter.post('/create', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req)!;
    const parseResult = createTeamSchema.safeParse(req.body);

    if (!parseResult.success) {
      return ApiResponse.error(res, {
        code: ErrorCodes.VALIDATION_ERROR,
        message: parseResult.error.errors[0]?.message || 'Invalid request data',
        status: 400,
      });
    }

    const { eventId, teamName: rawTeamName, customFieldResponses } = parseResult.data;
    const teamName = sanitizeText(rawTeamName).trim();

    if (!teamName) {
      return ApiResponse.error(res, { code: ErrorCodes.VALIDATION_ERROR, message: 'Team name cannot be empty', status: 400 });
    }

    let result: {
      team: {
        id: string;
        teamName: string;
        inviteCode: string;
        leaderId: string;
        isLocked: boolean;
        createdAt: Date;
        members: Array<{
          id: string;
          userId: string;
          role: string;
          joinedAt: Date;
          user: { id: string; name: string; email: string; avatar: string | null };
        }>;
      };
      registrationId: string;
      event: {
        teamMinSize: number;
        teamMaxSize: number;
        title: string;
        startDate: Date;
        slug: string;
        location: string | null;
        imageUrl: string | null;
      };
    } | null = null;

    for (let attempt = 0; attempt < TEAM_TRANSACTION_RETRIES; attempt += 1) {
      try {
        result = await prisma.$transaction(async (tx) => {
          // Capacity check: only count PARTICIPANT registrations. GUEST invitations do not consume capacity.
          const event = await tx.event.findUnique({
            where: { id: eventId },
            include: {
              _count: {
                select: {
                  registrations: {
                    where: { registrationType: RegistrationType.PARTICIPANT },
                  },
                },
              },
            },
          });

          if (!event) {
            throw { status: 404, message: 'Event not found' };
          }

          const now = new Date();
          const validation = validateEventForRegistration(event, event._count.registrations, now);
          if (!validation.valid) {
            throw { status: validation.status, message: validation.message };
          }

          // Check user not already registered
          const existing = await tx.eventRegistration.findUnique({
            where: { userId_eventId: { userId: user.id, eventId } },
            select: { id: true },
          });

          if (existing) {
            throw { status: 409, message: 'You are already registered for this event' };
          }

          let validatedCustomFieldResponses: Prisma.InputJsonValue | undefined;
          try {
            validatedCustomFieldResponses = validateTeamRegistrationFields(event.registrationFields, customFieldResponses);
          } catch (validationError) {
            if (validationError && typeof validationError === 'object' && 'status' in validationError && 'message' in validationError) {
              throw validationError;
            }
            throw {
              status: 400,
              message: validationError instanceof Error ? validationError.message : 'Invalid registration fields',
            };
          }

          // Generate unique invite code
          let inviteCode = generateInviteCode();
          for (let i = 0; i < 5; i++) {
            const existingCode = await tx.eventTeam.findUnique({
              where: { inviteCode },
              select: { id: true },
            });
            if (!existingCode) break;
            inviteCode = generateInviteCode();
            if (i === 4) {
              throw { status: 500, message: 'Failed to generate unique invite code. Please try again.' };
            }
          }

          // Create registration
          const registration = await tx.eventRegistration.create({
            data: {
              userId: user.id,
              eventId,
              customFieldResponses: validatedCustomFieldResponses,
            },
          });

          // Create team
          const team = await tx.eventTeam.create({
            data: {
              eventId,
              teamName,
              inviteCode,
              leaderId: user.id,
            },
          });

          // Create team member (leader)
          await tx.eventTeamMember.create({
            data: {
              teamId: team.id,
              userId: user.id,
              registrationId: registration.id,
              role: 'LEADER',
            },
          });

          // Fetch complete team data
          const completeTeam = await tx.eventTeam.findUniqueOrThrow({
            where: { id: team.id },
            include: {
              members: {
                include: {
                  user: { select: { id: true, name: true, email: true, avatar: true } },
                },
              },
            },
          });

          return {
            team: completeTeam,
            registrationId: registration.id,
            event: {
              teamMinSize: event.teamMinSize,
              teamMaxSize: event.teamMaxSize,
              title: event.title,
              startDate: event.startDate,
              slug: event.slug,
              location: event.location,
              imageUrl: event.imageUrl,
            },
          };
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });

        break; // Success, exit retry loop
      } catch (error) {
        // Handle known errors
        if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
          const e = error as { status: number; message: string; details?: unknown };
          return ApiResponse.error(res, {
            code: e.status === 404 ? ErrorCodes.NOT_FOUND : ErrorCodes.VALIDATION_ERROR,
            message: e.message,
            status: e.status,
            details: e.details,
          });
        }

        // P2002: Unique constraint violation
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const target = error.meta?.target;
          if (Array.isArray(target) && target.includes('team_name') && target.includes('event_id')) {
            return ApiResponse.error(res, { code: ErrorCodes.CONFLICT, message: 'Team name already taken for this event', status: 409 });
          }
          if (Array.isArray(target) && target.includes('user_id') && target.includes('event_id')) {
            return ApiResponse.error(res, { code: ErrorCodes.CONFLICT, message: 'You are already registered for this event', status: 409 });
          }
          return ApiResponse.error(res, { code: ErrorCodes.CONFLICT, message: 'Registration conflict. Please try again.', status: 409 });
        }

        // P2034: Serialization failure - retry
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < TEAM_TRANSACTION_RETRIES - 1
        ) {
          await backoffDelay(attempt);
          continue;
        }

        throw error;
      }
    }

    if (!result) {
      return ApiResponse.error(res, { code: ErrorCodes.CONFLICT, message: 'Please try again. The event registration just changed.', status: 409 });
    }

    let attendanceTokenValue: string | undefined;
    // Generate attendance QR token (outside transaction, non-blocking)
    try {
      attendanceTokenValue = generateAttendanceToken(user.id, eventId, result.registrationId);
      await prisma.eventRegistration.update({
        where: { id: result.registrationId },
        data: { attendanceToken: attendanceTokenValue },
      });
    } catch (tokenErr) {
      logger.warn('Failed to generate attendance token for team create', { registrationId: result.registrationId, error: tokenErr });
    }

    if (user.email) {
      void sendTeamRegistrationConfirmationEmail({
        email: user.email,
        name: user.name || 'Member',
        teamName: result.team.teamName,
        teamRole: 'LEADER',
        event: {
          title: result.event.title,
          startDate: result.event.startDate,
          slug: result.event.slug,
          location: result.event.location,
          imageUrl: result.event.imageUrl,
        },
        attendanceToken: attendanceTokenValue,
      });
    }

    await auditLog(user.id, 'TEAM_CREATE', 'EventTeam', result.team.id, {
      eventId,
      teamName: result.team.teamName,
    });

    return res.status(201).json({
      success: true,
      data: {
        team: {
          ...result.team,
          isComplete: result.team.members.length >= result.event.teamMinSize,
          isFull: result.team.members.length >= result.event.teamMaxSize,
        },
        event: result.event,
      },
      message: 'Team created successfully',
    });
  } catch (error) {
    logger.error('Failed to create team', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to create team', status: 500 });
  }
});

// ========================================
// POST /api/teams/join - Join team via invite code
// ========================================
teamsRouter.post('/join', authMiddleware, joinRateLimiter, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req)!;
    const parseResult = joinTeamSchema.safeParse(req.body);

    if (!parseResult.success) {
      return ApiResponse.error(res, {
        code: ErrorCodes.VALIDATION_ERROR,
        message: parseResult.error.errors[0]?.message || 'Invalid request data',
        status: 400,
      });
    }

    const { inviteCode: rawInviteCode, customFieldResponses } = parseResult.data;
    const inviteCode = rawInviteCode.toUpperCase().trim();

    let result: {
      team: {
        id: string;
        eventId: string;
        teamName: string;
        leaderId: string;
        isLocked: boolean;
        createdAt: Date;
        members: Array<{
          id: string;
          userId: string;
          role: string;
          joinedAt: Date;
          user: { id: string; name: string; email: string; avatar: string | null };
        }>;
      };
      registrationId: string;
      eventId: string;
      event: {
        teamMinSize: number;
        teamMaxSize: number;
        title: string;
        startDate: Date;
        slug: string;
        location: string | null;
        imageUrl: string | null;
      };
    } | null = null;

    for (let attempt = 0; attempt < TEAM_TRANSACTION_RETRIES; attempt += 1) {
      try {
        result = await prisma.$transaction(async (tx) => {
          const team = await tx.eventTeam.findUnique({
            where: { inviteCode },
            include: {
              event: {
                // Capacity check: only count PARTICIPANT registrations. GUEST invitations do not consume capacity.
                include: {
                  _count: {
                    select: {
                      registrations: {
                        where: { registrationType: RegistrationType.PARTICIPANT },
                      },
                    },
                  },
                },
              },
              members: true,
              leader: { select: { id: true, name: true } },
            },
          });

          if (!team) {
            throw { status: 404, message: 'Invalid invite code' };
          }

          if (team.isLocked) {
            throw { status: 403, message: 'This team is locked and not accepting new members' };
          }

          if (team.members.length >= team.event.teamMaxSize) {
            throw { status: 409, message: 'Team is full' };
          }

          const now = new Date();
          const validation = validateEventForRegistration(team.event, team.event._count.registrations, now);
          if (!validation.valid) {
            throw { status: validation.status, message: validation.message };
          }

          // Check user not already registered
          const existing = await tx.eventRegistration.findUnique({
            where: { userId_eventId: { userId: user.id, eventId: team.eventId } },
            select: { id: true },
          });

          if (existing) {
            throw { status: 409, message: 'You are already registered for this event' };
          }

          let validatedCustomFieldResponses: Prisma.InputJsonValue | undefined;
          try {
            validatedCustomFieldResponses = validateTeamRegistrationFields(team.event.registrationFields, customFieldResponses);
          } catch (validationError) {
            if (validationError && typeof validationError === 'object' && 'status' in validationError && 'message' in validationError) {
              throw validationError;
            }
            throw {
              status: 400,
              message: validationError instanceof Error ? validationError.message : 'Invalid registration fields',
            };
          }

          // Create registration
          const registration = await tx.eventRegistration.create({
            data: {
              userId: user.id,
              eventId: team.eventId,
              customFieldResponses: validatedCustomFieldResponses,
            },
          });

          // Create team member
          await tx.eventTeamMember.create({
            data: {
              teamId: team.id,
              userId: user.id,
              registrationId: registration.id,
              role: 'MEMBER',
            },
          });

          // Fetch complete team data
          const completeTeam = await tx.eventTeam.findUniqueOrThrow({
            where: { id: team.id },
            include: {
              members: {
                include: {
                  user: { select: { id: true, name: true, email: true, avatar: true } },
                },
              },
            },
          });

          return {
            team: completeTeam,
            registrationId: registration.id,
            eventId: team.eventId,
            event: {
              teamMinSize: team.event.teamMinSize,
              teamMaxSize: team.event.teamMaxSize,
              title: team.event.title,
              startDate: team.event.startDate,
              slug: team.event.slug,
              location: team.event.location,
              imageUrl: team.event.imageUrl,
            },
          };
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });

        break;
      } catch (error) {
        if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
          const e = error as { status: number; message: string; details?: unknown };
          return ApiResponse.error(res, {
            code: e.status === 404 ? ErrorCodes.NOT_FOUND : ErrorCodes.VALIDATION_ERROR,
            message: e.message,
            status: e.status,
            details: e.details,
          });
        }

        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const target = error.meta?.target;
          if (Array.isArray(target) && target.includes('team_id') && target.includes('user_id')) {
            return ApiResponse.error(res, { code: ErrorCodes.CONFLICT, message: 'You are already in this team', status: 409 });
          }
          if (Array.isArray(target) && target.includes('user_id') && target.includes('event_id')) {
            return ApiResponse.error(res, { code: ErrorCodes.CONFLICT, message: 'You are already registered for this event', status: 409 });
          }
          return ApiResponse.error(res, { code: ErrorCodes.CONFLICT, message: 'Registration conflict. Please try again.', status: 409 });
        }

        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < TEAM_TRANSACTION_RETRIES - 1
        ) {
          await backoffDelay(attempt);
          continue;
        }

        throw error;
      }
    }

    if (!result) {
      return ApiResponse.error(res, { code: ErrorCodes.CONFLICT, message: 'Please try again. The team membership just changed.', status: 409 });
    }

    let attendanceTokenValue: string | undefined;
    // Generate attendance QR token (outside transaction, non-blocking)
    try {
      attendanceTokenValue = generateAttendanceToken(user.id, result.eventId, result.registrationId);
      await prisma.eventRegistration.update({
        where: { id: result.registrationId },
        data: { attendanceToken: attendanceTokenValue },
      });
    } catch (tokenErr) {
      logger.warn('Failed to generate attendance token for team join', { registrationId: result.registrationId, error: tokenErr });
    }

    if (user.email) {
      void sendTeamRegistrationConfirmationEmail({
        email: user.email,
        name: user.name || 'Member',
        teamName: result.team.teamName,
        teamRole: 'MEMBER',
        event: {
          title: result.event.title,
          startDate: result.event.startDate,
          slug: result.event.slug,
          location: result.event.location,
          imageUrl: result.event.imageUrl,
        },
        attendanceToken: attendanceTokenValue,
      });
    }

    await auditLog(user.id, 'TEAM_JOIN', 'EventTeam', result.team.id, {
      eventId: result.team.eventId,
      teamName: result.team.teamName,
    });

    return ApiResponse.success(res, {
      team: {
        ...result.team,
        isComplete: result.team.members.length >= result.event.teamMinSize,
        isFull: result.team.members.length >= result.event.teamMaxSize,
      },
      event: result.event,
      message: 'Joined team successfully',
    });
  } catch (error) {
    logger.error('Failed to join team', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to join team', status: 500 });
  }
});

// ========================================
// GET /api/teams/my-team/:eventId - Get user's team for an event
// ========================================
teamsRouter.get('/my-team/:eventId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req)!;
    const { eventId } = req.params;

    const membership = await prisma.eventTeamMember.findFirst({
      where: {
        userId: user.id,
        team: { eventId },
      },
      include: {
        team: {
          include: {
            members: {
              include: {
                user: { select: { id: true, name: true, email: true, avatar: true } },
              },
              orderBy: { joinedAt: 'asc' },
            },
            event: { select: { teamMinSize: true, teamMaxSize: true } },
          },
        },
      },
    });

    if (!membership) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'You are not part of a team for this event', status: 404 });
    }

    const { team } = membership;
    const isLeader = team.leaderId === user.id;

    return ApiResponse.success(res, {
      id: team.id,
      eventId: team.eventId,
      teamName: team.teamName,
      inviteCode: isLeader ? team.inviteCode : undefined, // Only leader sees invite code
      leaderId: team.leaderId,
      isLocked: team.isLocked,
      createdAt: team.createdAt,
      members: team.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        user: m.user,
      })),
      isLeader,
      isComplete: team.members.length >= team.event.teamMinSize,
      isFull: team.members.length >= team.event.teamMaxSize,
      teamMinSize: team.event.teamMinSize,
      teamMaxSize: team.event.teamMaxSize,
    });
  } catch (error) {
    logger.error('Failed to get team', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to get team', status: 500 });
  }
});

// ========================================
// PATCH /api/teams/:teamId/lock - Toggle team lock (leader only)
// ========================================
teamsRouter.patch('/:teamId/lock', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req)!;
    const { teamId } = req.params;

    const team = await prisma.eventTeam.findUnique({
      where: { id: teamId },
      select: { id: true, leaderId: true, isLocked: true, teamName: true, eventId: true },
    });

    if (!team) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'Team not found', status: 404 });
    }

    if (team.leaderId !== user.id) {
      return ApiResponse.error(res, { code: ErrorCodes.FORBIDDEN, message: 'Only the team leader can lock/unlock the team', status: 403 });
    }

    // Use atomic update with leaderId in WHERE to prevent race condition
    // (leadership could transfer between check and update)
    const updated = await prisma.eventTeam.updateMany({
      where: { id: teamId, leaderId: user.id },
      data: { isLocked: !team.isLocked },
    });

    if (updated.count === 0) {
      return ApiResponse.error(res, { code: ErrorCodes.FORBIDDEN, message: 'You are no longer the team leader', status: 403 });
    }

    const newIsLocked = !team.isLocked;
    await auditLog(user.id, newIsLocked ? 'TEAM_LOCKED' : 'TEAM_UNLOCKED', 'EventTeam', teamId, {
      teamName: team.teamName,
      eventId: team.eventId,
    });

    return ApiResponse.success(res, { isLocked: newIsLocked });
  } catch (error) {
    logger.error('Failed to toggle team lock', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to toggle team lock', status: 500 });
  }
});

// ========================================
// DELETE /api/teams/:teamId/members/:userId - Remove a member (leader only)
// ========================================
teamsRouter.delete('/:teamId/members/:userId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req)!;
    const { teamId, userId: targetUserId } = req.params;

    const team = await prisma.eventTeam.findUnique({
      where: { id: teamId },
      include: { members: true },
    });

    if (!team) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'Team not found', status: 404 });
    }

    if (team.leaderId !== user.id) {
      return ApiResponse.error(res, { code: ErrorCodes.FORBIDDEN, message: 'Only the team leader can remove members', status: 403 });
    }

    if (targetUserId === user.id) {
      return ApiResponse.error(res, { code: ErrorCodes.VALIDATION_ERROR, message: 'Leaders cannot remove themselves. Use dissolve or transfer leadership.', status: 400 });
    }

    const member = team.members.find((m) => m.userId === targetUserId);
    if (!member) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'User is not a member of this team', status: 404 });
    }

    await prisma.$transaction([
      prisma.eventTeamMember.delete({ where: { id: member.id } }),
      prisma.eventRegistration.delete({ where: { id: member.registrationId } }),
    ]);

    await auditLog(user.id, 'TEAM_MEMBER_REMOVED', 'EventTeamMember', member.id, {
      teamId,
      removedUserId: targetUserId,
      teamName: team.teamName,
    });

    return ApiResponse.success(res, { message: 'Member removed' });
  } catch (error) {
    logger.error('Failed to remove team member', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to remove member', status: 500 });
  }
});

// ========================================
// POST /api/teams/:teamId/leave - Leave team (member only, NOT leader)
// ========================================
teamsRouter.post('/:teamId/leave', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req)!;
    const { teamId } = req.params;

    const team = await prisma.eventTeam.findUnique({
      where: { id: teamId },
      include: { members: true },
    });

    if (!team) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'Team not found', status: 404 });
    }

    if (team.leaderId === user.id) {
      return ApiResponse.error(res, { code: ErrorCodes.VALIDATION_ERROR, message: 'Team leader cannot leave. Transfer leadership first or dissolve the team.', status: 400 });
    }

    const member = team.members.find((m) => m.userId === user.id);
    if (!member) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'You are not a member of this team', status: 404 });
    }

    await prisma.$transaction([
      prisma.eventTeamMember.delete({ where: { id: member.id } }),
      prisma.eventRegistration.delete({ where: { id: member.registrationId } }),
    ]);

    await auditLog(user.id, 'TEAM_LEAVE', 'EventTeam', teamId, { teamName: team.teamName });

    return ApiResponse.success(res, { message: 'Left team successfully' });
  } catch (error) {
    logger.error('Failed to leave team', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to leave team', status: 500 });
  }
});

// ========================================
// POST /api/teams/:teamId/transfer-leadership - Transfer leader role
// ========================================
teamsRouter.post('/:teamId/transfer-leadership', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req)!;
    const { teamId } = req.params;

    const parseResult = transferLeadershipSchema.safeParse(req.body);
    if (!parseResult.success) {
      return ApiResponse.error(res, {
        code: ErrorCodes.VALIDATION_ERROR,
        message: parseResult.error.errors[0]?.message || 'Invalid request data',
        status: 400,
      });
    }

    const { newLeaderId } = parseResult.data;

    const team = await prisma.eventTeam.findUnique({
      where: { id: teamId },
      include: { members: true },
    });

    if (!team) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'Team not found', status: 404 });
    }

    if (team.leaderId !== user.id) {
      return ApiResponse.error(res, { code: ErrorCodes.FORBIDDEN, message: 'Only the current leader can transfer leadership', status: 403 });
    }

    const newLeaderMember = team.members.find((m) => m.userId === newLeaderId);
    if (!newLeaderMember) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'Target user is not a member of this team', status: 404 });
    }

    const oldLeaderMember = team.members.find((m) => m.userId === user.id);

    // Use interactive transaction with conditional update to prevent race condition
    // (leadership could be transferred by another request between check and update)
    const transferred = await prisma.$transaction(async (tx) => {
      // Atomic update that only succeeds if user is still leader
      const updateResult = await tx.eventTeam.updateMany({
        where: { id: teamId, leaderId: user.id },
        data: { leaderId: newLeaderId },
      });

      if (updateResult.count === 0) {
        // Leadership was transferred while we were checking
        return false;
      }

      await tx.eventTeamMember.update({
        where: { id: oldLeaderMember!.id },
        data: { role: 'MEMBER' },
      });
      await tx.eventTeamMember.update({
        where: { id: newLeaderMember.id },
        data: { role: 'LEADER' },
      });

      return true;
    });

    if (!transferred) {
      return ApiResponse.error(res, { code: ErrorCodes.FORBIDDEN, message: 'You are no longer the team leader', status: 403 });
    }

    await auditLog(user.id, 'TEAM_LEADERSHIP_TRANSFER', 'EventTeam', teamId, {
      teamName: team.teamName,
      newLeaderId,
    });

    return ApiResponse.success(res, { message: 'Leadership transferred' });
  } catch (error) {
    logger.error('Failed to transfer leadership', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to transfer leadership', status: 500 });
  }
});

// ========================================
// DELETE /api/teams/:teamId/dissolve - Dissolve entire team (leader only)
// ========================================
teamsRouter.delete('/:teamId/dissolve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req)!;
    const { teamId } = req.params;

    const team = await prisma.eventTeam.findUnique({
      where: { id: teamId },
      include: {
        members: { include: { registration: true } },
        event: { select: { status: true } },
      },
    });

    if (!team) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'Team not found', status: 404 });
    }

    if (team.leaderId !== user.id) {
      return ApiResponse.error(res, { code: ErrorCodes.FORBIDDEN, message: 'Only the team leader can dissolve the team', status: 403 });
    }

    const registrationIds = team.members.map((m) => m.registrationId);
    const memberCount = team.members.length;

    // Use interactive transaction with conditional delete to prevent race condition
    const dissolved = await prisma.$transaction(async (tx) => {
      // Delete team only if user is still leader (atomic check)
      const deleteResult = await tx.eventTeam.deleteMany({
        where: { id: teamId, leaderId: user.id },
      });

      if (deleteResult.count === 0) {
        // Leadership was transferred or team already deleted
        return false;
      }

      await tx.eventTeamMember.deleteMany({ where: { teamId } });
      await tx.eventRegistration.deleteMany({ where: { id: { in: registrationIds } } });
      return true;
    });

    if (!dissolved) {
      return ApiResponse.error(res, { code: ErrorCodes.FORBIDDEN, message: 'You are no longer the team leader', status: 403 });
    }

    await auditLog(user.id, 'TEAM_DISSOLVE', 'EventTeam', teamId, {
      teamName: team.teamName,
      eventId: team.eventId,
      memberCount,
    });

    return ApiResponse.success(res, { message: 'Team dissolved. All member registrations have been cancelled.' });
  } catch (error) {
    logger.error('Failed to dissolve team', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to dissolve team', status: 500 });
  }
});

// ========================================
// GET /api/teams/event/:eventId - List all teams for an event (ADMIN only)
// ========================================
teamsRouter.get('/event/:eventId', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { teamMinSize: true, teamMaxSize: true, teamRegistration: true },
    });

    if (!event) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'Event not found', status: 404 });
    }

    const teams = await prisma.eventTeam.findMany({
      where: { eventId },
      include: {
        leader: { select: { id: true, name: true, email: true, avatar: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true } },
            registration: { select: { id: true, timestamp: true, customFieldResponses: true } },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const teamsWithStatus = teams.map((team) => ({
      ...team,
      memberCount: team.members.length,
      isComplete: team.members.length >= event.teamMinSize,
      isFull: team.members.length >= event.teamMaxSize,
    }));

    return ApiResponse.success(res, {
      teams: teamsWithStatus,
      event: { teamMinSize: event.teamMinSize, teamMaxSize: event.teamMaxSize },
    });
  } catch (error) {
    logger.error('Failed to list teams', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to list teams', status: 500 });
  }
});

// ========================================
// PATCH /api/teams/:teamId/admin-lock - Admin force lock/unlock
// ========================================
teamsRouter.patch('/:teamId/admin-lock', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req)!;
    const { teamId } = req.params;

    const team = await prisma.eventTeam.findUnique({
      where: { id: teamId },
      select: { id: true, isLocked: true, teamName: true, eventId: true },
    });

    if (!team) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'Team not found', status: 404 });
    }

    const updated = await prisma.eventTeam.update({
      where: { id: teamId },
      data: { isLocked: !team.isLocked },
      select: { isLocked: true },
    });

    await auditLog(user.id, updated.isLocked ? 'TEAM_LOCKED' : 'TEAM_UNLOCKED', 'EventTeam', teamId, {
      teamName: team.teamName,
      eventId: team.eventId,
    });

    return ApiResponse.success(res, { isLocked: updated.isLocked });
  } catch (error) {
    logger.error('Failed to toggle team lock', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to toggle team lock', status: 500 });
  }
});

// ========================================
// DELETE /api/teams/:teamId/admin-dissolve - Admin force dissolve
// ========================================
teamsRouter.delete('/:teamId/admin-dissolve', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req)!;
    const { teamId } = req.params;

    const team = await prisma.eventTeam.findUnique({
      where: { id: teamId },
      include: {
        members: { include: { registration: true } },
      },
    });

    if (!team) {
      return ApiResponse.error(res, { code: ErrorCodes.NOT_FOUND, message: 'Team not found', status: 404 });
    }

    const registrationIds = team.members.map((m) => m.registrationId);
    const memberCount = team.members.length;

    await prisma.$transaction([
      prisma.eventTeamMember.deleteMany({ where: { teamId } }),
      prisma.eventTeam.delete({ where: { id: teamId } }),
      prisma.eventRegistration.deleteMany({ where: { id: { in: registrationIds } } }),
    ]);

    await auditLog(user.id, 'TEAM_DISSOLVED', 'EventTeam', teamId, {
      teamName: team.teamName,
      eventId: team.eventId,
      memberCount,
    });

    return ApiResponse.success(res, { message: 'Team dissolved by admin. All member registrations have been cancelled.' });
  } catch (error) {
    logger.error('Failed to dissolve team', { error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.error(res, { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to dissolve team', status: 500 });
  }
});
