import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';

export const statsRouter = Router();

// Get public stats
statsRouter.get('/', async (_req: Request, res: Response) => {
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
      data: { users: userCount, events: eventCount, upcomingEvents: upcomingEventCount, teamMembers: teamMemberCount, achievements: achievementCount },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch stats' } });
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

    const [registrationCount, qotdSubmissionCount, registrations] = await Promise.all([
      prisma.eventRegistration.count({ where: { userId: authUser.id } }),
      prisma.qOTDSubmission.count({ where: { userId: authUser.id } }),
      prisma.eventRegistration.findMany({
        where: { userId: authUser.id },
        take: 5,
        orderBy: { timestamp: 'desc' },
        include: { event: { select: { id: true, title: true, startDate: true } } },
      }),
    ]);

    const submissions = await prisma.qOTDSubmission.findMany({
      where: { userId: authUser.id },
      include: { qotd: true },
      orderBy: { timestamp: 'desc' },
    });

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < submissions.length; i++) {
      const submissionDate = new Date(submissions[i].qotd.date);
      submissionDate.setHours(0, 0, 0, 0);
      const expectedDate = new Date(today);
      expectedDate.setDate(today.getDate() - i);

      if (submissionDate.getTime() === expectedDate.getTime()) {
        streak++;
      } else {
        break;
      }
    }

    res.json({
      success: true,
      data: {
        eventsRegistered: registrationCount,
        qotdSubmissions: qotdSubmissionCount,
        qotdStreak: streak,
        recentRegistrations: registrations.map((r) => ({
          id: r.id,
          eventTitle: r.event.title,
          eventDate: r.event.startDate,
          registeredAt: r.timestamp,
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

    const registrations = await prisma.eventRegistration.findMany({
      where: { timestamp: { gte: thirtyDaysAgo } },
      select: { timestamp: true },
      orderBy: { timestamp: 'asc' },
    });

    const dailyCounts: Record<string, number> = {};
    registrations.forEach((r) => {
      const day = r.timestamp.toISOString().split('T')[0];
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    });

    const trends = Object.entries(dailyCounts).map(([date, count]) => ({ date, count }));
    res.json({ success: true, data: trends });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch trends' } });
  }
});

// Get QOTD participation trends (admin)
statsRouter.get('/qotd/trends', authMiddleware, requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const submissions = await prisma.qOTDSubmission.findMany({
      where: { timestamp: { gte: thirtyDaysAgo } },
      select: { timestamp: true },
      orderBy: { timestamp: 'asc' },
    });

    const dailyCounts: Record<string, number> = {};
    submissions.forEach((s) => {
      const day = s.timestamp.toISOString().split('T')[0];
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    });

    const trends = Object.entries(dailyCounts).map(([date, count]) => ({ date, count }));
    res.json({ success: true, data: trends });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to fetch QOTD trends' } });
  }
});
