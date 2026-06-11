import { prisma, withRetry } from '../lib/prisma.js';

const SETTINGS_CACHE_TTL_MS = 15 * 1000;
const DEFAULT_PLAYGROUND_DAILY_LIMIT = 100;

let cachedSettings: { expiresAt: number; dailyLimit: number } = {
  expiresAt: 0,
  dailyLimit: DEFAULT_PLAYGROUND_DAILY_LIMIT,
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function getIstDateKey(date = new Date()): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function getUsageDate(date = new Date()): Date {
  return new Date(`${getIstDateKey(date)}T00:00:00.000Z`);
}

export function formatUsageDate(date = new Date()): string {
  return getIstDateKey(date);
}

export async function getPlaygroundDailyLimit(): Promise<number> {
  const now = Date.now();
  if (now < cachedSettings.expiresAt) {
    return cachedSettings.dailyLimit;
  }

  const settings = await withRetry(() => prisma.settings.findUnique({
    where: { id: 'default' },
    select: { playgroundDailyLimit: true },
  }));

  cachedSettings = {
    expiresAt: now + SETTINGS_CACHE_TTL_MS,
    dailyLimit: Number.isInteger(settings?.playgroundDailyLimit)
      ? Math.max(1, Number(settings!.playgroundDailyLimit))
      : DEFAULT_PLAYGROUND_DAILY_LIMIT,
  };

  return cachedSettings.dailyLimit;
}

export async function consumeDailyQuota(
  userId: string,
  amount = 1,
): Promise<{ allowed: boolean; remaining: number; limit: number; used: number }> {
  const usageDate = getUsageDate();
  const limit = await getPlaygroundDailyLimit();

  if (amount < 1 || amount > limit) {
    const current = await prisma.playgroundDailyUsage.findUnique({
      where: { userId_usageDate: { userId, usageDate } },
      select: { count: true },
    });
    const used = current?.count ?? 0;
    return { allowed: false, remaining: Math.max(0, limit - used), limit, used };
  }

  // Single atomic INSERT … ON CONFLICT replaces the old upsert + guarded
  // updateMany + findUnique re-read (3 round-trips → 1 on the success path).
  // Fresh row inserts directly at `amount` (amount ≤ limit is guaranteed by the
  // guard above, matching the old create(0)+increment). On conflict the guarded
  // UPDATE only fires while count ≤ limit − amount; no row returned ⇒ over cap.
  // updated_at is set explicitly to preserve @updatedAt semantics in raw SQL.
  const dateKey = getIstDateKey();
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO playground_daily_usage (user_id, usage_date, count)
    VALUES (${userId}, ${dateKey}::date, ${amount})
    ON CONFLICT (user_id, usage_date)
    DO UPDATE SET count = playground_daily_usage.count + ${amount}, updated_at = now()
    WHERE playground_daily_usage.count <= ${limit - amount}
    RETURNING count;
  `;

  if (rows.length > 0) {
    const used = Number(rows[0].count);
    return { allowed: true, remaining: Math.max(0, limit - used), limit, used };
  }

  // Over cap — one fallback read so `used` in the response stays accurate.
  const current = await prisma.playgroundDailyUsage.findUnique({
    where: { userId_usageDate: { userId, usageDate } },
    select: { count: true },
  });
  const used = current?.count ?? 0;

  return {
    allowed: false,
    remaining: Math.max(0, limit - used),
    limit,
    used,
  };
}

export async function resetDailyQuotaAndPracticeCounters(userId: string): Promise<void> {
  const usageDate = getUsageDate();
  const todayKey = formatUsageDate();
  const now = new Date();

  await prisma.$transaction([
    prisma.playgroundDailyUsage.upsert({
      where: { userId_usageDate: { userId, usageDate } },
      create: { userId, usageDate, count: 0 },
      update: { count: 0 },
    }),
    prisma.problemSubmissionCounter.updateMany({
      where: {
        userId,
        contextType: 'PRACTICE',
        contextKey: todayKey,
      },
      data: {
        count: 0,
        lastResetAt: now,
      },
    }),
  ]);
}

/**
 * Sample test problems for playground testing
 */
export const SAMPLE_TEST_PROBLEMS = [
  {
    id: 'sum-two-numbers',
    title: 'Sum Two Numbers',
    description: 'Write a program to sum two numbers',
    testCases: [
      { input: '5\n3', expectedOutput: '8' },
      { input: '10\n20', expectedOutput: '30' },
      { input: '0\n0', expectedOutput: '0' },
    ],
  },
  {
    id: 'fibonacci-series',
    title: 'Fibonacci Series',
    description: 'Generate Fibonacci series up to n terms',
    testCases: [
      { input: '5', expectedOutput: '0 1 1 2 3' },
      { input: '3', expectedOutput: '0 1 1' },
      { input: '1', expectedOutput: '0' },
    ],
  },
  {
    id: 'reverse-string',
    title: 'Reverse a String',
    description: 'Reverse the given string',
    testCases: [
      { input: 'hello', expectedOutput: 'olleh' },
      { input: 'world', expectedOutput: 'dlrow' },
      { input: 'a', expectedOutput: 'a' },
    ],
  },
  {
    id: 'factorial',
    title: 'Factorial',
    description: 'Calculate factorial of a number',
    testCases: [
      { input: '5', expectedOutput: '120' },
      { input: '0', expectedOutput: '1' },
      { input: '3', expectedOutput: '6' },
    ],
  },
  {
    id: 'palindrome-check',
    title: 'Check Palindrome',
    description: 'Check if a string is a palindrome',
    testCases: [
      { input: 'racecar', expectedOutput: 'true' },
      { input: 'hello', expectedOutput: 'false' },
      { input: 'a', expectedOutput: 'true' },
    ],
  },
];
