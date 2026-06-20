import { prisma } from '../lib/prisma.js';
import { formatUsageDate } from './dailyLimit.js';
import { logger } from './logger.js';
import { broadcastNotification } from './notifications.js';

// S-05 — streak milestone celebrations. When a user's currentStreak crosses one
// of these on a QOTD submit, ring their bell once. Crossing is detected against
// the previously-materialized User.currentStreak (old < threshold ≤ new), which
// makes it idempotent: once the new value is written, a later recompute sees
// old === new and won't re-fire. Only the single-user submit path
// (recomputeUserStreak) celebrates — the batch publish/hold recompute deliberately
// does not, so an admin toggling a QOTD never blasts milestone bells.
const STREAK_MILESTONES = [7, 30, 50, 100, 365] as const;
const STREAK_MILESTONE_COPY: Record<number, string> = {
  7: 'A full week of showing up. The habit is forming.',
  30: 'Genuinely rare — most people never get here.',
  50: 'Fifty days straight. Elite consistency.',
  100: 'Triple digits. This is legendary territory.',
  365: 'A full year, every single day. Unreal.',
};

function fireStreakMilestone(userId: string, oldStreak: number, newStreak: number): void {
  if (newStreak <= oldStreak) return;
  // Celebrate the highest threshold crossed in this jump (avoids multiple bells
  // if a recompute leaps several days, e.g. after a publish restores a chain).
  let crossed = 0;
  for (const t of STREAK_MILESTONES) {
    if (oldStreak < t && t <= newStreak) crossed = t;
  }
  if (crossed === 0) return;
  void broadcastNotification({
    source: 'AUTO_QOTD',
    audience: 'CUSTOM',
    audienceUserIds: [userId],
    category: 'streak',
    icon: 'zap',
    title: `🔥 ${crossed}-day streak!`,
    body: STREAK_MILESTONE_COPY[crossed] ?? `You've solved the daily problem ${crossed} days in a row.`,
    link: '/qotd/today',
    refEntity: 'streak-milestone',
    refEntityId: `${userId}:${crossed}`,
  }).catch((err) =>
    logger.warn('streak milestone notification failed', {
      userId, crossed, err: err instanceof Error ? err.message : String(err),
    }),
  );
}

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

// Publish-day-aware streak walk shared by the single-user and batch recomputes
// so both paths stay semantically identical: current = consecutive published
// days solved walking back from today (future schedules skipped), longest =
// longest consecutive solved run across all published days.
function computePublishAwareStreaks(
  publishedDates: string[],
  solvedDays: Set<string>,
  todayKey: string,
): { currentStreak: number; longestStreak: number } {
  let currentStreak = 0;
  // Today-grace: if the most-recent non-future published day is *today* and the
  // user hasn't solved it yet, don't break the streak on it — they still have
  // until end of day (IST). Granted at most once, only for today (a past
  // unsolved published day is a real break). At materialize time the user has
  // just solved, so this branch never fires there — materialized values are
  // unchanged; it only affects the live read (computeQOTDStats).
  let todayGraceUsed = false;
  for (let i = publishedDates.length - 1; i >= 0; i--) {
    const d = publishedDates[i];
    if (d > todayKey) continue;
    if (solvedDays.has(d)) {
      currentStreak += 1;
    } else if (d === todayKey && !todayGraceUsed) {
      todayGraceUsed = true;
      continue;
    } else {
      break;
    }
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

  return { currentStreak, longestStreak };
}

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
  const { currentStreak, longestStreak } = computePublishAwareStreaks(publishedDates, solvedDays, todayKey);

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

  // S-05: celebrate a freshly-crossed streak milestone (fire-and-forget).
  fireStreakMilestone(userId, existing?.currentStreak ?? 0, currentStreak);

  return { currentStreak, longestStreak, longestStreakAt };
}

export async function computeQOTDStats(userId: string): Promise<QOTDStats> {
  const today = formatUsageDate();

  // Single source of truth for the streak: the publish-aware walk shared with the
  // materialized User.currentStreak (days with no published QOTD are transparent;
  // held days excluded). Loaded once and reused below so this read agrees with the
  // dashboard widget, share card, admin stats and leaderboard.
  const publishedDates = await loadPublishedQotdDates();

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

  const { currentStreak, longestStreak } = computePublishAwareStreaks(publishedDates, solvedDays, today);
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

/**
 * Recompute streaks for every user who submitted on a single QOTD day. Called
 * after publish/hold flips so that materialized User.currentStreak /
 * longestStreak stay in sync with the set of published-and-not-held days.
 *
 * Fire-and-forget: the publish/hold response is already returned to the admin
 * by the time this runs; failures are logged.
 *
 * Bounded by the unique submitters on a single day, so safe at free-tier
 * scale even for popular QOTDs.
 */
export function recomputeStreaksForQOTDSafe(qotdId: string): void {
  void (async () => {
    try {
      // Always re-resolve the published-day set so our streak math reflects
      // the publish/hold flip we were called from.
      invalidatePublishedQotdCache();
      const [legacyRows, problemRows] = await Promise.all([
        prisma.qOTDSubmission.findMany({ where: { qotdId }, select: { userId: true } }),
        prisma.problemSubmission.findMany({
          where: { contextType: 'QOTD', contextKey: qotdId, verdict: 'ACCEPTED' },
          select: { userId: true },
        }),
      ]);
      const userIds = new Set<string>();
      for (const r of legacyRows) userIds.add(r.userId);
      for (const r of problemRows) userIds.add(r.userId);
      await recomputeStreaksForUserSet(Array.from(userIds), qotdId);
    } catch (err) {
      logger.warn('recomputeStreaksForQOTD failed', { qotdId, err: err instanceof Error ? err.message : String(err) });
    }
  })();
}

/**
 * Batch streak recompute for a set of users. Replaces the old serial
 * per-user loop (~5 queries × N submitters at every publish/hold flip) with
 * grouped reads: 2 findMany({ userId: { in } }) + one qotd-id resolution +
 * one grouped user read, then per-user math in JS against the shared
 * published-day set. Only rows whose streak values actually changed are
 * written. Bounded by the unique submitters on a single QOTD day.
 */
async function recomputeStreaksForUserSet(userIds: string[], qotdId: string): Promise<void> {
  if (userIds.length === 0) return;
  const publishedDates = await loadPublishedQotdDates();
  const todayKey = formatUsageDate();

  const [legacyRows, problemRows, users] = await Promise.all([
    prisma.qOTDSubmission.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, qotd: { select: { date: true } } },
    }),
    prisma.problemSubmission.findMany({
      where: { userId: { in: userIds }, contextType: 'QOTD', verdict: 'ACCEPTED' },
      select: { userId: true, contextKey: true },
    }),
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, currentStreak: true, longestStreak: true },
    }),
  ]);

  const qotdIds = Array.from(new Set(problemRows.map((r) => r.contextKey)));
  const qotdLookup = qotdIds.length
    ? await prisma.qOTD.findMany({ where: { id: { in: qotdIds } }, select: { id: true, date: true } })
    : [];
  const qotdById = new Map(qotdLookup.map((q) => [q.id, q.date] as const));

  const solvedByUser = new Map<string, Set<string>>();
  const remember = (uid: string, key: string) => {
    const existing = solvedByUser.get(uid);
    if (existing) existing.add(key);
    else solvedByUser.set(uid, new Set([key]));
  };
  for (const r of legacyRows) remember(r.userId, formatUsageDate(r.qotd.date));
  for (const r of problemRows) {
    const d = qotdById.get(r.contextKey);
    if (d) remember(r.userId, formatUsageDate(d));
  }

  for (const u of users) {
    // Mirror recomputeUserStreak exactly: with no published days, only
    // currentStreak resets — longestStreak is deliberately left untouched.
    const { currentStreak, longestStreak } = publishedDates.length === 0
      ? { currentStreak: 0, longestStreak: u.longestStreak }
      : computePublishAwareStreaks(publishedDates, solvedByUser.get(u.id) ?? new Set<string>(), todayKey);

    if (u.currentStreak === currentStreak && u.longestStreak === longestStreak) continue;
    const longestImproved = longestStreak > u.longestStreak;
    await prisma.user.update({
      where: { id: u.id },
      data: {
        currentStreak,
        longestStreak,
        ...(longestImproved ? { longestStreakAt: new Date() } : {}),
      },
    }).catch((err) => {
      logger.warn('recomputeUserStreak (batch write) failed', {
        userId: u.id,
        qotdId,
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }
}
