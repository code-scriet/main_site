import { Router, Request, Response } from 'express';
import { Prisma, RegistrationType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { calculateConsecutiveDailyStreak } from '../utils/dateStreak.js';

export const statsRouter = Router();

type DailyAggregateRow = {
  day: Date | string;
  total_count: bigint | number | string;
};

const toNumericCount = (value: bigint | number | string): number =>
  typeof value === 'bigint' ? Number(value) : Number(value);

const mapDailyAggregateRows = (rows: DailyAggregateRow[]) =>
  rows.map((row) => {
    const day = row.day instanceof Date ? row.day : new Date(row.day);
    return {
      date: day.toISOString().split('T')[0],
      count: toNumericCount(row.total_count),
    };
  });

type HomePayload = {
  stats: {
    members: number;
    events: number;
    achievements: number;
  };
  settings: {
    clubDescription: string | null;
    hiringEnabled: boolean;
    showNetwork: boolean;
  };
  upcomingEvents: Array<{
    id: string;
    title: string;
    slug: string;
    description: string;
    shortDescription: string | null;
    status: string;
    startDate: Date;
    endDate: Date | null;
    registrationStartDate: Date | null;
    registrationEndDate: Date | null;
    location: string | null;
    eventType: string | null;
    capacity: number | null;
    imageUrl: string | null;
    registrationFields: Prisma.JsonValue | null;
    _count: { registrations: number };
  }>;
  latestAnnouncements: Array<{
    id: string;
    title: string;
    slug: string | null;
    body: string;
    shortDescription: string | null;
    priority: string;
    createdAt: Date;
    creator: { id: string; name: string; avatar: string | null } | null;
  }>;
  featuredAchievements: Array<{
    id: string;
    title: string;
    slug: string;
    description: string;
    shortDescription: string | null;
    eventName: string | null;
    achievedBy: string;
    imageUrl: string | null;
    imageGallery: Prisma.JsonValue | null;
    date: Date;
    featured: boolean;
  }>;
  teamHighlights: Array<{
    id: string;
    name: string;
    role: string;
    slug: string | null;
    imageUrl: string;
    github: string | null;
    linkedin: string | null;
    twitter: string | null;
    instagram: string | null;
  }>;
  networkHighlights: Array<{
    id: string;
    slug: string | null;
    fullName: string;
    designation: string;
    company: string;
    industry: string;
    profilePhoto: string | null;
    linkedinUsername: string | null;
    githubUsername: string | null;
    personalWebsite: string | null;
    connectionType: string;
    passoutYear: number | null;
    branch: string | null;
    isFeatured: boolean;
  }>;
};

const HOME_CACHE_TTL_MS = 60 * 1000;
let homeCache: { expiresAt: number; data: HomePayload } | null = null;
let homeCacheInFlight: Promise<HomePayload> | null = null;

const getHomePayload = async (): Promise<HomePayload> => {
  const now = Date.now();
  if (homeCache && homeCache.expiresAt > now) {
    return homeCache.data;
  }

  if (homeCacheInFlight) {
    return homeCacheInFlight;
  }

  homeCacheInFlight = (async () => {
    const [
      memberCount,
      eventCount,
      achievementCount,
      settings,
      upcomingEvents,
      latestAnnouncements,
      featuredAchievements,
      teamMembersRaw,
      networkHighlights,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.event.count(),
      prisma.achievement.count(),
      prisma.settings.findFirst({
        select: { clubDescription: true, hiringEnabled: true, showNetwork: true },
      }),
      prisma.event.findMany({
        where: { status: 'UPCOMING' },
        orderBy: { startDate: 'asc' },
        take: 3,
        select: {
          id: true,
          title: true,
          slug: true,
          description: true,
          shortDescription: true,
          status: true,
          startDate: true,
          endDate: true,
          registrationStartDate: true,
          registrationEndDate: true,
          location: true,
          eventType: true,
          capacity: true,
          imageUrl: true,
          registrationFields: true,
          // Public event counts: only participant registrations belong in homepage registration totals.
          _count: {
            select: {
              registrations: {
                where: { registrationType: RegistrationType.PARTICIPANT },
              },
            },
          },
        },
      }),
      prisma.announcement.findMany({
        where: {
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
        },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        take: 3,
        select: {
          id: true,
          title: true,
          slug: true,
          body: true,
          shortDescription: true,
          priority: true,
          createdAt: true,
          creator: { select: { id: true, name: true, avatar: true } },
        },
      }),
      prisma.achievement.findMany({
        orderBy: [{ featured: 'desc' }, { date: 'desc' }],
        take: 4,
        select: {
          id: true,
          title: true,
          slug: true,
          description: true,
          shortDescription: true,
          eventName: true,
          achievedBy: true,
          imageUrl: true,
          imageGallery: true,
          date: true,
          featured: true,
        },
      }),
      prisma.teamMember.findMany({
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        take: 6,
        select: {
          id: true,
          name: true,
          role: true,
          slug: true,
          imageUrl: true,
          github: true,
          linkedin: true,
          twitter: true,
          instagram: true,
          user: {
            select: {
              avatar: true,
              githubUrl: true,
              linkedinUrl: true,
              twitterUrl: true,
            },
          },
        },
      }),
      prisma.networkProfile.findMany({
        where: { status: 'VERIFIED', isPublic: true },
        orderBy: [{ isFeatured: 'desc' }, { displayOrder: 'asc' }, { createdAt: 'desc' }],
        take: 6,
        select: {
          id: true,
          slug: true,
          fullName: true,
          designation: true,
          company: true,
          industry: true,
          profilePhoto: true,
          linkedinUsername: true,
          githubUsername: true,
          personalWebsite: true,
          connectionType: true,
          passoutYear: true,
          branch: true,
          isFeatured: true,
        },
      }),
    ]);

    const teamHighlights = teamMembersRaw.map((member) => ({
      id: member.id,
      name: member.name,
      role: member.role,
      slug: member.slug,
      imageUrl: member.imageUrl || member.user?.avatar || '',
      github: member.github || member.user?.githubUrl || null,
      linkedin: member.linkedin || member.user?.linkedinUrl || null,
      twitter: member.twitter || member.user?.twitterUrl || null,
      instagram: member.instagram || null,
    }));

    const payload: HomePayload = {
      stats: {
        members: memberCount,
        events: eventCount,
        achievements: achievementCount,
      },
      settings: {
        clubDescription: settings?.clubDescription || null,
        hiringEnabled: settings?.hiringEnabled ?? true,
        showNetwork: settings?.showNetwork ?? true,
      },
      upcomingEvents,
      latestAnnouncements,
      featuredAchievements,
      teamHighlights,
      networkHighlights,
    };

    homeCache = { data: payload, expiresAt: Date.now() + HOME_CACHE_TTL_MS };
    return payload;
  })().finally(() => {
    homeCacheInFlight = null;
  });

  return homeCacheInFlight;
};

const sendPublicStats = async (res: Response) => {
  try {
    const [userCount, eventCount, upcomingEventCount, teamMemberCount, achievementCount] = await Promise.all([
      prisma.user.count(),
      prisma.event.count(),
      prisma.event.count({ where: { status: 'UPCOMING' } }),
      prisma.teamMember.count(),
      prisma.achievement.count(),
    ]);

    res.json({
      success: true,
      data: {
        users: userCount,
        members: userCount,
        events: eventCount,
        upcomingEvents: upcomingEventCount,
        teamMembers: teamMemberCount,
        achievements: achievementCount,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch stats' } });
  }
};

// Get public stats
statsRouter.get('/', async (_req: Request, res: Response) => {
  await sendPublicStats(res);
});

// Backwards-compatible alias used by frontend
statsRouter.get('/public', async (_req: Request, res: Response) => {
  await sendPublicStats(res);
});

// Optimized aggregate payload for homepage sections
statsRouter.get('/home', async (_req: Request, res: Response) => {
  try {
    const data = await getHomePayload();
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch homepage data' } });
  }
});

// Get dashboard stats (admin)
statsRouter.get('/dashboard', authMiddleware, requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsersThisMonth,
      totalEvents,
      upcomingEvents,
      totalRegistrations,
      recentRegistrations,
      totalAnnouncements,
      totalQOTDs,
      qotdSubmissionsThisWeek,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.event.count(),
      prisma.event.count({ where: { status: 'UPCOMING' } }),
      // Dashboard registration totals track participant signups, not guest invitations.
      prisma.eventRegistration.count({ where: { registrationType: RegistrationType.PARTICIPANT } }),
      // Dashboard registration totals track participant signups, not guest invitations.
      prisma.eventRegistration.count({
        where: {
          registrationType: RegistrationType.PARTICIPANT,
          timestamp: { gte: sevenDaysAgo },
        },
      }),
      prisma.announcement.count(),
      prisma.qOTD.count(),
      prisma.qOTDSubmission.count({ where: { timestamp: { gte: sevenDaysAgo } } }),
    ]);

    // Public-facing popularity should rank by participant registrations, not guest invitations.
    const popularEventCounts = await prisma.eventRegistration.groupBy({
      by: ['eventId'],
      where: {
        registrationType: RegistrationType.PARTICIPANT,
      },
      _count: {
        eventId: true,
      },
      orderBy: {
        _count: {
          eventId: 'desc',
        },
      },
      take: 5,
    });

    const popularEventIds = popularEventCounts.map((entry) => entry.eventId);
    const popularEventsById = new Map(
      (popularEventIds.length > 0
        ? await prisma.event.findMany({
            where: {
              id: {
                in: popularEventIds,
              },
            },
            select: {
              id: true,
              title: true,
            },
          })
        : [])
        .map((event) => [event.id, event]),
    );

    const popularEvents = popularEventCounts
      .map((entry) => {
        const event = popularEventsById.get(entry.eventId);
        if (!event) {
          return null;
        }

        return {
          id: event.id,
          title: event.title,
          registrations: entry._count.eventId,
        };
      })
      .filter((entry): entry is { id: string; title: string; registrations: number } => Boolean(entry));

    const recentUsers = await prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, createdAt: true },
    });

    res.json({
      success: true,
      data: {
        overview: { totalUsers, newUsersThisMonth, totalEvents, upcomingEvents, totalRegistrations, recentRegistrations, totalAnnouncements, totalQOTDs, qotdSubmissionsThisWeek },
        popularEvents,
        recentUsers,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch dashboard stats' } });
  }
});

// Get user stats
statsRouter.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authUser = getAuthUser(req)!;

    const [registrationCount, qotdSubmissionCount, registrations, submissions] = await Promise.all([
      prisma.eventRegistration.count({ where: { userId: authUser.id } }),
      prisma.qOTDSubmission.count({ where: { userId: authUser.id } }),
      prisma.eventRegistration.findMany({
        where: { userId: authUser.id },
        take: 5,
        orderBy: { timestamp: 'desc' },
        select: {
          id: true,
          timestamp: true,
          event: { select: { title: true, startDate: true } },
        },
      }),
      prisma.qOTDSubmission.findMany({
        where: { userId: authUser.id },
        select: { qotd: { select: { date: true } } },
      }),
    ]);

    const streak = calculateConsecutiveDailyStreak(
      submissions.map((submission) => submission.qotd.date),
      new Date()
    );

    res.json({
      success: true,
      data: {
        eventsRegistered: registrationCount,
        qotdSubmissions: qotdSubmissionCount,
        qotdStreak: streak,
        recentRegistrations: registrations.map((registration) => ({
          id: registration.id,
          eventTitle: registration.event.title,
          eventDate: registration.event.startDate,
          registeredAt: registration.timestamp,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch user stats' } });
  }
});

// Get event registration trends (admin)
statsRouter.get('/events/trends', authMiddleware, requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const registrations = await prisma.$queryRaw<DailyAggregateRow[]>`
      SELECT date_trunc('day', "timestamp") AS day, COUNT(*)::bigint AS total_count
      FROM "event_registrations"
      WHERE "timestamp" >= ${thirtyDaysAgo}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    res.json({ success: true, data: mapDailyAggregateRows(registrations) });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch trends' } });
  }
});

// Get QOTD participation trends (admin)
statsRouter.get('/qotd/trends', authMiddleware, requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const submissions = await prisma.$queryRaw<DailyAggregateRow[]>`
      SELECT date_trunc('day', "timestamp") AS day, COUNT(*)::bigint AS total_count
      FROM "qotd_submissions"
      WHERE "timestamp" >= ${thirtyDaysAgo}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    res.json({ success: true, data: mapDailyAggregateRows(submissions) });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch QOTD trends' } });
  }
});
