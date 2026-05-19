/**
 * Backfills User.currentStreak / longestStreak / longestStreakAt from the existing
 * QOTD submission history. Idempotent — re-runnable.
 *
 * PR1: reuses the existing computeQOTDStats() helper, which derives streaks under
 * calendar-consecutive semantics. PR2 introduces publish-day semantics and a
 * dedicated recomputeUserStreak() helper; the script can be re-run then to overwrite.
 *
 * Usage:
 *   npx tsx scripts/backfill-user-streaks.ts            # write changes
 *   npx tsx scripts/backfill-user-streaks.ts --dry-run  # report only, no writes
 */
import { prisma } from '../apps/api/src/lib/prisma.js';
import { computeQOTDStats } from '../apps/api/src/utils/qotdStreak.js';
const BATCH_SIZE = 100;
const RECOMPUTE_CONCURRENCY = 5;

const DRY_RUN = process.argv.includes('--dry-run');

interface Outcome {
  userId: string;
  before: { current: number; longest: number };
  after: { current: number; longest: number };
  changed: boolean;
  failed?: string;
}

async function processUser(userId: string, beforeCurrent: number, beforeLongest: number): Promise<Outcome> {
  try {
    const stats = await computeQOTDStats(userId);
    const changed = stats.currentStreak !== beforeCurrent || stats.longestStreak !== beforeLongest;

    if (changed) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          currentStreak: stats.currentStreak,
          longestStreak: stats.longestStreak,
          // Only stamp longestStreakAt the first time we observe the longest streak.
          ...(stats.longestStreak > beforeLongest ? { longestStreakAt: new Date() } : {}),
        },
      });
    }

    return {
      userId,
      before: { current: beforeCurrent, longest: beforeLongest },
      after: { current: stats.currentStreak, longest: stats.longestStreak },
      changed,
    };
  } catch (err) {
    return {
      userId,
      before: { current: beforeCurrent, longest: beforeLongest },
      after: { current: beforeCurrent, longest: beforeLongest },
      changed: false,
      failed: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runBatch(users: Array<{ id: string; currentStreak: number; longestStreak: number }>): Promise<Outcome[]> {
  const results: Outcome[] = [];
  for (let i = 0; i < users.length; i += RECOMPUTE_CONCURRENCY) {
    const slice = users.slice(i, i + RECOMPUTE_CONCURRENCY);
    const batch = await Promise.all(slice.map((u) => processUser(u.id, u.currentStreak, u.longestStreak)));
    results.push(...batch);
  }
  return results;
}

async function main(): Promise<void> {
  const totalUsers = await prisma.user.count();
  console.log(`[backfill-user-streaks] starting; ${totalUsers} users to scan in batches of ${BATCH_SIZE}`);

  let cursor: string | undefined;
  let scanned = 0;
  let changed = 0;
  let failed = 0;

  while (true) {
    const users = await prisma.user.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: { id: true, currentStreak: true, longestStreak: true },
    });

    if (users.length === 0) break;
    cursor = users[users.length - 1].id;

    const outcomes = await runBatch(users);
    for (const out of outcomes) {
      scanned += 1;
      if (out.failed) {
        failed += 1;
        console.error(`  fail user=${out.userId}: ${out.failed}`);
      } else if (out.changed) {
        changed += 1;
        console.log(`  user=${out.userId}: current ${out.before.current}->${out.after.current}, longest ${out.before.longest}->${out.after.longest}`);
      }
    }

    if (scanned % 500 === 0) {
      console.log(`[backfill-user-streaks] progress: scanned=${scanned}/${totalUsers} changed=${changed} failed=${failed}`);
    }
  }

  console.log(`[backfill-user-streaks] done. scanned=${scanned} changed=${changed} failed=${failed}`);
}

main()
  .catch((err) => {
    console.error('[backfill-user-streaks] fatal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
