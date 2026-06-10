/**
 * Manual retention pruning for unbounded-growth tables on the free-tier DB.
 * The API runs the same sweep automatically once per 24h (see
 * apps/api/src/utils/scheduler.ts pruneOldRecords); this script exists for
 * one-off manual runs and for inspecting what would be deleted.
 *
 * Deletes:
 *   - Execution rows older than 90 days (playground run history: code + output)
 *   - PlaygroundDailyUsage rows older than 60 days (per-day quota counters)
 *
 * AuditLog is deliberately NOT pruned — it is the compliance trail and needs an
 * explicit retention decision before any deletion.
 *
 * Usage:
 *   npx tsx scripts/prune-old-records.ts            # delete
 *   npx tsx scripts/prune-old-records.ts --dry-run  # count only, no writes
 */
import { prisma } from '../apps/api/src/lib/prisma.js';

const EXECUTION_RETENTION_DAYS = 90;
const PLAYGROUND_USAGE_RETENTION_DAYS = 60;

const DRY_RUN = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  const now = Date.now();
  const executionCutoff = new Date(now - EXECUTION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const usageCutoff = new Date(now - PLAYGROUND_USAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  console.log(`Execution cutoff:            ${executionCutoff.toISOString()} (${EXECUTION_RETENTION_DAYS}d)`);
  console.log(`PlaygroundDailyUsage cutoff: ${usageCutoff.toISOString()} (${PLAYGROUND_USAGE_RETENTION_DAYS}d)`);

  if (DRY_RUN) {
    const [executions, dailyUsage] = await Promise.all([
      prisma.execution.count({ where: { executedAt: { lt: executionCutoff } } }),
      prisma.playgroundDailyUsage.count({ where: { usageDate: { lt: usageCutoff } } }),
    ]);
    console.log(`[dry-run] would delete ${executions} execution(s), ${dailyUsage} daily-usage row(s)`);
    return;
  }

  // Batch the TEXT-heavy execution deletes (same as the in-API sweep) so a
  // months-deep backlog never becomes one giant DELETE statement.
  const BATCH = 5000;
  let executions = 0;
  for (;;) {
    const rows = await prisma.execution.findMany({
      where: { executedAt: { lt: executionCutoff } },
      select: { id: true },
      take: BATCH,
    });
    if (rows.length === 0) break;
    const { count } = await prisma.execution.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
    executions += count;
    if (rows.length < BATCH) break;
  }
  const dailyUsage = await prisma.playgroundDailyUsage.deleteMany({ where: { usageDate: { lt: usageCutoff } } });
  console.log(`Deleted ${executions} execution(s), ${dailyUsage.count} daily-usage row(s)`);
}

main()
  .catch((error) => {
    console.error('Pruning failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
