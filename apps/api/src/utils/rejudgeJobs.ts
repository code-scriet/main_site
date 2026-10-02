import { ProblemContextType, type ProblemSubmission } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { auditLog } from './audit.js';
import { logger } from './logger.js';
import { rejudgeSubmission } from './problemsCore.js';

export interface RejudgeJobState {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  problemId: string;
  contextType?: ProblemContextType;
  contextKey?: string;
  processed: number;
  total: number;
  errors: string[];
  createdAt: string;
  updatedAt: string;
}

const jobs = new Map<string, RejudgeJobState>();
let jobChain: Promise<void> = Promise.resolve();
const MAX_JOBS = 20;

function touch(job: RejudgeJobState): void {
  job.updatedAt = new Date().toISOString();
}

function pruneJobs(): void {
  const entries = Array.from(jobs.entries());
  if (entries.length <= MAX_JOBS) return;
  entries
    .sort((a, b) => a[1].createdAt.localeCompare(b[1].createdAt))
    .slice(0, entries.length - MAX_JOBS)
    .forEach(([id]) => jobs.delete(id));
}

export function getRejudgeJob(jobId: string): RejudgeJobState | null {
  return jobs.get(jobId) ?? null;
}

export function enqueueRejudgeJob(params: {
  problemId: string;
  contextType?: ProblemContextType;
  contextKey?: string;
  requestedBy: string;
}): RejudgeJobState {
  const now = new Date().toISOString();
  const job: RejudgeJobState = {
    id: crypto.randomUUID(),
    status: 'queued',
    problemId: params.problemId,
    contextType: params.contextType,
    contextKey: params.contextKey,
    processed: 0,
    total: 0,
    errors: [],
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  pruneJobs();

  jobChain = jobChain
    .catch(() => undefined)
    .then(() => runJob(job, params.requestedBy));

  return job;
}

async function runJob(job: RejudgeJobState, requestedBy: string): Promise<void> {
  job.status = 'running';
  touch(job);

  try {
    const problem = await prisma.problem.findUnique({ where: { id: job.problemId } });
    if (!problem) throw new Error('Problem not found');

    const where = {
      problemId: job.problemId,
      ...(job.contextType ? { contextType: job.contextType } : {}),
      ...(job.contextKey ? { contextKey: job.contextKey } : {}),
    };

    job.total = await prisma.problemSubmission.count({ where });
    touch(job);

    // Page submissions in batches of 200 instead of hydrating up to 10k full
    // rows (~20 MB with code + perTestVerdicts) before the serial loop even
    // starts. Same 10k overall cap; id is the cursor tiebreaker for rows
    // sharing a submittedAt (rejudge order between equals isn't semantic).
    const BATCH_SIZE = 200;
    const MAX_REJUDGE_SUBMISSIONS = 10_000;
    let cursorId: string | null = null;
    let fetched = 0;

    while (fetched < MAX_REJUDGE_SUBMISSIONS) {
      const take = Math.min(BATCH_SIZE, MAX_REJUDGE_SUBMISSIONS - fetched);
      // Explicit annotation breaks the batch → cursorId → batch inference cycle (TS7022).
      const batch: ProblemSubmission[] = await prisma.problemSubmission.findMany({
        where,
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        take,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      });
      if (batch.length === 0) break;
      fetched += batch.length;
      cursorId = batch[batch.length - 1].id;

      for (const submission of batch) {
        try {
          if (!submission.manualOverride) {
            await rejudgeSubmission(submission, problem);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          job.errors.push(message);
          logger.warn('Problem rejudge submission failed', { jobId: job.id, submissionId: submission.id, error: message });
        } finally {
          job.processed += 1;
          touch(job);
        }
      }

      if (batch.length < take) break;
    }

    job.status = job.errors.length > 0 ? 'failed' : 'completed';
    touch(job);
    await auditLog(requestedBy, 'PROBLEM_REJUDGE_COMPLETED', 'Problem', job.problemId, {
      jobId: job.id,
      processed: job.processed,
      total: job.total,
      errors: job.errors.length,
      contextType: job.contextType,
      contextKey: job.contextKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    job.status = 'failed';
    job.errors.push(message);
    touch(job);
    logger.error('Problem rejudge job failed', { jobId: job.id, problemId: job.problemId, error: message });
  }
}
