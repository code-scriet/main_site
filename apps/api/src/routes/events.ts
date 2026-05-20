import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, optionalAuthMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditLog } from '../utils/audit.js';
import { EventStatus, Prisma, RegistrationType } from '@prisma/client';
import { generateSlug, generateUniqueSlug } from '../utils/slug.js';
import { emailService } from '../utils/email.js';
import { broadcastNotification } from '../utils/notifications.js';
import { logger } from '../utils/logger.js';
import { submitUrl } from '../utils/indexnow.js';
import { sanitizeEventRegistrationFields } from '../utils/eventRegistrationFields.js';
import { getRegistrationStatus } from '../utils/registrationStatus.js';
import { sanitizeHtml } from '../utils/sanitize.js';
import { normalizeTrustedVideoEmbedUrl } from '../utils/videoEmbed.js';
import { deriveInvitationStatus } from '../utils/invitationStatus.js';
import { isGuest, isParticipant, participantsOnly } from '../utils/registrationFilters.js';

export const eventsRouter = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GUEST_ROLE_PRIORITY: Record<string, number> = {
  'Chief Guest': 0,
  Speaker: 1,
  Judge: 2,
  'Special Guest': 3,
};

const optionalUrl = z.union([z.string().url('Must be a valid URL'), z.literal('')]).optional().nullable();
const optionalVideoUrl = z.union([z.string().trim().max(2000), z.literal('')]).optional().nullable().transform((value, ctx) => {
  if (value === undefined || value === null || value === '') {
    return value;
  }

  const normalized = normalizeTrustedVideoEmbedUrl(value);
  if (!normalized) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Video URL must be a supported YouTube, Vimeo, or Loom link',
    });
    return z.NEVER;
  }

  return normalized;
});

type EventValidationInput = {
  startDate: Date;
  endDate?: Date | null;
  registrationStartDate?: Date | null;
  registrationEndDate?: Date | null;
  allowLateRegistration?: boolean;
};

function getGuestRolePriority(role: string): number {
  return GUEST_ROLE_PRIORITY[role] ?? 100;
}

const validateEventTimeline = ({ startDate, endDate, registrationStartDate, registrationEndDate, allowLateRegistration = false }: EventValidationInput): string | null => {
  if (endDate && endDate < startDate) {
    return 'endDate cannot be before startDate';
  }

  if (registrationStartDate && registrationEndDate && registrationStartDate > registrationEndDate) {
    return 'registrationStartDate cannot be after registrationEndDate';
  }

  const eventEnd = endDate ?? startDate;
  if (registrationStartDate && registrationStartDate > eventEnd) {
    return 'registrationStartDate cannot be after event end date';
  }

  if (registrationEndDate) {
    const maxRegistrationEnd = allowLateRegistration ? eventEnd : startDate;
    if (registrationEndDate > maxRegistrationEnd) {
      return allowLateRegistration
        ? 'registrationEndDate cannot be after event end date when late registration is enabled'
        : 'registrationEndDate cannot be after event start date when late registration is disabled';
    }
  }

  return null;
};

const eventSchemaBase = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(20000),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  registrationStartDate: z.coerce.date().optional().nullable(),
  registrationEndDate: z.coerce.date().optional().nullable(),
  location: z.string().trim().max(300).optional().nullable(),
  venue: z.string().trim().max(300).optional().nullable(),
  eventType: z.string().trim().max(80).optional().nullable(),
  prerequisites: z.string().max(5000).optional().nullable(),
  capacity: z.coerce.number().int().min(1).max(100000).optional().nullable(),
  imageUrl: optionalUrl,
  status: z.enum(['UPCOMING', 'ONGOING', 'PAST']).optional(),
  shortDescription: z.string().trim().max(300).optional().nullable(),
  agenda: z.string().max(15000).optional().nullable(),
  highlights: z.string().max(15000).optional().nullable(),
  learningOutcomes: z.string().max(15000).optional().nullable(),
  targetAudience: z.string().max(5000).optional().nullable(),
  speakers: z.array(z.any()).max(100).optional().nullable(),
  resources: z.array(z.any()).max(100).optional().nullable(),
  faqs: z.array(z.any()).max(100).optional().nullable(),
  imageGallery: z.array(z.string().url('Image URL must be valid')).max(50).optional().nullable(),
  videoUrl: optionalVideoUrl,
  tags: z.array(z.string().trim().min(1).max(40)).max(40).optional(),
  featured: z.boolean().optional(),
  allowLateRegistration: z.boolean().optional(),
  eventDays: z.coerce.number().int().min(1).max(10).optional(),
  dayLabels: z.array(z.string().trim().min(1).max(100)).max(10).optional().nullable(),
  // Admin-defined per-event registration form fields. Capped at 50 to prevent
  // unbounded JSON payloads from blowing up Prisma writes / downstream queries.
  registrationFields: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80).optional(),
        label: z.string().trim().min(1).max(200),
        type: z.string().trim().min(1).max(40),
        required: z.boolean().optional(),
        placeholder: z.string().trim().max(200).optional(),
        helperText: z.string().trim().max(500).optional(),
        options: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
        pattern: z.string().trim().max(500).optional(),
        minLength: z.number().int().min(0).max(10000).optional(),
        maxLength: z.number().int().min(0).max(10000).optional(),
      }).passthrough(),
    )
    .max(50)
    .optional()
    .nullable(),
  // Team registration fields
  teamRegistration: z.boolean().optional(),
  teamMinSize: z.coerce.number().int().min(1).max(10).optional(),
  teamMaxSize: z.coerce.number().int().min(1).max(10).optional(),
});

const createEventSchema = eventSchemaBase.superRefine((value, ctx) => {
  const timelineError = validateEventTimeline(value);
  if (timelineError) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: timelineError,
    });
  }

  if (value.dayLabels && value.dayLabels.length !== (value.eventDays ?? 1)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'dayLabels length must match eventDays',
      path: ['dayLabels'],
    });
  }
});

const updateEventSchema = eventSchemaBase.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required' }
);

const normalizeOptionalText = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toNullableJsonValue = (
  value: unknown
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return Prisma.DbNull;
  }
  return value as Prisma.InputJsonValue;
};

// Get all events with filtering
eventsRouter.get('/', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { status, search, limit, offset } = req.query;
    const where: Record<string, unknown> = {};

    if (status && ['UPCOMING', 'ONGOING', 'PAST'].includes(status as string)) {
      where.status = status as EventStatus;
    }

    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const limitValue = typeof limit === 'string' ? Number.parseInt(limit, 10) : undefined;
    const offsetValue = typeof offset === 'string' ? Number.parseInt(offset, 10) : 0;

    if (
      limit !== undefined &&
      (!Number.isInteger(limitValue) || (limitValue as number) <= 0)
    ) {
      return res.status(400).json({
        success: false,
        error: { message: 'limit must be a positive integer' },
      });
    }

    if (
      offset !== undefined &&
      (!Number.isInteger(offsetValue) || offsetValue < 0)
    ) {
      return res.status(400).json({
        success: false,
        error: { message: 'offset must be a non-negative integer' },
      });
    }

    // Public event counts: only participant registrations belong in "X registered" totals.
    const eventListSelect = {
      id: true,
      title: true,
      slug: true,
      description: true,
      status: true,
      startDate: true,
      endDate: true,
      registrationStartDate: true,
      registrationEndDate: true,
      location: true,
      venue: true,
      eventType: true,
      prerequisites: true,
      capacity: true,
      imageUrl: true,
      shortDescription: true,
      featured: true,
      allowLateRegistration: true,
      eventDays: true,
      dayLabels: true,
      registrationFields: true,
      teamRegistration: true,
      teamMinSize: true,
      teamMaxSize: true,
      _count: {
        select: {
          registrations: { where: participantsOnly },
        },
      },
    } satisfies Prisma.EventSelect;

    const queryOptions: Prisma.EventFindManyArgs = {
      where,
      orderBy: { startDate: 'desc' },
      select: eventListSelect,
      ...(limitValue ? { take: limitValue, skip: offsetValue } : {}),
    };

    const events = await prisma.event.findMany(queryOptions);
    const shouldCount =
      Boolean(limitValue) &&
      !(offsetValue === 0 && events.length < (limitValue as number));
    const total = shouldCount
      ? await prisma.event.count({ where })
      : limitValue
        ? events.length + offsetValue
        : events.length;

    const authUser = getAuthUser(req);
    let registeredEventIds = new Set<string>();

    if (authUser && events.length > 0) {
      const registrations = await prisma.eventRegistration.findMany({
        where: {
          userId: authUser.id,
          eventId: { in: events.map((event) => event.id) },
        },
        select: { eventId: true },
      });
      registeredEventIds = new Set(registrations.map((registration) => registration.eventId));
    }

    const eventsWithRegistration = events.map((event) => ({
      ...event,
      isRegistered: authUser ? registeredEventIds.has(event.id) : false,
    }));

    res.json({
      success: true,
      data: eventsWithRegistration,
      pagination: { total, limit: limitValue ?? total, offset: limitValue ? offsetValue : 0 },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch events' } });
  }
});

eventsRouter.get('/upcoming', async (_req: Request, res: Response) => {
  try {
    const events = await prisma.event.findMany({
      where: { status: 'UPCOMING', startDate: { gte: new Date() } },
      orderBy: { startDate: 'asc' },
      take: 5,
      // Public event counts: only participant registrations belong in "X registered" totals.
      include: {
        _count: {
          select: {
            registrations: { where: participantsOnly },
          },
        },
      },
    });
    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch upcoming events' } });
  }
});

eventsRouter.get('/:id', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    // Support both ID and slug lookup
    const idOrSlug = req.params.id;
    // Public event counts: only participant registrations belong in "X registered" totals.
    const includeOptions = {
      _count: {
        select: {
          registrations: { where: participantsOnly },
        },
      },
    } as const;
    const event = UUID_REGEX.test(idOrSlug)
      ? (await prisma.event.findUnique({ where: { id: idOrSlug }, include: includeOptions })) ??
        (await prisma.event.findUnique({ where: { slug: idOrSlug }, include: includeOptions }))
      : (await prisma.event.findUnique({ where: { slug: idOrSlug }, include: includeOptions })) ??
        (await prisma.event.findUnique({ where: { id: idOrSlug }, include: includeOptions }));

    if (!event) {
      return res.status(404).json({ success: false, error: { message: 'Event not found' } });
    }

    const authUser = getAuthUser(req);
    const [registration, guestInvitations, userInvitation] = await Promise.all([
      authUser
        ? prisma.eventRegistration.findUnique({
            where: { userId_eventId: { userId: authUser.id, eventId: event.id } },
            select: { id: true },
          })
        : Promise.resolve(null),
      prisma.eventInvitation.findMany({
        where: {
          eventId: event.id,
          status: 'ACCEPTED',
          inviteeUser: {
            networkProfile: {
              isPublic: true,
            },
          },
        },
        select: {
          role: true,
          invitedAt: true,
          inviteeUser: {
            select: {
              networkProfile: {
                select: {
                  fullName: true,
                  designation: true,
                  company: true,
                  profilePhoto: true,
                  slug: true,
                },
              },
            },
          },
        },
      }),
      authUser
        ? prisma.eventInvitation.findFirst({
            where: {
              eventId: event.id,
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
            select: {
              id: true,
              role: true,
              status: true,
              invitedAt: true,
              respondedAt: true,
              revokedAt: true,
              certificateEnabled: true,
              certificateType: true,
              inviteeUserId: true,
              inviteeEmail: true,
              inviteeNameSnapshot: true,
              inviteeDesignationSnapshot: true,
              inviteeCompanySnapshot: true,
              customMessage: true,
              registrationId: true,
              registration: {
                select: {
                  id: true,
                  eventId: true,
                  attendanceToken: true,
                  attended: true,
                  scannedAt: true,
                  manualOverride: true,
                  dayAttendances: {
                    select: {
                      dayNumber: true,
                      attended: true,
                      scannedAt: true,
                    },
                    orderBy: { dayNumber: 'asc' },
                  },
                },
              },
            },
          })
        : Promise.resolve(null),
    ]);
    const isRegistered = Boolean(registration);

    const registrationStatus = getRegistrationStatus(
      {
        startDate: event.startDate,
        endDate: event.endDate,
        registrationStartDate: event.registrationStartDate,
        registrationEndDate: event.registrationEndDate,
        allowLateRegistration: event.allowLateRegistration,
        capacity: event.capacity,
      },
      event._count.registrations
    );

    res.json({
      success: true,
      data: {
        ...event,
        isRegistered,
        registrationStatus,
        spotsRemaining: event.capacity ? event.capacity - event._count.registrations : null,
        guests: guestInvitations
          .sort((left, right) => {
            const priorityDelta = getGuestRolePriority(left.role) - getGuestRolePriority(right.role);
            if (priorityDelta !== 0) {
              return priorityDelta;
            }
            return left.invitedAt.getTime() - right.invitedAt.getTime();
          })
          .map((invitation) => ({
            name: invitation.inviteeUser?.networkProfile?.fullName || 'Guest',
            designation: invitation.inviteeUser?.networkProfile?.designation || '',
            company: invitation.inviteeUser?.networkProfile?.company || '',
            photo: invitation.inviteeUser?.networkProfile?.profilePhoto || null,
            role: invitation.role,
            networkSlug: invitation.inviteeUser?.networkProfile?.slug || null,
          })),
        userInvitation: userInvitation
          ? {
              ...userInvitation,
              status: deriveInvitationStatus({
                status: userInvitation.status,
                event: { startDate: event.startDate, endDate: event.endDate },
              }),
              attendanceToken: userInvitation.registration?.attendanceToken || null,
            }
          : null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch event' } });
  }
});

eventsRouter.post('/', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { message: parsed.error.errors[0]?.message || 'Invalid event payload' },
      });
    }
    const data = parsed.data;
    let registrationFields;

    try {
      registrationFields = sanitizeEventRegistrationFields(data.registrationFields);
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        error: { message: validationError instanceof Error ? validationError.message : 'Invalid registration fields' },
      });
    }

    const teamRegistrationEnabled = data.teamRegistration ?? false;
    const teamMinSize = data.teamMinSize ?? 1;
    const teamMaxSize = data.teamMaxSize ?? 4;
    const eventDays = data.eventDays ?? 1;
    if (data.dayLabels && data.dayLabels.length !== eventDays) {
      return res.status(400).json({
        success: false,
        error: { message: 'dayLabels length must match eventDays' },
      });
    }
    if (teamRegistrationEnabled && teamMinSize > teamMaxSize) {
      return res.status(400).json({
        success: false,
        error: { message: 'Minimum team size cannot exceed maximum team size' },
      });
    }

    // Generate slug from title
    const baseSlug = generateSlug(data.title) || 'event';
    const existingSlugs = (
      await prisma.event.findMany({
        where: { slug: { startsWith: baseSlug } },
        select: { slug: true },
      })
    ).map((event) => event.slug);
    const slug = generateUniqueSlug(baseSlug, existingSlugs);

    const event = await prisma.event.create({
      data: {
        title: data.title,
        slug,
        description: sanitizeHtml(data.description),
        startDate: data.startDate,
        endDate: data.endDate || null,
        registrationStartDate: data.registrationStartDate || null,
        registrationEndDate: data.registrationEndDate || null,
        location: normalizeOptionalText(data.location),
        venue: normalizeOptionalText(data.venue),
        eventType: normalizeOptionalText(data.eventType),
        prerequisites: normalizeOptionalText(sanitizeHtml(data.prerequisites)),
        capacity: data.capacity || null,
        imageUrl: normalizeOptionalText(data.imageUrl),
        status: data.status || 'UPCOMING',
        createdBy: authUser.id,
        // Extended event fields
        shortDescription: normalizeOptionalText(data.shortDescription),
        agenda: normalizeOptionalText(sanitizeHtml(data.agenda)),
        highlights: normalizeOptionalText(sanitizeHtml(data.highlights)),
        learningOutcomes: normalizeOptionalText(sanitizeHtml(data.learningOutcomes)),
        targetAudience: normalizeOptionalText(sanitizeHtml(data.targetAudience)),
        speakers: toNullableJsonValue(data.speakers),
        resources: toNullableJsonValue(data.resources),
        faqs: toNullableJsonValue(data.faqs),
        imageGallery: toNullableJsonValue(data.imageGallery),
        videoUrl: normalizeOptionalText(data.videoUrl),
        tags: data.tags || [],
        featured: data.featured || false,
        allowLateRegistration: data.allowLateRegistration || false,
        eventDays,
        ...(data.dayLabels !== undefined && {
          dayLabels: data.dayLabels === null
            ? Prisma.DbNull
            : (data.dayLabels as unknown as Prisma.InputJsonValue),
        }),
        // Team registration fields
        teamRegistration: teamRegistrationEnabled,
        teamMinSize,
        teamMaxSize,
        registrationFields: registrationFields.length > 0
          ? (registrationFields as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });

    await auditLog(authUser.id, 'CREATE', 'event', event.id, { title: event.title });

    // Notify search engines about the new event page
    submitUrl(`/events/${event.slug}`);

    // Send email notification to all users about new event (async, don't wait)
    sendNewEventEmailsAsync(event);

    // Dashboard v3: also drop an in-app broadcast for the bell menu
    broadcastNotification({
      source: 'AUTO_EVENT',
      audience: 'ALL',
      category: 'event',
      icon: 'calendar',
      title: `New event: ${event.title}`,
      body: event.shortDescription || event.description?.slice(0, 200) || undefined,
      link: `/events/${event.slug}`,
      refEntity: 'event',
      refEntityId: event.id,
      createdById: authUser.id,
    }).catch((err) => logger.error('broadcastNotification(event) failed', { id: event.id, error: err instanceof Error ? err.message : String(err) }));

    res.status(201).json({ success: true, data: event, message: 'Event created successfully' });
  } catch (error) {
    logger.error('Failed to create event', { error: error instanceof Error ? error.message : error });
    
    // Handle Prisma errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return res.status(409).json({ success: false, error: { message: 'An event with this slug already exists' } });
      }
      if (error.code === 'P2003') {
        return res.status(400).json({ success: false, error: { message: 'Invalid user reference' } });
      }
    }
    
    res.status(500).json({ success: false, error: { message: 'Failed to create event' } });
  }
});

eventsRouter.put('/:id', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    const parsed = updateEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { message: parsed.error.errors[0]?.message || 'Invalid event payload' },
      });
    }
    const data = parsed.data;

    const existingEvent = await prisma.event.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        createdBy: true,
        startDate: true,
        endDate: true,
        registrationStartDate: true,
        registrationEndDate: true,
        allowLateRegistration: true,
        eventDays: true,
        teamRegistration: true,
        teamMinSize: true,
        teamMaxSize: true,
      },
    });

    if (!existingEvent) {
      return res.status(404).json({ success: false, error: { message: 'Event not found' } });
    }

    // Authorization: Only creator, ADMIN, or PRESIDENT can modify events
    const isCreatorOrAdmin = existingEvent.createdBy === authUser.id ||
      authUser.role === 'ADMIN' ||
      authUser.role === 'PRESIDENT';
    if (!isCreatorOrAdmin) {
      return res.status(403).json({ success: false, error: { message: 'Only the event creator or an admin can modify this event' } });
    }

    const timelineError = validateEventTimeline({
      startDate: data.startDate ?? existingEvent.startDate,
      endDate: data.endDate ?? existingEvent.endDate,
      registrationStartDate: data.registrationStartDate ?? existingEvent.registrationStartDate,
      registrationEndDate: data.registrationEndDate ?? existingEvent.registrationEndDate,
      allowLateRegistration: data.allowLateRegistration ?? existingEvent.allowLateRegistration,
    });

    if (timelineError) {
      return res.status(400).json({ success: false, error: { message: timelineError } });
    }

    // --- TEAM REGISTRATION TOGGLE GUARD ---
    if (data.teamRegistration !== undefined) {
      const currentTeamReg = await prisma.event.findUnique({
        where: { id: req.params.id },
        select: { teamRegistration: true },
      });

      if (currentTeamReg && data.teamRegistration !== currentTeamReg.teamRegistration) {
        // Team-mode guard: only participant registrations should block participant-lane changes.
        const regCount = await prisma.eventRegistration.count({
          where: {
            eventId: req.params.id,
            ...participantsOnly,
          },
        });
        if (regCount > 0) {
          return res.status(409).json({
            success: false,
            error: { message: 'Cannot change team registration mode after registrations exist. Remove all registrations first.' },
          });
        }
      }
    }

    const nextTeamRegistration = data.teamRegistration ?? existingEvent.teamRegistration;
    const nextTeamMinSize = data.teamMinSize ?? existingEvent.teamMinSize;
    const nextTeamMaxSize = data.teamMaxSize ?? existingEvent.teamMaxSize;
    const nextEventDays = data.eventDays ?? existingEvent.eventDays;

    if (data.dayLabels && data.dayLabels.length !== nextEventDays) {
      return res.status(400).json({
        success: false,
        error: { message: 'dayLabels length must match eventDays' },
      });
    }

    // Validate team size constraints whenever team registration is enabled in resulting state
    if (nextTeamRegistration) {
      const minSize = nextTeamMinSize;
      const maxSize = nextTeamMaxSize;
      if (minSize < 1 || maxSize < 1) {
        return res.status(400).json({
          success: false,
          error: { message: 'Team size must be at least 1' },
        });
      }
      if (minSize > maxSize) {
        return res.status(400).json({
          success: false,
          error: { message: 'Minimum team size cannot exceed maximum team size' },
        });
      }
      if (maxSize > 10) {
        return res.status(400).json({
          success: false,
          error: { message: 'Maximum team size cannot exceed 10' },
        });
      }

      if (data.teamMaxSize !== undefined) {
        const existingTeams = await prisma.eventTeam.findMany({
          where: { eventId: req.params.id },
          select: {
            teamName: true,
            _count: { select: { members: true } },
          },
          take: 2000,
        });

        const oversizedTeam = existingTeams.find((team) => team._count.members > maxSize);
        if (oversizedTeam) {
          return res.status(409).json({
            success: false,
            error: {
              message: `Cannot set teamMaxSize to ${maxSize}. Team "${oversizedTeam.teamName}" currently has ${oversizedTeam._count.members} members.`,
            },
          });
        }
      }
    }
    // --- END TEAM REGISTRATION TOGGLE GUARD ---

    let registrationFieldsUpdate = {};

    // If title changed, regenerate slug
    let slugUpdate = {};
    if (data.title) {
      const baseSlug = generateSlug(data.title) || 'event';
      const existingSlugs = (
        await prisma.event.findMany({
          where: {
            id: { not: req.params.id },
            slug: { startsWith: baseSlug },
          },
          select: { slug: true },
        })
      ).map((event) => event.slug);
      const newSlug = generateUniqueSlug(baseSlug, existingSlugs);
      slugUpdate = { slug: newSlug };
    }

    if (data.registrationFields !== undefined) {
      try {
        const registrationFields = sanitizeEventRegistrationFields(data.registrationFields);
        registrationFieldsUpdate = {
          registrationFields: registrationFields.length > 0
            ? (registrationFields as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        };
      } catch (validationError) {
        return res.status(400).json({
          success: false,
          error: { message: validationError instanceof Error ? validationError.message : 'Invalid registration fields' },
        });
      }
    }

    const event = await prisma.$transaction(async (tx) => {
      if (data.eventDays !== undefined && data.eventDays !== existingEvent.eventDays) {
        const registrationCount = await tx.eventRegistration.count({
          where: { eventId: req.params.id },
        });

        if (registrationCount > 0 && data.eventDays > existingEvent.eventDays) {
          const registrations = await tx.eventRegistration.findMany({
            where: { eventId: req.params.id },
            select: {
              id: true,
              dayAttendances: {
                select: { dayNumber: true },
              },
            },
          });

          const rowsToCreate: Array<{ registrationId: string; dayNumber: number; attended: boolean }> = [];
          for (const registration of registrations) {
            const existingDays = new Set(registration.dayAttendances.map((day) => day.dayNumber));
            for (let dayNumber = 1; dayNumber <= data.eventDays; dayNumber += 1) {
              if (!existingDays.has(dayNumber)) {
                rowsToCreate.push({
                  registrationId: registration.id,
                  dayNumber,
                  attended: false,
                });
              }
            }
          }

          const BATCH_SIZE = 500;
          for (let index = 0; index < rowsToCreate.length; index += BATCH_SIZE) {
            await tx.dayAttendance.createMany({
              data: rowsToCreate.slice(index, index + BATCH_SIZE),
              skipDuplicates: true,
            });
          }
        }

        if (registrationCount > 0 && data.eventDays < existingEvent.eventDays) {
          const attendedHigherDays = await tx.dayAttendance.count({
            where: {
              registration: { eventId: req.params.id },
              dayNumber: { gt: data.eventDays },
              attended: true,
            },
          });

          if (attendedHigherDays > 0) {
            throw new Error('Cannot reduce days — attendance already recorded for removed days');
          }

          await tx.dayAttendance.deleteMany({
            where: {
              registration: { eventId: req.params.id },
              dayNumber: { gt: data.eventDays },
            },
          });
        }
      }

      return tx.event.update({
        where: { id: req.params.id },
        data: {
          ...(data.title && { title: data.title }),
          ...slugUpdate,
          ...(data.description !== undefined && { description: sanitizeHtml(data.description) }),
          ...(data.startDate !== undefined && { startDate: data.startDate }),
          ...(data.endDate !== undefined && { endDate: data.endDate || null }),
          ...(data.registrationStartDate !== undefined && { registrationStartDate: data.registrationStartDate || null }),
          ...(data.registrationEndDate !== undefined && { registrationEndDate: data.registrationEndDate || null }),
          ...(data.location !== undefined && { location: normalizeOptionalText(data.location) }),
          ...(data.venue !== undefined && { venue: normalizeOptionalText(data.venue) }),
          ...(data.eventType !== undefined && { eventType: normalizeOptionalText(data.eventType) }),
          ...(data.prerequisites !== undefined && { prerequisites: normalizeOptionalText(sanitizeHtml(data.prerequisites)) }),
          ...(data.capacity !== undefined && { capacity: data.capacity || null }),
          ...(data.imageUrl !== undefined && { imageUrl: normalizeOptionalText(data.imageUrl) }),
          ...(data.status && { status: data.status }),
          // Extended event fields
          ...(data.shortDescription !== undefined && { shortDescription: normalizeOptionalText(data.shortDescription) }),
          ...(data.agenda !== undefined && { agenda: normalizeOptionalText(sanitizeHtml(data.agenda)) }),
          ...(data.highlights !== undefined && { highlights: normalizeOptionalText(sanitizeHtml(data.highlights)) }),
          ...(data.learningOutcomes !== undefined && { learningOutcomes: normalizeOptionalText(sanitizeHtml(data.learningOutcomes)) }),
          ...(data.targetAudience !== undefined && { targetAudience: normalizeOptionalText(sanitizeHtml(data.targetAudience)) }),
          ...(data.speakers !== undefined && { speakers: toNullableJsonValue(data.speakers) }),
          ...(data.resources !== undefined && { resources: toNullableJsonValue(data.resources) }),
          ...(data.faqs !== undefined && { faqs: toNullableJsonValue(data.faqs) }),
          ...(data.imageGallery !== undefined && { imageGallery: toNullableJsonValue(data.imageGallery) }),
          ...(data.videoUrl !== undefined && { videoUrl: normalizeOptionalText(data.videoUrl) }),
          ...(data.tags !== undefined && { tags: data.tags }),
          ...(data.featured !== undefined && { featured: data.featured }),
          ...(data.allowLateRegistration !== undefined && { allowLateRegistration: data.allowLateRegistration }),
          ...(data.eventDays !== undefined && { eventDays: data.eventDays }),
          ...(data.dayLabels !== undefined && {
            dayLabels: data.dayLabels === null
              ? Prisma.DbNull
              : (data.dayLabels as unknown as Prisma.InputJsonValue),
          }),
          // Team registration fields
          ...(data.teamRegistration !== undefined && { teamRegistration: data.teamRegistration }),
          ...(data.teamMinSize !== undefined && { teamMinSize: data.teamMinSize }),
          ...(data.teamMaxSize !== undefined && { teamMaxSize: data.teamMaxSize }),
          ...registrationFieldsUpdate,
        },
      });
    });

    await auditLog(authUser.id, 'UPDATE', 'event', event.id);

    // Notify search engines about the updated event page
    if (event.slug) submitUrl(`/events/${event.slug}`);

    res.json({ success: true, data: event, message: 'Event updated successfully' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Cannot reduce days — attendance already recorded for removed days') {
      return res.status(400).json({ success: false, error: { message: error.message } });
    }
    logger.error('Failed to update event', { error: error instanceof Error ? error.message : error, eventId: req.params.id });
    res.status(500).json({ success: false, error: { message: 'Failed to update event' } });
  }
});

eventsRouter.delete('/:id', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;
    
    // Check event exists and get creator
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      select: { id: true, createdBy: true },
    });
    
    if (!event) {
      return res.status(404).json({ success: false, error: { message: 'Event not found' } });
    }
    
    // Authorization: Only creator, ADMIN, or PRESIDENT can delete events
    const isCreatorOrAdmin = event.createdBy === authUser.id ||
      authUser.role === 'ADMIN' ||
      authUser.role === 'PRESIDENT';
    if (!isCreatorOrAdmin) {
      return res.status(403).json({ success: false, error: { message: 'Only the event creator or an admin can delete this event' } });
    }
    
    await prisma.event.delete({ where: { id: req.params.id } });
    await auditLog(authUser.id, 'DELETE', 'event', req.params.id);
    res.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to delete event' } });
  }
});

// Lightweight count endpoint. Used by the events list page to render per-event
// stats (registered / attended) without pulling every registration row + joined
// user. Four counts in parallel.
eventsRouter.get('/:id/registrations/stats', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const eventId = req.params.id;
    const [total, participants, guests, attended] = await Promise.all([
      prisma.eventRegistration.count({ where: { eventId } }),
      prisma.eventRegistration.count({ where: { eventId, registrationType: RegistrationType.PARTICIPANT } }),
      prisma.eventRegistration.count({ where: { eventId, registrationType: RegistrationType.GUEST } }),
      prisma.eventRegistration.count({
        where: {
          eventId,
          registrationType: RegistrationType.PARTICIPANT,
          OR: [
            { attended: true },
            { dayAttendances: { some: { attended: true } } },
          ],
        },
      }),
    ]);
    res.json({ success: true, data: { total, participants, guests, attended } });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch registration stats' } });
  }
});

// Hard cap on rows returned to prevent OOM on the 512 MB free-tier instance.
// Callers needing more than this should use the export endpoint or paginate.
const REGISTRATIONS_LIST_CAP = 5000;

eventsRouter.get('/:id/registrations', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const registrations = await prisma.eventRegistration.findMany({
      where: { eventId: req.params.id },
      select: {
        id: true,
        userId: true,
        eventId: true,
        timestamp: true,
        registrationType: true,
        customFieldResponses: true,
        invitation: {
          select: {
            id: true,
            role: true,
            status: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            phone: true,
            course: true,
            branch: true,
            year: true,
            role: true
          }
        }
      },
      orderBy: { timestamp: 'asc' },
      take: REGISTRATIONS_LIST_CAP,
    });
    res.json({ success: true, data: registrations });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch registrations' } });
  }
});

// Delete a registration (admin only)
eventsRouter.delete('/:eventId/registrations/:registrationId', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const { eventId, registrationId } = req.params;
    
    const registration = await prisma.eventRegistration.findFirst({
      where: { id: registrationId, eventId },
      select: { id: true },
    });
    
    if (!registration) {
      return res.status(404).json({ success: false, error: { message: 'Registration not found' } });
    }
    
    await prisma.eventRegistration.delete({ where: { id: registrationId } });
    res.json({ success: true, message: 'Registration deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch registrations' } });
  }
});

eventsRouter.get('/:id/registrations/export', authMiddleware, requireRole('CORE_MEMBER'), async (req: Request, res: Response) => {
  try {
    const formatQuery = typeof req.query.format === 'string' ? req.query.format.trim().toLowerCase() : 'xlsx';
    if (formatQuery !== 'xlsx' && formatQuery !== 'csv') {
      return res.status(400).json({ success: false, error: { message: 'format must be xlsx or csv' } });
    }
    const format: 'xlsx' | 'csv' = formatQuery;

    const yearFilter = typeof req.query.year === 'string' ? req.query.year.trim() : '';
    const branchFilter = typeof req.query.branch === 'string' ? req.query.branch.trim() : '';
    const courseFilter = typeof req.query.course === 'string' ? req.query.course.trim() : '';
    const userRoleFilter = typeof req.query.userRole === 'string' ? req.query.userRole.trim() : '';
    const searchFilter = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const registrationTypeFilterRaw = typeof req.query.registrationType === 'string'
      ? req.query.registrationType.trim().toUpperCase()
      : '';

    if (
      registrationTypeFilterRaw &&
      registrationTypeFilterRaw !== RegistrationType.PARTICIPANT &&
      registrationTypeFilterRaw !== RegistrationType.GUEST
    ) {
      return res.status(400).json({ success: false, error: { message: 'registrationType must be PARTICIPANT or GUEST' } });
    }

    const registrationTypeFilter = registrationTypeFilterRaw
      ? (registrationTypeFilterRaw as RegistrationType)
      : null;
    
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: {
        registrations: {
          select: {
            id: true,
            userId: true,
            eventId: true,
            timestamp: true,
            registrationType: true,
            customFieldResponses: true,
            invitation: {
              select: {
                role: true,
                status: true,
              },
            },
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                course: true,
                branch: true,
                year: true,
                role: true,
                githubUrl: true,
                linkedinUrl: true,
                createdAt: true,
              },
            },
          },
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!event) {
      return res.status(404).json({ success: false, error: { message: 'Event not found' } });
    }

    const normalize = (value: string | null | undefined): string => (value || '').trim().toLowerCase();
    const normalizedYearFilter = normalize(yearFilter);
    const normalizedBranchFilter = normalize(branchFilter);
    const normalizedCourseFilter = normalize(courseFilter);
    const normalizedUserRoleFilter = normalize(userRoleFilter);
    const normalizedSearchFilter = normalize(searchFilter);

    const filteredRegistrations = event.registrations.filter((registration) => {
      const user = registration.user;

      const matchesYear = !normalizedYearFilter || normalize(user.year) === normalizedYearFilter;
      const matchesBranch = !normalizedBranchFilter || normalize(user.branch).includes(normalizedBranchFilter);
      const matchesCourse = !normalizedCourseFilter || normalize(user.course).includes(normalizedCourseFilter);
      const matchesUserRole = !normalizedUserRoleFilter || normalize(user.role) === normalizedUserRoleFilter;
      const matchesRegistrationType = !registrationTypeFilter || registration.registrationType === registrationTypeFilter;

      const searchText = [user.name, user.email, user.phone || '']
        .join(' ')
        .toLowerCase();
      const matchesSearch = !normalizedSearchFilter || searchText.includes(normalizedSearchFilter);

      return (
        matchesYear &&
        matchesBranch &&
        matchesCourse &&
        matchesUserRole &&
        matchesRegistrationType &&
        matchesSearch
      );
    });

    const appliedFilters = [
      yearFilter ? `Year: ${yearFilter}` : null,
      branchFilter ? `Branch: ${branchFilter}` : null,
      courseFilter ? `Course: ${courseFilter}` : null,
      userRoleFilter ? `User Role: ${userRoleFilter}` : null,
      registrationTypeFilter ? `Registration Type: ${registrationTypeFilter}` : null,
      searchFilter ? `Search: ${searchFilter}` : null,
    ].filter(Boolean).join(', ');

    const registrationFields = sanitizeEventRegistrationFields(event.registrationFields);

    // Build team member lookup for team events
    let teamMemberMap = new Map<string, { teamName: string; role: string }>();
    if (event.teamRegistration) {
      const teamMembers = await prisma.eventTeamMember.findMany({
        where: { team: { eventId: event.id } },
        select: {
          userId: true,
          role: true,
          team: { select: { teamName: true } },
        },
      });
      for (const tm of teamMembers) {
        teamMemberMap.set(tm.userId, { teamName: tm.team.teamName, role: tm.role });
      }
    }

    const getResponseMap = (responses: unknown): Map<string, string> => {
      const map = new Map<string, string>();
      if (!Array.isArray(responses)) {
        return map;
      }
      for (const item of responses) {
        if (!item || typeof item !== 'object') {
          continue;
        }
        const parsed = item as { fieldId?: unknown; value?: unknown };
        if (typeof parsed.fieldId !== 'string' || !parsed.fieldId) {
          continue;
        }
        map.set(parsed.fieldId, parsed.value === undefined || parsed.value === null ? '' : String(parsed.value));
      }
      return map;
    };

    const escapeCsv = (value: unknown): string => {
      const stringValue = value === undefined || value === null ? '' : String(value);
      return `"${stringValue.replace(/"/g, '""')}"`;
    };

    // For CSV format (backwards compatible)
    if (format === 'csv') {
      const header = [
        'S.No',
        'Registration Type',
        'Guest Role',
        'Name',
        'Email',
        'Phone',
        'Course',
        'Branch',
        'Year',
        'Role',
        ...(event.teamRegistration ? ['Team Name', 'Team Role'] : []),
        'Registered At',
        'Account Created',
        ...registrationFields.map((field) => field.label),
      ];

      const rows = filteredRegistrations.map((registration, index) => {
        const responseMap = getResponseMap(registration.customFieldResponses);
        const tmInfo = teamMemberMap.get(registration.userId);
        return [
          index + 1,
          registration.registrationType,
          registration.invitation?.role || '',
          registration.user.name,
          registration.user.email,
          registration.user.phone || '',
          registration.user.course || '',
          registration.user.branch || '',
          registration.user.year || '',
          registration.user.role,
          ...(event.teamRegistration ? [tmInfo?.teamName || 'No Team', tmInfo?.role || '-'] : []),
          registration.timestamp.toISOString(),
          registration.user.createdAt.toISOString(),
          ...registrationFields.map((field) => responseMap.get(field.id) || ''),
        ];
      });

      const csv = [header, ...rows]
        .map((row) => row.map(escapeCsv).join(','))
        .join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${event.title.replace(/[^a-z0-9]/gi, '_')}_registrations.csv"`);
      return res.send(csv);
    }

    // For Excel format
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.default.Workbook();
    workbook.creator = 'code.scriet';
    workbook.created = new Date();

    const participantRegistrations = filteredRegistrations.filter(isParticipant);
    const guestRegistrations = filteredRegistrations.filter(isGuest);

    const buildWorksheet = (
      sheetName: string,
      rows: typeof event.registrations,
    ) => {
      const worksheet = workbook.addWorksheet(sheetName);

      // Export split: keep participant and guest lanes separate so VIP rows never blend into participant sheets.
      worksheet.columns = [
        { header: 'S.No', key: 'sno', width: 8 },
        { header: 'Registration Type', key: 'registrationType', width: 18 },
        { header: 'Guest Role', key: 'guestRole', width: 20 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Email', key: 'email', width: 35 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Course', key: 'course', width: 12 },
        { header: 'Branch', key: 'branch', width: 15 },
        { header: 'Year', key: 'year', width: 12 },
        { header: 'Role', key: 'role', width: 15 },
        ...(event.teamRegistration ? [
          { header: 'Team Name', key: 'teamName', width: 25 },
          { header: 'Team Role', key: 'teamRole', width: 12 },
        ] : []),
        { header: 'Registered At', key: 'registeredAt', width: 22 },
        { header: 'Account Created', key: 'accountCreated', width: 22 },
        { header: 'GitHub', key: 'github', width: 25 },
        { header: 'LinkedIn', key: 'linkedin', width: 25 },
        ...registrationFields.map((field) => ({
          header: field.label,
          key: `custom_${field.id}`,
          width: Math.max(18, Math.min(45, field.label.length + 10)),
        })),
      ];

      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD97706' },
      };
      worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 25;

      rows.forEach((reg, index) => {
        const responseMap = getResponseMap(reg.customFieldResponses);
        const tmInfo = teamMemberMap.get(reg.userId);
        const rowData: Record<string, unknown> = {
          sno: index + 1,
          registrationType: reg.registrationType,
          guestRole: reg.invitation?.role || '',
          name: reg.user.name,
          email: reg.user.email,
          phone: reg.user.phone || 'N/A',
          course: reg.user.course || 'N/A',
          branch: reg.user.branch || 'N/A',
          year: reg.user.year || 'N/A',
          role: reg.user.role,
          ...(event.teamRegistration ? {
            teamName: tmInfo?.teamName || 'No Team',
            teamRole: tmInfo?.role || '-',
          } : {}),
          registeredAt: reg.timestamp.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
          accountCreated: reg.user.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
          github: reg.user.githubUrl || '',
          linkedin: reg.user.linkedinUrl || '',
        };

        registrationFields.forEach((field) => {
          rowData[`custom_${field.id}`] = responseMap.get(field.id) || '';
        });

        worksheet.addRow(rowData);
      });

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: rowNumber % 2 === 0 ? 'FFFEF3C7' : 'FFFFFFFF' },
          };
        }
        row.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
      });
    };

    // Keep a consolidated sheet first so row counts always align with total registrations shown in the UI.
    buildWorksheet('All Registrations', filteredRegistrations);
    buildWorksheet('Participants', participantRegistrations);
    if (guestRegistrations.length > 0) {
      buildWorksheet('Guests', guestRegistrations);
    }

    // Add summary info at the top
    const summarySheet = workbook.addWorksheet('Event Info');
    summarySheet.addRow(['Event Title', event.title]);
    summarySheet.addRow(['Start Date', event.startDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })]);
    summarySheet.addRow(['End Date', event.endDate?.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) || 'N/A']);
    summarySheet.addRow(['Location', event.location || 'N/A']);
    summarySheet.addRow(['Venue', event.venue || 'N/A']);
    summarySheet.addRow(['Applied Filters', appliedFilters || 'None']);
    summarySheet.addRow(['Participant Registrations (Filtered)', participantRegistrations.length]);
    summarySheet.addRow(['Guest Registrations (Filtered)', guestRegistrations.length]);
    summarySheet.addRow(['Total Registrations (Filtered)', filteredRegistrations.length]);
    summarySheet.addRow(['Total Registrations (Unfiltered)', event.registrations.length]);
    summarySheet.addRow(['Capacity', event.capacity || 'Unlimited']);
    summarySheet.addRow(['Export Date', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })]);

    summarySheet.getColumn(1).width = 20;
    summarySheet.getColumn(1).font = { bold: true };
    summarySheet.getColumn(2).width = 40;

    // Send Excel file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${event.title.replace(/[^a-z0-9]/gi, '_')}_registrations.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('Export error:', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: { message: 'Failed to export registrations' } });
  }
});

// ============================================
// Email notification helpers
// ============================================

// Helper function to send new event emails asynchronously
async function sendNewEventEmailsAsync(event: {
  title: string;
  description: string;
  startDate: Date;
  slug: string;
  shortDescription?: string | null;
  location?: string | null;
  imageUrl?: string | null;
  tags?: string[];
  eventType?: string | null;
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
      logger.info('No users to notify for new event');
      return;
    }

    logger.info(`📧 Sending new event email to ${emails.length} users...`, { title: event.title });

    await emailService.sendNewEventToAll(
      emails,
      event.title,
      event.description,
      event.startDate,
      event.slug,
      event.shortDescription || undefined,
      event.location || undefined,
      event.imageUrl || undefined,
      event.tags || [],
      event.eventType || undefined
    );

    logger.info(`✅ New event emails sent to ${emails.length} users`);
  } catch (error) {
    logger.error('Failed to send new event emails', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Helper function to send event registration confirmation email
async function sendEventRegistrationEmailAsync(
  userEmail: string,
  userName: string,
  event: {
    title: string;
    startDate: Date;
    slug: string;
    location?: string | null;
    imageUrl?: string | null;
  }
) {
  try {
    logger.info(`📧 Sending event registration email to ${userEmail}...`);

    await emailService.sendEventRegistration(
      userEmail,
      userName,
      event.title,
      event.startDate,
      event.slug,
      event.location || undefined,
      event.imageUrl || undefined
    );

    logger.info(`✅ Event registration email sent to ${userEmail}`);
  } catch (error) {
    logger.error('Failed to send event registration email', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
