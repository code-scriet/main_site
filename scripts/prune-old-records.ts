/**
 * Manual retention pruning for unbounded-growth tables on the free-tier DB.
 * The API runs the same sweep automatically once per 24h (see
 * apps/api/src/utils/scheduler.ts pruneOldRecords); this script exists for
 * one-off manual runs and for inspecting what would be deleted (--dry-run).
 *
 * Deletes (A7):
 *   - Execution            > 90d  (playground run history: code + output TEXT)
 *   - PlaygroundDailyUsage > 60d  (per-day quota counters)
 *   - NotificationFeed     expired OR > 90d  (bell broadcasts)
 *   - CompetitionAutoSave  round FINISHED > 30d  (superseded code blobs;
 *                          final answers live in CompetitionSubmission)
 *   - QuizAnswer           > 365d  — ONLY when PRUNE_QUIZ_ANSWERS=true
 *                          (QuizParticipant leaderboard aggregates are kept)
 *
 * AuditLog is deliberately NOT pruned — it is the compliance trail and keeps
 * its explicit retention via DELETE /api/audit-logs/retention.
 *
 * Usage:
 *   npx tsx scripts/prune-old-records.ts            # delete
 *   npx tsx scripts/prune-old-records.ts --dry-run  # count only, no writes
 *   PRUNE_QUIZ_ANSWERS=true npx tsx scripts/prune-old-records.ts [--dry-run]
 */
import { prisma } from '../apps/api/src/lib/prisma.js';
import {
  computePruneCutoffs,
  isQuizAnswerPruningEnabled,
  pruneOldRecords,
  EXECUTION_RETENTION_DAYS,
  PLAYGROUND_USAGE_RETENTION_DAYS,
  NOTIFICATION_FEED_RETENTION_DAYS,
  COMPETITION_AUTOSAVE_RETENTION_DAYS,
  QUIZ_ANSWER_RETENTION_DAYS,
} from '../apps/api/src/utils/scheduler.js';

const DRY_RUN = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  const cutoffs = computePruneCutoffs();
  const quizEnabled = isQuizAnswerPruningEnabled();

  console.log(`Execution            cutoff: ${cutoffs.execution.toISOString()} (${EXECUTION_RETENTION_DAYS}d)`);
  console.log(`PlaygroundDailyUsage cutoff: ${cutoffs.playgroundUsage.toISOString()} (${PLAYGROUND_USAGE_RETENTION_DAYS}d)`);
  console.log(`NotificationFeed     cutoff: ${cutoffs.notificationFeed.toISOString()} (${NOTIFICATION_FEED_RETENTION_DAYS}d, or expired)`);
  console.log(`CompetitionAutoSave  cutoff: ${cutoffs.competitionAutoSave.toISOString()} (round FINISHED >${COMPETITION_AUTOSAVE_RETENTION_DAYS}d)`);
  console.log(`QuizAnswer           cutoff: ${cutoffs.quizAnswer.toISOString()} (${QUIZ_ANSWER_RETENTION_DAYS}d) — ${quizEnabled ? 'ENABLED' : 'disabled (set PRUNE_QUIZ_ANSWERS=true)'}`);
  console.log('AuditLog: NOT pruned (manual /api/audit-logs/retention only).');

  if (DRY_RUN) {
    const [executions, dailyUsage, notificationFeed, competitionAutoSaves, quizAnswers] = await Promise.all([
      prisma.execution.count({ where: { executedAt: { lt: cutoffs.execution } } }),
      prisma.playgroundDailyUsage.count({ where: { usageDate: { lt: cutoffs.playgroundUsage } } }),
      prisma.notificationFeed.count({
        where: {
          OR: [
            { expiresAt: { not: null, lt: new Date() } },
            { createdAt: { lt: cutoffs.notificationFeed } },
          ],
        },
      }),
      prisma.competitionAutoSave.count({
        where: { round: { status: 'FINISHED', updatedAt: { lt: cutoffs.competitionAutoSave } } },
      }),
      quizEnabled
        ? prisma.quizAnswer.count({ where: { submittedAt: { lt: cutoffs.quizAnswer } } })
        : Promise.resolve(0),
    ]);
    console.log(
      `[dry-run] would delete: ${executions} execution(s), ${dailyUsage} daily-usage, ` +
      `${notificationFeed} notification(s), ${competitionAutoSaves} autosave(s), ${quizAnswers} quiz-answer(s)`,
    );
    return;
  }

  const result = await pruneOldRecords();
  console.log(
    `Deleted: ${result.executions} execution(s), ${result.dailyUsage} daily-usage, ` +
    `${result.notificationFeed} notification(s), ${result.competitionAutoSaves} autosave(s), ${result.quizAnswers} quiz-answer(s)`,
  );
}

main()
  .catch((error) => {
    console.error('Pruning failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
