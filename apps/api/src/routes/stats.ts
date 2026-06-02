import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { calculateConsecutiveDailyStreak } from '../utils/dateStreak.js';
import { participantsOnly } from '../utils/registrationFilters.js';

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
              registrations: { where: participantsOnly },
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
    const [userCount, eventCount, upcomingEventCount, teamMemberCount, achievementCount, teamGroups] = await Promise.all([
      prisma.user.count(),
      prisma.event.count(),
      prisma.event.count({ where: { status: 'UPCOMING' } }),
      prisma.teamMember.count(),
      prisma.achievement.count(),
      // Per-team head count for the /about Teams section. Keyed by TeamMember.team
      // (free-form string column, e.g. "Core", "Technical", "DSA Champs").
      prisma.teamMember.groupBy({ by: ['team'], _count: { _all: true } }),
    ]);

    const teamCounts: Record<string, number> = {};
    for (const g of teamGroups) {
      if (g.team) teamCounts[g.team] = g._count._all;
    }

    res.json({
      success: true,
      data: {
        users: userCount,
        members: userCount,
        events: eventCount,
        upcomingEvents: upcomingEventCount,
        teamMembers: teamMemberCount,
        achievements: achievementCount,
        teamCounts,
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
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousWeek = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const [
      totalUsers,
      newUsersThisMonth,
      newUsersLastWeek,
      newUsersPriorWeek,
      totalEvents,
      upcomingEvents,
      activeEvents,
      totalRegistrations,
      recentRegistrations,
      totalAnnouncements,
      totalQOTDs,
      qotdSubmissionsThisWeek,
      pendingInvitationsCount,
      certificatesThisMonth,
      liveScansLastHour,
      quizSessionsLast7d,
      registrationsThisWeek,
      attendedThisWeekRows,
      streakAggregate,
      acRateRows,
      networkPendingRows,
      playgroundPressureRows,
      topContributorRows,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: previousWeek, lt: sevenDaysAgo } } }),
      prisma.event.count(),
      prisma.event.count({ where: { status: 'UPCOMING' } }),
      prisma.event.count({ where: { status: 'ONGOING' } }),
      prisma.eventRegistration.count({ where: { ...participantsOnly } }),
      prisma.eventRegistration.count({
        where: { ...participantsOnly, timestamp: { gte: sevenDaysAgo } },
      }),
      prisma.announcement.count(),
      prisma.qOTD.count(),
      prisma.qOTDSubmission.count({ where: { timestamp: { gte: sevenDaysAgo } } }),
      prisma.eventInvitation.count({ where: { status: 'PENDING' } }),
      prisma.certificate.count({ where: { issuedAt: { gte: startOfMonth }, isRevoked: false } }),
      // Hard Constraint #11: scans-last-hour reflects participant attendance only; guests do not count.
      prisma.eventRegistration.count({ where: { ...participantsOnly, scannedAt: { gte: oneHourAgo } } }),
      prisma.quiz.count({ where: { updatedAt: { gte: sevenDaysAgo }, status: { in: ['ACTIVE', 'FINISHED'] } } }),
      prisma.eventRegistration.count({
        where: { ...participantsOnly, timestamp: { gte: sevenDaysAgo } },
      }),
      prisma.eventRegistration.count({
        where: { ...participantsOnly, attended: true, scannedAt: { gte: sevenDaysAgo } },
      }),
      prisma.user.aggregate({
        _avg: { currentStreak: true },
        _max: { currentStreak: true },
        where: { isDeleted: false },
      }),
      prisma.problemSubmission.groupBy({
        by: ['verdict'],
        where: { submittedAt: { gte: sevenDaysAgo } },
        _count: { verdict: true },
      }),
      prisma.networkProfile.count({ where: { status: 'PENDING' } }),
      // Playground pressure: distinct users hitting the cap today vs total active users today
      prisma.playgroundDailyUsage.count({
        where: { usageDate: new Date(now.toISOString().slice(0, 10)) },
      }),
      // Top contributor this month — most QOTD submissions in the month
      prisma.qOTDSubmission.groupBy({
        by: ['userId'],
        where: { timestamp: { gte: startOfMonth } },
        _count: { userId: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 1,
      }),
    ]);

    // Second wave: top-contributor user resolution + settings + playground-at-cap
    // were previously three sequential round-trips. Batch them with Promise.all
    // so admin dashboards on the free-tier API service feel snappier.
    const topUserId = topContributorRows.length > 0 ? topContributorRows[0].userId : null;
    const todayDateKey = new Date(now.toISOString().slice(0, 10));

    const [topContributorUser, settings] = await Promise.all([
      topUserId
        ? prisma.user.findUnique({
            where: { id: topUserId },
            select: { id: true, name: true, avatar: true },
          })
        : Promise.resolve(null),
      prisma.settings.findUnique({ where: { id: 'default' }, select: { playgroundDailyLimit: true } }),
    ]);

    let topContributor: { id: string; name: string; avatar: string | null; count: number } | null = null;
    if (topContributorUser && topContributorRows.length > 0) {
      topContributor = { ...topContributorUser, count: topContributorRows[0]._count.userId };
    }

    const totalSubmissionsThisWeek = acRateRows.reduce((sum, r) => sum + r._count.verdict, 0);
    const acCountThisWeek = acRateRows.find(r => r.verdict === 'ACCEPTED')?._count.verdict ?? 0;
    const acRatePct = totalSubmissionsThisWeek > 0 ? Math.round((acCountThisWeek / totalSubmissionsThisWeek) * 100) : 0;

    const dailyLimit = settings?.playgroundDailyLimit ?? 100;
    const playgroundAtCap = await prisma.playgroundDailyUsage.count({
      where: { usageDate: todayDateKey, count: { gte: dailyLimit } },
    });
    const playgroundPressurePct = playgroundPressureRows > 0
      ? Math.round((playgroundAtCap / playgroundPressureRows) * 100)
      : 0;

    const insights = {
      // 1. Total users + Δ last week
      totalUsers,
      newUsersLastWeek,
      usersDelta: newUsersLastWeek - newUsersPriorWeek,
      // 2. Active events count
      activeEvents,
      upcomingEvents,
      // 3. Pending invitations
      pendingInvitationsCount,
      // 4. Certificates issued this month
      certificatesThisMonth,
      // 5. Live attendance scans · last 1h
      liveScansLastHour,
      // 6. Quiz sessions · last 7d
      quizSessionsLast7d,
      // 7. Registration funnel — created vs attended
      registrationsThisWeek,
      attendedThisWeek: attendedThisWeekRows,
      // 8. QOTD streak distribution
      averageStreak: Math.round((streakAggregate._avg.currentStreak ?? 0) * 10) / 10,
      longestStreakOverall: streakAggregate._max.currentStreak ?? 0,
      // 9. Problem AC rate this week
      acRatePct,
      submissionsThisWeek: totalSubmissionsThisWeek,
      // 10. Top contributor this month
      topContributor,
      // 11. Network pending
      networkPending: networkPendingRows,
      // 12. Playground daily-quota pressure
      playgroundPressurePct,
      playgroundActiveToday: playgroundPressureRows,
      playgroundAtCap,
    };

    // Public-facing popularity should rank by participant registrations, not guest invitations.
    const popularEventCounts = await prisma.eventRegistration.groupBy({
      by: ['eventId'],
      where: { ...participantsOnly },
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
        insights,
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
