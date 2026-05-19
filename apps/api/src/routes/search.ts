// Dashboard v2 — global Cmd+K search aggregate.
// Caps every source at 5 hits via `take: 5` (Hard Constraint: no unbounded findMany).
// Role-aware visibility: unpublished problems/polls hidden from USERs; users-only-for-admins.

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { ApiResponse } from '../utils/response.js';
import { logger } from '../utils/logger.js';

export const searchRouter = Router();

const querySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

interface SearchHit {
  kind: string;
  label: string;
  sub?: string;
  icon: string;
  route: string;
}

const ROLE_TIERS: Record<string, number> = {
  PUBLIC: 0, USER: 1, NETWORK: 1, MEMBER: 2, CORE_MEMBER: 3, ADMIN: 4, PRESIDENT: 4,
};

// Mirrors the DashboardLayout sidebar route metadata. Longer-term, move this
// into a shared web/API route manifest once the monorepo has a shared package
// that both builds consume directly.
const STATIC_PAGES: Array<{ label: string; route: string; icon: string; tags: string[]; minTier: number }> = [
  { label: 'Overview',          route: 'overview',          icon: 'home',     tags: ['overview', 'dashboard', 'home'],                    minTier: 1 },
  { label: 'My Events',         route: 'events',            icon: 'calendar', tags: ['events', 'tickets', 'registrations'],              minTier: 1 },
  { label: 'Announcements',     route: 'announcements',     icon: 'megaphone',tags: ['announcements', 'news'],                            minTier: 1 },
  { label: 'Coding',            route: 'coding',            icon: 'code',     tags: ['coding', 'practice', 'qotd', 'competition'],       minTier: 1 },
  { label: 'Live Quiz',         route: 'quiz',              icon: 'zap',      tags: ['quiz', 'live', 'kahoot', 'trivia'],                minTier: 1 },
  { label: 'Leaderboard',       route: 'leaderboard',       icon: 'trophy',   tags: ['leaderboard', 'rank', 'score'],                    minTier: 1 },
  { label: 'My Profile',        route: 'profile',           icon: 'user',     tags: ['profile', 'me', 'account'],                        minTier: 1 },
  { label: 'My Certificates',   route: 'certificates',      icon: 'award',    tags: ['certificate', 'cert', 'verify'],                   minTier: 1 },
  { label: 'My Invitations',    route: 'invitations',       icon: 'inbox',    tags: ['invitation', 'guest', 'speaker'],                  minTier: 1 },
  { label: 'Take Attendance',   route: 'attendance',        icon: 'scan',     tags: ['attendance', 'scan', 'qr'],                        minTier: 3 },
  { label: 'Create Event',      route: 'create-event',      icon: 'plus',     tags: ['create', 'event', 'new'],                          minTier: 3 },
  { label: 'Create Announcement', route: 'create-announcement', icon: 'megaphone', tags: ['create', 'announcement', 'post'],            minTier: 3 },
  { label: 'Manage QOTD',       route: 'manage-qotd',       icon: 'zap',      tags: ['qotd', 'schedule', 'publish'],                     minTier: 3 },
  { label: 'Quiz Manager',      route: 'quiz-manager',      icon: 'play',     tags: ['quiz', 'manager', 'host'],                         minTier: 3 },
  { label: 'Upload Image',      route: 'upload-image',      icon: 'upload',   tags: ['upload', 'image', 'gallery'],                      minTier: 3 },
  { label: 'User Management',   route: 'admin-users',       icon: 'users',    tags: ['users', 'admin', 'members'],                       minTier: 4 },
  { label: 'Team Management',   route: 'admin-team',        icon: 'layers',   tags: ['team', 'roster'],                                  minTier: 4 },
  { label: 'Achievements',      route: 'admin-achievements',icon: 'star',     tags: ['achievement', 'milestone'],                        minTier: 4 },
  { label: 'Problems',          route: 'admin-problems',    icon: 'terminal', tags: ['problems', 'catalog', 'judge'],                    minTier: 4 },
  { label: 'Credits',           route: 'admin-credits',     icon: 'bookOpen', tags: ['credits', 'thanks'],                               minTier: 4 },
  { label: 'Public View',       route: 'admin-public-view', icon: 'pulse',    tags: ['polls', 'feedback', 'public'],                     minTier: 4 },
  { label: 'Hiring Applications', route: 'admin-hiring',    icon: 'briefcase',tags: ['hiring', 'applications', 'jobs'],                  minTier: 4 },
  { label: 'Network Management',route: 'admin-network',     icon: 'globe',    tags: ['network', 'alumni'],                               minTier: 4 },
  { label: 'Event Registrations', route: 'admin-event-registrations', icon: 'list', tags: ['registrations', 'attendance', 'attendees'], minTier: 4 },
  { label: 'Competition',       route: 'admin-competition', icon: 'trophy',   tags: ['competition', 'round', 'dsa'],                     minTier: 4 },
  { label: 'Certificates',      route: 'admin-certificates',icon: 'award',    tags: ['certificate', 'issue', 'bulk'],                    minTier: 4 },
  { label: 'Send Mail',         route: 'admin-mail',        icon: 'mail',     tags: ['mail', 'email', 'broadcast'],                      minTier: 4 },
  { label: 'Audit Log',         route: 'admin-audit',       icon: 'shield',   tags: ['audit', 'log', 'governance'],                      minTier: 4 },
  { label: 'Settings',          route: 'admin-settings',    icon: 'settings', tags: ['settings', 'config'],                              minTier: 4 },
];

searchRouter.get('/global', authMiddleware, async (req: Request, res: Response) => {
  const auth = getAuthUser(req)!;
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return ApiResponse.validationError(res, parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })));
  }
  const q = parsed.data.q;
  const limit = parsed.data.limit ?? 5;
  const tier = ROLE_TIERS[auth.role] ?? 0;
  const isAdmin = tier >= 4;
  const isCore = tier >= 3;

  try {
    const [events, problems, polls, people, announcements] = await Promise.all([
      prisma.event.findMany({
        where: { OR: [{ title: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }] },
        select: { id: true, slug: true, title: true, status: true, startDate: true },
        orderBy: { startDate: 'desc' },
        take: limit,
      }),
      prisma.problem.findMany({
        where: {
          ...(isAdmin ? {} : { isPublished: true }),
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { slug: { contains: q, mode: 'insensitive' } },
            { tags: { has: q.toLowerCase() } },
          ],
        },
        select: { id: true, slug: true, title: true, difficulty: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.poll.findMany({
        where: {
          ...(isAdmin ? {} : { isPublished: true }),
          OR: [
            { question: { contains: q, mode: 'insensitive' } },
            { slug: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, slug: true, question: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      isAdmin
        ? prisma.user.findMany({
            where: {
              isDeleted: false,
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            },
            select: { id: true, name: true, email: true, role: true, avatar: true },
            orderBy: { createdAt: 'desc' },
            take: limit,
          })
        : Promise.resolve([]),
      prisma.announcement.findMany({
        where: {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { slug: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, slug: true, title: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);

    const qLower = q.toLowerCase();
    const pageHits: SearchHit[] = STATIC_PAGES
      .filter(p => p.minTier <= tier || isCore)
      .filter(p => p.label.toLowerCase().includes(qLower) || p.tags.some(t => t.includes(qLower)))
      .slice(0, limit)
      .map(p => ({ kind: 'page', label: p.label, icon: p.icon, route: p.route }));

    const result = {
      pages: pageHits,
      events: events.map(e => ({
        kind: 'event' as const,
        label: e.title,
        sub: e.status,
        icon: 'calendar',
        route: `/events/${e.slug || e.id}`,
      })),
      problems: problems.map(p => ({
        kind: 'problem' as const,
        label: p.title,
        sub: p.difficulty,
        icon: 'terminal',
        route: `/dashboard/coding`,
      })),
      polls: polls.map(p => ({
        kind: 'poll' as const,
        label: p.question,
        icon: 'pulse',
        route: `/polls/${p.slug}`,
      })),
      people: people.map(u => ({
        kind: 'person' as const,
        label: u.name,
        sub: `${u.role} · ${u.email}`,
        icon: 'user',
        route: `/admin/users/${u.id}`,
      })),
      announcements: announcements.map(a => ({
        kind: 'announcement' as const,
        label: a.title,
        icon: 'megaphone',
        route: `/announcements/${a.slug || a.id}`,
      })),
    };

    return ApiResponse.success(res, result);
  } catch (error) {
    logger.error('Global search failed', { q, userId: auth.id, error: error instanceof Error ? error.message : String(error) });
    return ApiResponse.internal(res, 'Search failed');
  }
});
