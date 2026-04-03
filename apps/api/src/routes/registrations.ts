import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';
import { generateAttendanceToken } from '../utils/attendanceToken.js';
import { emailService } from '../utils/email.js';
import { logger } from '../utils/logger.js';
import { sanitizeEventRegistrationFields, validateRegistrationFieldSubmissions } from '../utils/eventRegistrationFields.js';
import { getRegistrationStatus } from '../utils/registrationStatus.js';

export const registrationsRouter = Router();

class RegistrationHttpError extends Error {
  status: number;
  responseBody: Record<string, unknown>;

  constructor(status: number, responseBody: Record<string, unknown>) {
    const message = responseBody.error && typeof responseBody.error === 'object'
      ? String((responseBody.error as { message?: unknown }).message || 'Registration failed')
      : 'Registration failed';
    super(message);
    this.status = status;
    this.responseBody = responseBody;
  }
}

const REGISTRATION_TRANSACTION_RETRIES = 3;

const isSchemaDriftError = (error: unknown): boolean => (
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022'
);

// Register for an event
registrationsRouter.post('/events/:eventId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { eventId } = req.params;
    const { additionalFields } = req.body ?? {};

    // --- TEAM REGISTRATION GATE ---
    // If this event requires team registration, block solo registration.
    // Users must use POST /api/teams/create or POST /api/teams/join instead.
    const eventForGate = await prisma.event.findUnique({
      where: { id: eventId },
      select: { teamRegistration: true },
    });
    if (eventForGate?.teamRegistration) {
      return res.status(400).json({
        success: false,
        error: { message: 'This event requires team registration. Please create or join a team instead.' },
      });
    }
    // --- END TEAM REGISTRATION GATE ---

    let registration:
      | {
          id: string;
          userId: string;
          eventId: string;
          timestamp: Date;
          customFieldResponses: Prisma.JsonValue | null;
          event: {
            id: string;
            title: string;
            startDate: Date;
            slug: string;
            location: string | null;
            imageUrl: string | null;
          };
        }
      | null = null;
    let eventTitle = '';
    let attendanceTokenValue: string | undefined;

    for (let attempt = 0; attempt < REGISTRATION_TRANSACTION_RETRIES; attempt += 1) {
      const registrationId = randomUUID();
      const attendanceToken = generateAttendanceToken(authUser.id, eventId, registrationId);
      try {
        const result = await prisma.$transaction(async (tx) => {
          const event = await tx.event.findUnique({
            where: { id: eventId },
            include: { _count: { select: { registrations: true } } },
          });

          if (!event) {
            throw new RegistrationHttpError(404, { success: false, error: { message: 'Event not found' } });
          }

          const now = new Date();
          const effectiveEventEnd = event.endDate ?? event.startDate;
          if (effectiveEventEnd < now) {
            throw new RegistrationHttpError(400, { success: false, error: { message: 'Cannot register for a past event' } });
          }

          if (event.registrationStartDate && now < event.registrationStartDate) {
            throw new RegistrationHttpError(400, { success: false, error: { message: 'Registration has not started yet' } });
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
            event._count.registrations,
            now
          );

          if (registrationStatus === 'closed') {
            throw new RegistrationHttpError(400, { success: false, error: { message: 'Registration has ended' } });
          }

          if (registrationStatus === 'full') {
            throw new RegistrationHttpError(400, { success: false, error: { message: 'Event is full' } });
          }

          const existing = await tx.eventRegistration.findUnique({
            where: { userId_eventId: { userId: authUser.id, eventId } },
            select: { id: true },
          });

          if (existing) {
            throw new RegistrationHttpError(400, { success: false, error: { message: 'Already registered for this event' } });
          }

          let customFieldResponses: Prisma.InputJsonValue | undefined;
          try {
            const registrationFields = sanitizeEventRegistrationFields(event.registrationFields);
            if (registrationFields.length > 0) {
              const validation = validateRegistrationFieldSubmissions(registrationFields, additionalFields);
              if (validation.errors.length > 0) {
                throw new RegistrationHttpError(400, {
                  success: false,
                  error: {
                    message: 'Additional registration details required',
                    details: validation.errors,
                  },
                  data: {
                    requiredFields: registrationFields,
                  },
                });
              }
              customFieldResponses = validation.responses.length > 0
                ? (validation.responses as unknown as Prisma.InputJsonValue)
                : undefined;
            }
          } catch (validationError) {
            if (validationError instanceof RegistrationHttpError) {
              throw validationError;
            }
            throw new RegistrationHttpError(400, {
              success: false,
              error: {
                message: validationError instanceof Error ? validationError.message : 'Invalid registration fields',
              },
            });
          }

          const createdRegistration = await tx.eventRegistration.create({
            data: { id: registrationId, userId: authUser.id, eventId, customFieldResponses, attendanceToken },
            select: {
              id: true,
              userId: true,
              eventId: true,
              timestamp: true,
              customFieldResponses: true,
              event: { select: { id: true, title: true, startDate: true, slug: true, location: true, imageUrl: true } },
            },
          });

          return { createdRegistration, eventTitle: event.title, attendanceToken };
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });

        registration = result.createdRegistration;
        eventTitle = result.eventTitle;
        attendanceTokenValue = result.attendanceToken;
        break;
      } catch (error) {
        if (error instanceof RegistrationHttpError) {
          return res.status(error.status).json(error.responseBody);
        }

        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return res.status(409).json({ success: false, error: { message: 'Already registered for this event' } });
        }

        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < REGISTRATION_TRANSACTION_RETRIES - 1
        ) {
          // Jittered exponential backoff to prevent thundering herd
          const baseMs = 50 * Math.pow(2, attempt);
          const jitter = Math.random() * baseMs;
          await new Promise(resolve => setTimeout(resolve, baseMs + jitter));
          continue;
        }

        throw error;
      }
    }

    if (!registration) {
      return res.status(409).json({ success: false, error: { message: 'Please try again. The event registration just changed.' } });
    }

    await auditLog(authUser.id, 'REGISTER', 'event', eventId, { eventTitle });

    // Send registration confirmation email (async, don't wait)
    if (authUser.email) {
      void sendRegistrationConfirmationEmail(
        authUser.email,
        authUser.name || 'Member',
        registration.event,
        attendanceTokenValue,
      );
    }

    res.status(201).json({
      success: true,
      data: registration,
      message: `Successfully registered for ${eventTitle}`,
    });
  } catch (error) {
    if (isSchemaDriftError(error)) {
      return res.status(500).json({
        success: false,
        error: { message: 'Database schema is out of date. Please apply latest migrations and retry.' },
      });
    }
    res.status(500).json({ success: false, error: { message: 'Failed to register' } });
  }
});

// Helper to send registration confirmation email
async function sendRegistrationConfirmationEmail(
  email: string,
  name: string,
  event: { title: string; startDate: Date; slug: string; location?: string | null; imageUrl?: string | null },
  attendanceToken?: string,
) {
  try {
    logger.info(`📧 Sending registration confirmation to ${email}...`);
    const sent = await emailService.sendEventRegistration(
      email,
      name,
      event.title,
      event.startDate,
      event.slug,
      event.location || undefined,
      event.imageUrl || undefined,
      attendanceToken,
    );
    if (!sent) {
      logger.warn('Registration confirmation email not sent', {
        email,
        eventSlug: event.slug,
      });
      return;
    }
    logger.info(`✅ Registration confirmation sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send registration email', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Unregister from an event
registrationsRouter.delete('/events/:eventId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { eventId } = req.params;

    const eventTitle = await prisma.$transaction(async (tx) => {
      const registration = await tx.eventRegistration.findUnique({
        where: { userId_eventId: { userId: authUser.id, eventId } },
        select: {
          id: true,
          event: { select: { title: true, startDate: true } },
        },
      });

      if (!registration) {
        throw new RegistrationHttpError(404, { success: false, error: { message: 'Not registered for this event' } });
      }

      if (registration.event.startDate < new Date()) {
        throw new RegistrationHttpError(400, { success: false, error: { message: 'Cannot unregister from an event that has already started' } });
      }

      const teamMembership = await tx.eventTeamMember.findUnique({
        where: { registrationId: registration.id },
        include: {
          team: { select: { leaderId: true } },
        },
      });

      if (teamMembership?.team.leaderId === authUser.id) {
        throw new RegistrationHttpError(400, {
          success: false,
          error: { message: 'You are the team leader. Transfer leadership or dissolve the team before cancelling your registration.' },
        });
      }

      if (teamMembership) {
        await tx.eventTeamMember.delete({
          where: { id: teamMembership.id },
        });
      }

      await tx.eventRegistration.delete({
        where: { id: registration.id },
      });

      return registration.event.title;
    });

    await auditLog(authUser.id, 'UNREGISTER', 'event', eventId, { eventTitle });

    res.json({ success: true, message: `Successfully unregistered from ${eventTitle}` });
  } catch (error) {
    if (error instanceof RegistrationHttpError) {
      return res.status(error.status).json(error.responseBody);
    }
    if (isSchemaDriftError(error)) {
      return res.status(500).json({
        success: false,
        error: { message: 'Database schema is out of date. Please apply latest migrations and retry.' },
      });
    }
    res.status(500).json({ success: false, error: { message: 'Failed to unregister' } });
  }
});

// Get user's registrations
registrationsRouter.get('/my', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    const registrations = await prisma.eventRegistration.findMany({
      where: { userId: authUser.id },
      select: {
        id: true,
        userId: true,
        eventId: true,
        timestamp: true,
        customFieldResponses: true,
        attendanceToken: true,
        attended: true,
        scannedAt: true,
        manualOverride: true,
        event: {
          select: {
            id: true,
            title: true,
            description: true,
            startDate: true,
            endDate: true,
            location: true,
            venue: true,
            status: true,
            imageUrl: true,
            slug: true,
            capacity: true,
            eventType: true,
            prerequisites: true,
            teamRegistration: true,
            teamMinSize: true,
            teamMaxSize: true,
            _count: { select: { registrations: true } },
          },
        },
      },
      orderBy: { timestamp: 'desc' },
    });

    res.json({ success: true, data: registrations });
  } catch (error) {
    if (isSchemaDriftError(error)) {
      return res.status(500).json({
        success: false,
        error: { message: 'Database schema is out of date. Please apply latest migrations and retry.' },
      });
    }
    res.status(500).json({ success: false, error: { message: 'Failed to fetch registrations' } });
  }
});

// Check registration status
registrationsRouter.get('/events/:eventId/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const { eventId } = req.params;

    const registration = await prisma.eventRegistration.findUnique({
      where: { userId_eventId: { userId: authUser.id, eventId } },
      select: { timestamp: true },
    });

    res.json({
      success: true,
      data: { isRegistered: !!registration, registeredAt: registration?.timestamp || null },
    });
  } catch (error) {
    if (isSchemaDriftError(error)) {
      return res.status(500).json({
        success: false,
        error: { message: 'Database schema is out of date. Please apply latest migrations and retry.' },
      });
    }
    res.status(500).json({ success: false, error: { message: 'Failed to check status' } });
  }
});
