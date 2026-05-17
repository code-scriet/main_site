import { prisma } from '../lib/prisma.js';
import { formatUsageDate } from './dailyLimit.js';
import { logger } from './logger.js';

export type BadgeKind = 'streak' | 'volume';

export interface Badge {
  id: string;
  label: string;
  description: string;
  kind: BadgeKind;
  threshold: number;
  icon: string;
  earned: boolean;
}

export interface DayActivity {
  date: string; // IST YYYY-MM-DD
  solved: boolean;
}

export interface QOTDStats {
  currentStreak: number;
  longestStreak: number;
  totalSolved: number;
  daysActive: number;
  todaySolved: boolean;
  last30Days: DayActivity[];
  badges: Badge[];
  nextMilestone: {
    kind: BadgeKind;
    label: string;
    description: string;
    icon: string;
    progress: number;
    target: number;
    remaining: number;
  } | null;
  recentSubmissions: Array<{
    date: string;
    difficulty: string;
    timestamp: string;
  }>;
}

const STREAK_BADGES: Array<Omit<Badge, 'earned'>> = [
  { id: 'spark', label: 'First Spark', description: 'Solve your first QOTD', kind: 'streak', threshold: 1, icon: '🔥' },
  { id: 'week-warrior', label: 'Week Warrior', description: 'Maintain a 7-day streak', kind: 'streak', threshold: 7, icon: '🔥' },
  { id: 'monthly-master', label: 'Monthly Master', description: 'Maintain a 30-day streak', kind: 'streak', threshold: 30, icon: '🌙' },
  { id: 'centurion', label: 'Centurion', description: 'Maintain a 100-day streak', kind: 'streak', threshold: 100, icon: '💯' },
  { id: 'year-saga', label: 'Year Saga', description: 'Maintain a 365-day streak', kind: 'streak', threshold: 365, icon: '🌟' },
];

const VOLUME_BADGES: Array<Omit<Badge, 'earned'>> = [
  { id: 'apprentice', label: 'Apprentice', description: 'Solve 10 QOTDs in total', kind: 'volume', threshold: 10, icon: '🥉' },
  { id: 'adept', label: 'Adept', description: 'Solve 25 QOTDs in total', kind: 'volume', threshold: 25, icon: '🥈' },
  { id: 'master', label: 'Master', description: 'Solve 50 QOTDs in total', kind: 'volume', threshold: 50, icon: '🥇' },
  { id: 'centurion-solves', label: 'Centurion Solves', description: 'Solve 100 QOTDs in total', kind: 'volume', threshold: 100, icon: '🏆' },
];

function shiftIstDay(istKey: string, deltaDays: number): string {
  const [y, m, d] = istKey.split('-').map(Number);
  // Treat as UTC date for arithmetic, then re-stringify; offset by 12:00 to dodge DST edges (none in IST but safe).
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return `${base.getUTCFullYear().toString().padStart(4, '0')}-${(base.getUTCMonth() + 1).toString().padStart(2, '0')}-${base.getUTCDate().toString().padStart(2, '0')}`;
}

function computeStreaks(solvedDays: Set<string>, today: string): { currentStreak: number; longestStreak: number } {
  if (solvedDays.size === 0) return { currentStreak: 0, longestStreak: 0 };

  // Current streak: walk back from today (or yesterday if today not solved) while every consecutive IST day is in the set.
  let cursor = today;
  if (!solvedDays.has(cursor)) {
    cursor = shiftIstDay(cursor, -1); // grace: a user who hasn't solved today yet still has yesterday's streak intact
  }
  let currentStreak = 0;
  while (solvedDays.has(cursor)) {
    currentStreak += 1;
    cursor = shiftIstDay(cursor, -1);
  }

  // Longest streak: sort all solved days, walk through finding the longest consecutive run.
  const sorted = Array.from(solvedDays).sort();
  let longestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of sorted) {
    if (prev === null || shiftIstDay(prev, 1) === day) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longestStreak) longestStreak = run;
    prev = day;
  }

  return { currentStreak, longestStreak };
}

function makeBadges(currentStreak: number, longestStreak: number, totalSolved: number): { badges: Badge[]; nextMilestone: QOTDStats['nextMilestone'] } {
  const badges: Badge[] = [
    ...STREAK_BADGES.map((b) => ({ ...b, earned: longestStreak >= b.threshold || currentStreak >= b.threshold })),
    ...VOLUME_BADGES.map((b) => ({ ...b, earned: totalSolved >= b.threshold })),
  ];
  // First Spark also counts when totalSolved >= 1 (you don't need a 1-day "streak" for solving once).
  const spark = badges.find((b) => b.id === 'spark');
  if (spark && totalSolved >= 1) spark.earned = true;

  // Next milestone: cheapest unmet badge by remaining distance.
  const candidates = badges
    .filter((b) => !b.earned)
    .map((b) => ({
      badge: b,
      remaining: b.kind === 'streak' ? Math.max(0, b.threshold - currentStreak) : Math.max(0, b.threshold - totalSolved),
      progress: b.kind === 'streak' ? currentStreak : totalSolved,
    }))
    .sort((a, b) => a.remaining - b.remaining);

  const next = candidates[0];
  return {
    badges,
    nextMilestone: next
      ? {
          kind: next.badge.kind,
          label: next.badge.label,
          description: next.badge.description,
          icon: next.badge.icon,
          progress: next.progress,
          target: next.badge.threshold,
          remaining: next.remaining,
        }
      : null,
  };
}

// Publish-day-aware streak helper (admin-deep-control).
// Definition: consecutive QOTD-publish-days the user submitted on.
// Days without a published QOTD are transparent — they neither extend nor break.
// `heldBy IS NULL` excludes administratively held QOTDs from the chain.
// Result is materialized into User.currentStreak / longestStreak / longestStreakAt.

interface PublishedDateCache { count: number; dateKeys: string[] }
let publishedDateCache: { expiresAt: number; data: PublishedDateCache } | null = null;
const PUBLISHED_DATE_CACHE_TTL_MS = 60 * 1000;

async function loadPublishedQotdDates(): Promise<string[]> {
  const now = Date.now();
  if (publishedDateCache && publishedDateCache.expiresAt > now) {
    return publishedDateCache.data.dateKeys;
  }
  const rows = await prisma.qOTD.findMany({
    where: {
      isPublished: true,
      heldBy: null,
      OR: [
        { publishedAt: { lte: new Date() } },
        { publishedAt: null },
      ],
    },
    select: { date: true },
    orderBy: { date: 'asc' },
  });
  const dateKeys = rows.map((r) => formatUsageDate(r.date));
  publishedDateCache = {
    expiresAt: now + PUBLISHED_DATE_CACHE_TTL_MS,
    data: { count: dateKeys.length, dateKeys },
  };
  return dateKeys;
}

export function invalidatePublishedQotdCache(): void {
  publishedDateCache = null;
}

export interface StreakResult { currentStreak: number; longestStreak: number; longestStreakAt: Date | null }

export async function recomputeUserStreak(userId: string): Promise<StreakResult> {
  const publishedDates = await loadPublishedQotdDates();
  if (publishedDates.length === 0) {
    await prisma.user.update({ where: { id: userId }, data: { currentStreak: 0 } }).catch(() => undefined);
    return { currentStreak: 0, longestStreak: 0, longestStreakAt: null };
  }

  const [legacyRows, problemRows] = await Promise.all([
    prisma.qOTDSubmission.findMany({ where: { userId }, select: { qotd: { select: { date: true } } } }),
    prisma.problemSubmission.findMany({
      where: { userId, contextType: 'QOTD', verdict: 'ACCEPTED' },
      select: { contextKey: true },
    }),
  ]);

  const qotdIds = Array.from(new Set(problemRows.map((r) => r.contextKey)));
  const qotdLookup = qotdIds.length
    ? await prisma.qOTD.findMany({ where: { id: { in: qotdIds } }, select: { id: true, date: true } })
    : [];
  const qotdById = new Map(qotdLookup.map((q) => [q.id, q.date] as const));

  const solvedDays = new Set<string>();
  for (const row of legacyRows) solvedDays.add(formatUsageDate(row.qotd.date));
  for (const row of problemRows) {
    const d = qotdById.get(row.contextKey);
    if (d) solvedDays.add(formatUsageDate(d));
  }

  const todayKey = formatUsageDate();
  let currentStreak = 0;
  for (let i = publishedDates.length - 1; i >= 0; i--) {
    const d = publishedDates[i];
    if (d > todayKey) continue;
    if (solvedDays.has(d)) currentStreak += 1;
    else break;
  }

  let longestStreak = 0;
  let run = 0;
  for (const d of publishedDates) {
    if (solvedDays.has(d)) {
      run += 1;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 0;
    }
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentStreak: true, longestStreak: true, longestStreakAt: true },
  });

  let longestStreakAt = existing?.longestStreakAt ?? null;
  const longestImproved = longestStreak > (existing?.longestStreak ?? 0);
  if (longestImproved) longestStreakAt = new Date();

  if (!existing || existing.currentStreak !== currentStreak || existing.longestStreak !== longestStreak) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        currentStreak,
        longestStreak,
        ...(longestImproved ? { longestStreakAt } : {}),
      },
    });
  }

  return { currentStreak, longestStreak, longestStreakAt };
}

export async function computeQOTDStats(userId: string): Promise<QOTDStats> {
  const today = formatUsageDate();

  // Pull every QOTD that this user has either legacy-submitted or solved via the problems judge.
  const [legacyRows, problemRows, recentProblemSubs, recentLegacySubs] = await Promise.all([
    prisma.qOTDSubmission.findMany({
      where: { userId },
      select: { timestamp: true, qotd: { select: { date: true, difficulty: true } } },
    }),
    prisma.problemSubmission.findMany({
      where: { userId, contextType: 'QOTD', verdict: 'ACCEPTED' },
      select: { submittedAt: true, contextKey: true },
    }),
    prisma.problemSubmission.findMany({
      where: { userId, contextType: 'QOTD', verdict: 'ACCEPTED' },
      orderBy: { submittedAt: 'desc' },
      take: 5,
      select: { submittedAt: true, contextKey: true },
    }),
    prisma.qOTDSubmission.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: 5,
      select: { timestamp: true, qotd: { select: { date: true, difficulty: true } } },
    }),
  ]);

  // Resolve problem-submission contextKeys (QOTD ids) to dates.
  const qotdIds = Array.from(new Set([
    ...problemRows.map((row) => row.contextKey),
    ...recentProblemSubs.map((row) => row.contextKey),
  ]));
  const qotdLookup = qotdIds.length
    ? await prisma.qOTD.findMany({ where: { id: { in: qotdIds } }, select: { id: true, date: true, difficulty: true } })
    : [];
  const qotdById = new Map(qotdLookup.map((q) => [q.id, q]));

  // Build the set of IST date keys where the user solved a QOTD.
  const solvedDays = new Set<string>();
  for (const row of legacyRows) solvedDays.add(formatUsageDate(row.qotd.date));
  for (const row of problemRows) {
    const q = qotdById.get(row.contextKey);
    if (q) solvedDays.add(formatUsageDate(q.date));
  }

  const { currentStreak, longestStreak } = computeStreaks(solvedDays, today);
  const totalSolved = solvedDays.size;
  const todaySolved = solvedDays.has(today);

  // Last 30 days (oldest → newest) for the heatmap.
  const last30Days: DayActivity[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = shiftIstDay(today, -i);
    last30Days.push({ date: day, solved: solvedDays.has(day) });
  }

  const { badges, nextMilestone } = makeBadges(currentStreak, longestStreak, totalSolved);

  // Merge recent submissions (problem + legacy) and present a single list.
  const problemRecent = recentProblemSubs.map((row) => {
    const q = qotdById.get(row.contextKey);
    return {
      date: q ? q.date.toISOString() : row.submittedAt.toISOString(),
      difficulty: q?.difficulty ?? 'UNKNOWN',
      timestamp: row.submittedAt.toISOString(),
    };
  });
  const legacyRecent = recentLegacySubs.map((row) => ({
    date: row.qotd.date.toISOString(),
    difficulty: row.qotd.difficulty,
    timestamp: row.timestamp.toISOString(),
  }));
  const recentSubmissions = [...problemRecent, ...legacyRecent]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 10);

  return {
    currentStreak,
    longestStreak,
    totalSolved,
    daysActive: totalSolved,
    todaySolved,
    last30Days,
    badges,
    nextMilestone,
    recentSubmissions,
  };
}

/**
 * Best-effort fire-and-forget streak recompute. Use in submit paths where the request
 * has already succeeded and a delayed streak update is acceptable. Errors are logged,
 * never thrown.
 */
export function recomputeUserStreakSafe(userId: string): void {
  recomputeUserStreak(userId).catch((err) => {
    logger.warn('recomputeUserStreak failed', { userId, err: err instanceof Error ? err.message : String(err) });
  });
}
