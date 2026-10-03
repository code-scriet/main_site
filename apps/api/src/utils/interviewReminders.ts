// Interview-slot pick reminders (Phase 2).
//
// Daily (via the existing 6h reminder tick in scheduler.ts — a superset of daily;
// the per-threshold log rows make the higher frequency safe) this finds
// INTERVIEW_SCHEDULED applications with no booking whose pick-token expires
// within the 48h / 24h windows and nudges them once per threshold.
//
// Reservation pattern mirrors the event-reminder scheduler: the
// InterviewReminderLog row for (applicationId, threshold) is claimed BEFORE
// sending (the unique constraint is the exactly-once guard). Unlike event
// reminders, a failed send KEEPS the row — the candidate's next threshold (or
// an admin resend) is the recovery path, so a poisoned address can't wedge the
// tick forever. Expired tokens with no booking are left alone: the status stays
// INTERVIEW_SCHEDULED (no auto-reject).
//
// The pick link needs a raw token, but only the SHA-256 hash is stored — so a
// reminder mints a FRESH token (fresh 7-day window) right before claiming. If
// minting fails nothing is claimed and the next tick retries.

import { prisma } from '../lib/prisma.js';
import { logger } from './logger.js';
import { getNotificationSettings, shouldNotify, type NotificationSettings } from './emailPolicy.js';
import {
  buildSlotMagicLink,
  formatDeadlineIST,
  sendSlotReminderEmail,
  type SlotReminderEmailParams,
} from './interviewEmail.js';
import { issueSlotToken } from './interviewSlotToken.js';

export const REMINDER_THRESHOLD_48H = '48h' as const;
export const REMINDER_THRESHOLD_24H = '24h' as const;
export type ReminderThreshold = typeof REMINDER_THRESHOLD_48H | typeof REMINDER_THRESHOLD_24H;

// Cohort mail targets exactly the live interview pipeline — rejection hides
// instantly, and PENDING / SELECTED / REJECTED never hear cohort mail.
export const COHORT_PIPELINE_STATUSES = ['INTERVIEW_SCHEDULED', 'SLOT_BOOKED', 'INTERVIEWED'] as const;

const MS_PER_HOUR = 60 * 60 * 1000;
export const REMINDER_WINDOW_MS = 48 * MS_PER_HOUR;

// Pure: which threshold (if any) a token expiry falls into. Expired or
// beyond-48h expiries return null — the application stays scheduled, no mail.
export function selectReminderThreshold(expiresAt: Date, now: Date = new Date()): ReminderThreshold | null {
  const msLeft = expiresAt.getTime() - now.getTime();
  if (msLeft <= 0) return null;
  const hoursLeft = msLeft / MS_PER_HOUR;
  if (hoursLeft <= 24) return REMINDER_THRESHOLD_24H;
  if (hoursLeft <= 48) return REMINDER_THRESHOLD_48H;
  return null;
}

// Pure: distinct in-pipeline applicant emails. Case-insensitive dedup —
// HiringApplication is unique per (email, cycle) but mixed-case rows exist.
export function selectCohortEmails(rows: Array<{ email: string; status: string }>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    if (!(COHORT_PIPELINE_STATUSES as readonly string[]).includes(row.status)) continue;
    const email = row.email.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

// Minimal shape of the Prisma delegate surface this module needs — the real
// prisma client satisfies it, and offline tests inject fakes.
export interface ReminderLogDb {
  interviewReminderLog: {
    create(args: { data: { applicationId: string; threshold: string } }): Promise<unknown>;
  };
}

// Claim the (applicationId, threshold) row. True = we won the race and may
// send; false = already claimed (unique hit), skip quietly.
export async function claimReminderSlot(
  db: ReminderLogDb,
  applicationId: string,
  threshold: ReminderThreshold,
): Promise<boolean> {
  try {
    await db.interviewReminderLog.create({ data: { applicationId, threshold } });
    return true;
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code === 'P2002') return false;
    throw err;
  }
}

export interface ReminderCandidate {
  applicationId: string;
  email: string;
  name: string;
  expiresAt: Date;
  existingThresholds: string[];
}

export interface ReminderProcessorDeps {
  db: ReminderLogDb;
  now?: Date;
  issueToken?: (applicationId: string) => Promise<string>;
  sendReminder?: (params: SlotReminderEmailParams) => Promise<boolean>;
}

export interface ReminderProcessResult {
  checked: number;
  sent: number;
  skippedClaimed: number;
  failed: number;
}

export async function processInterviewReminders(
  candidates: ReminderCandidate[],
  deps: ReminderProcessorDeps,
): Promise<ReminderProcessResult> {
  const now = deps.now ?? new Date();
  const issueToken = deps.issueToken ?? issueSlotToken;
  const sendReminder = deps.sendReminder ?? sendSlotReminderEmail;
  const result: ReminderProcessResult = { checked: 0, sent: 0, skippedClaimed: 0, failed: 0 };

  for (const candidate of candidates) {
    result.checked += 1;
    const threshold = selectReminderThreshold(candidate.expiresAt, now);
    if (!threshold) continue; // outside the windows, or expired — stays scheduled
    if (candidate.existingThresholds.includes(threshold)) {
      result.skippedClaimed += 1;
      continue;
    }

    // Mint a fresh pick link first: the stored hash can't rebuild one, and a
    // mint failure must not burn the exactly-once claim.
    let magicLink: string;
    try {
      magicLink = buildSlotMagicLink(await issueToken(candidate.applicationId));
    } catch (err) {
      logger.error('Interview reminder token mint failed; will retry next tick', {
        applicationId: candidate.applicationId,
        error: err instanceof Error ? err.message : String(err),
      });
      result.failed += 1;
      continue;
    }

    let claimed: boolean;
    try {
      claimed = await claimReminderSlot(deps.db, candidate.applicationId, threshold);
    } catch (err) {
      logger.error('Interview reminder claim failed; will retry next tick', {
        applicationId: candidate.applicationId,
        threshold,
        error: err instanceof Error ? err.message : String(err),
      });
      result.failed += 1;
      continue;
    }
    if (!claimed) {
      result.skippedClaimed += 1;
      continue;
    }

    try {
      const ok = await sendReminder({
        to: candidate.email,
        name: candidate.name,
        hoursLeft: threshold === REMINDER_THRESHOLD_48H ? 48 : 24,
        magicLink,
        deadlineIST: formatDeadlineIST(candidate.expiresAt),
      });
      if (ok) {
        result.sent += 1;
      } else {
        // Keep the reservation (exactly-once per threshold); the failure is
        // loud so ops can resend manually.
        logger.error('Interview reminder send failed; reservation kept (no retry for this threshold)', {
          applicationId: candidate.applicationId,
          threshold,
          email: candidate.email,
        });
        result.failed += 1;
      }
    } catch (err) {
      logger.error('Interview reminder send threw; reservation kept (no retry for this threshold)', {
        applicationId: candidate.applicationId,
        threshold,
        email: candidate.email,
        error: err instanceof Error ? err.message : String(err),
      });
      result.failed += 1;
    }
  }

  return result;
}

// Real DB-backed wrapper, called from the reminder tick in scheduler.ts.
export async function sendInterviewSlotReminders(now: Date = new Date()): Promise<ReminderProcessResult> {
  const zero: ReminderProcessResult = { checked: 0, sent: 0, skippedClaimed: 0, failed: 0 };

  // Gate on the recruitment toggle + testing mode BEFORE claiming anything, so
  // a disabled category or a test redirect can't burn the exactly-once rows
  // (same reason the event-reminder tick skips while testing mode is on).
  let ns: NotificationSettings;
  try {
    ns = await getNotificationSettings();
  } catch {
    // Fail open on the toggle (a transient read miss shouldn't stop reminders),
    // fail closed on testing mode (never burn markers we can't honor).
    return zero;
  }
  if (!shouldNotify('recruitment', ns)) {
    logger.info('Interview slot reminders disabled in settings — skipping reminder processing');
    return zero;
  }
  if (ns.emailTestingMode) {
    logger.info('Email testing mode active — skipping interview slot reminders to avoid burning reminder claims');
    return zero;
  }

  let candidates: ReminderCandidate[];
  try {
    const apps = await prisma.hiringApplication.findMany({
      where: {
        status: 'INTERVIEW_SCHEDULED',
        bookings: { none: {} },
        slotToken: { expiresAt: { gt: now, lte: new Date(now.getTime() + REMINDER_WINDOW_MS) } },
      },
      select: {
        id: true,
        name: true,
        email: true,
        slotToken: { select: { expiresAt: true } },
        reminderLogs: { select: { threshold: true } },
      },
      take: 500,
    });
    candidates = apps
      .filter((a) => a.slotToken?.expiresAt)
      .map((a) => ({
        applicationId: a.id,
        email: a.email,
        name: a.name,
        expiresAt: (a.slotToken as { expiresAt: Date }).expiresAt,
        existingThresholds: a.reminderLogs.map((r) => r.threshold),
      }));
  } catch (err) {
    logger.error('Interview slot reminder query failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return zero;
  }

  if (candidates.length === 0) return zero;
  const result = await processInterviewReminders(candidates, { db: prisma, now });
  logger.info('Interview slot reminder sweep complete', { ...result });
  return result;
}
