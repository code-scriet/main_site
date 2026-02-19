import { Router, Request, Response } from 'express';
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
      prisma.eventRegistration.count(),
      prisma.eventRegistration.count({ where: { timestamp: { gte: sevenDaysAgo } } }),
      prisma.announcement.count(),
      prisma.qOTD.count(),
      prisma.qOTDSubmission.count({ where: { timestamp: { gte: sevenDaysAgo } } }),
    ]);

    const popularEvents = await prisma.event.findMany({
      take: 5,
      orderBy: { registrations: { _count: 'desc' } },
      include: { _count: { select: { registrations: true } } },
    });

    const recentUsers = await prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, createdAt: true },
    });

    res.json({
      success: true,
      data: {
        overview: { totalUsers, newUsersThisMonth, totalEvents, upcomingEvents, totalRegistrations, recentRegistrations, totalAnnouncements, totalQOTDs, qotdSubmissionsThisWeek },
        popularEvents: popularEvents.map((e) => ({ id: e.id, title: e.title, registrations: e._count.registrations })),
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
