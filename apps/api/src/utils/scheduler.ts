// Event Reminder Scheduler
// Sends reminder emails to registered users 24 hours before events

import { prisma } from '../lib/prisma.js';
import { emailService } from './email.js';
import { logger } from './logger.js';
import { broadcastQotdLive } from './notifications.js';
import { invalidatePublishedQotdCache, recomputeStreaksForQOTDSafe } from './qotdStreak.js';
import { updateEventStatuses } from './eventStatus.js';

let reminderColumnAvailable = true;

type ReminderWindow = {
  minHours: number;
  maxHours: number;
};

type ProcessReminderOptions = {
  includeEvents: boolean;
  logWindow: boolean;
  emptyLogMessage?: string;
};

async function rollbackReminderReservation(registrationId: string, reservationTimestamp: Date): Promise<void> {
  // Only clear the marker if it still matches OUR reservation timestamp.
  // If another process overwrote it (race), their marker may represent a
  // successful send — clearing it would cause a duplicate email next run.
  const exactRollback = await prisma.eventRegistration.updateMany({
    where: {
      id: registrationId,
      reminderSentAt: reservationTimestamp,
      event: {
        status: 'UPCOMING',
        startDate: { gte: new Date() },
      },
    },
    data: {
      reminderSentAt: null,
    },
  });

  if (exactRollback.count === 0) {
    logger.warn('Reminder rollback skipped — reservation marker was overwritten (likely by a concurrent process)', {
      registrationId,
    });
  }
}

type ReminderGate = { remindersEnabled: boolean; testingMode: boolean };

// Single read of the two settings that govern a reminder run: the global
// on/off switch (admin "start/stop") and testing mode. Fails open on
// remindersEnabled (default true) so a transient DB error doesn't silently
// stop reminders, but fails closed on testing mode for the same reason the
// old code did — avoid marking real registrations as sent.
async function getReminderGate(): Promise<ReminderGate> {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { emailReminderEnabled: true, emailTestingMode: true },
    });
    return {
      remindersEnabled: settings?.emailReminderEnabled ?? true,
      testingMode: settings?.emailTestingMode ?? false,
    };
  } catch {
    return { remindersEnabled: true, testingMode: false };
  }
}

async function processReminders(window: ReminderWindow, options: ProcessReminderOptions): Promise<{ sent: number; events: string[] }> {
  const events: string[] = [];
  let sent = 0;

  const gate = await getReminderGate();

  // Global admin "stop" switch. When event reminders are disabled we skip the
  // whole run rather than reserving + rolling back each registration every tick.
  if (!gate.remindersEnabled) {
    logger.info('⏭️ Event reminders are disabled in settings — skipping reminder processing');
    return { sent: 0, events };
  }

  // Skip processing entirely when testing mode is active to avoid permanently
  // marking reminderSentAt on real registrations (the email would go to test
  // recipients, but the marker would prevent real delivery after testing ends).
  if (gate.testingMode) {
    logger.info('⏭️ Email testing mode active — skipping reminder processing to avoid marking real registrations as sent');
    return { sent: 0, events };
  }

  const now = new Date();
  const minTime = new Date(now.getTime() + window.minHours * 60 * 60 * 1000);
  const maxTime = new Date(now.getTime() + window.maxHours * 60 * 60 * 1000);

  if (options.logWindow) {
    logger.info('🔔 Checking for events needing reminders...', {
      checkWindow: `${minTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} to ${maxTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`
    });
  }

  const pendingRegistrations = await prisma.eventRegistration.findMany({
    where: {
      reminderSentAt: null,
      event: {
        startDate: {
          gte: minTime,
          lte: maxTime,
        },
        status: 'UPCOMING',
        remindersEnabled: true, // per-event admin opt-out
      },
      user: {
        role: { not: 'NETWORK' },
      },
    },
    select: {
      id: true,
      event: {
        select: {
          id: true,
          title: true,
          startDate: true,
          slug: true,
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  if (pendingRegistrations.length === 0) {
    if (options.emptyLogMessage) {
      logger.info(options.emptyLogMessage);
    }
    return { sent: 0, events };
  }

  logger.info(`📬 Found ${pendingRegistrations.length} registration(s) needing reminders`);

  for (const registration of pendingRegistrations) {
    if (options.includeEvents && !events.includes(registration.event.title)) {
      events.push(registration.event.title);
    }

    const reservationTimestamp = new Date();
    const reservation = await prisma.eventRegistration.updateMany({
      where: {
        id: registration.id,
        reminderSentAt: null,
      },
      data: {
        reminderSentAt: reservationTimestamp,
      },
    });

    if (reservation.count === 0) {
      continue;
    }

    try {
      const success = await emailService.sendEventReminder(
        registration.user.email,
        registration.user.name,
        registration.event.title,
        registration.event.startDate,
        registration.event.slug
      );

      if (success) {
        sent++;
        logger.info(`✅ Reminder sent to ${registration.user.email} for "${registration.event.title}"`);
      } else {
        await rollbackReminderReservation(registration.id, reservationTimestamp);
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      await rollbackReminderReservation(registration.id, reservationTimestamp);

      logger.error(`❌ Failed to send reminder to ${registration.user.email}`, {
        error: error instanceof Error ? error.message : String(error),
        eventId: registration.event.id,
        registrationId: registration.id,
      });
    }
  }

  return { sent, events };
}

/**
 * Check for events happening in the next 24 hours and send reminders
 */
async function sendEventReminders(): Promise<void> {
  if (!reminderColumnAvailable) {
    return;
  }

  try {
    await processReminders(
      { minHours: 10, maxHours: 32 },
      { includeEvents: false, logWindow: true, emptyLogMessage: '📭 No events needing reminders at this time' }
    );
    
    logger.info('✅ Event reminder check complete');
  } catch (error) {
    if (error instanceof Error && error.message.includes('reminder_sent_at')) {
      reminderColumnAvailable = false;
      logger.warn('Reminder scheduler disabled: reminder_sent_at column is missing. Run latest migrations to re-enable reminders.');
      return;
    }

    logger.error('❌ Error in sendEventReminders:', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

let reminderInterval: NodeJS.Timeout | null = null;
let reminderStartupTimeout: NodeJS.Timeout | null = null;

const MAX_TIMER_DELAY_MS = 2_147_483_647; // Node setTimeout ceiling (~24.8 days)

// ── QOTD auto-publish: event-driven precise in-memory timers (no polling) ──
// To keep the (Neon free-tier) DB asleep we never poll on a tight loop. Instead:
//   • the create endpoint arms a precise setTimeout the instant a QOTD is
//     scheduled, so it fires exactly at its publishAt — sub-hour or days out;
//   • on boot we hydrate once from the DB to re-arm timers (and publish anything
//     already past-due, e.g. scheduled while the process was down);
//   • hold/publish/delete cancel the armed timer.
// Net DB contact: one hydration query at startup + one targeted write at each
// publish moment. Between publishes the DB sleeps. Timers are bounded (only
// pending scheduled QOTDs, a handful) so this is free-tier safe. The instance is
// kept warm by UptimeRobot, so timers persist; a restart re-hydrates from the DB.
const qotdPublishTimers = new Map<string, NodeJS.Timeout>();
let qotdSchedulerActive = false;
let qotdHydrateStartupTimeout: NodeJS.Timeout | null = null;

// Flip a single scheduled QOTD to published and fire the bell notification.
// Idempotent + race-safe: re-reads state and only flips if still unpublished/unheld.
async function publishDueQotd(id: string): Promise<void> {
  qotdPublishTimers.delete(id);
  try {
    const qotd = await prisma.qOTD.findUnique({
      where: { id },
      select: {
        id: true,
        question: true,
        createdById: true,
        isPublished: true,
        heldBy: true,
        problem: { select: { title: true } },
      },
    });
    if (!qotd || qotd.isPublished || qotd.heldBy) return;

    const flipped = await prisma.qOTD.updateMany({
      where: { id, isPublished: false, heldBy: null },
      data: { isPublished: true, publishedAt: new Date() },
    });
    if (flipped.count === 0) return;

    invalidatePublishedQotdCache(); // published-day set changed → streak inputs shift
    recomputeStreaksForQOTDSafe(id); // credit anyone who solved while it was scheduled
    broadcastQotdLive(qotd, qotd.createdById).catch(() => undefined);
    logger.info(`📅 Auto-published scheduled QOTD "${qotd.question}"`, { qotdId: id });
  } catch (error) {
    logger.error('❌ QOTD auto-publish failed', {
      qotdId: id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// Arm (or re-arm) the timer for one QOTD, chaining past Node's ~24.8-day ceiling
// for far-future schedules. Internal — callers go through armQotdPublishTimer.
function scheduleQotdTimer(id: string, publishAt: Date): void {
  const remaining = publishAt.getTime() - Date.now();
  if (remaining <= 0) { void publishDueQotd(id); return; }
  const delay = Math.min(remaining, MAX_TIMER_DELAY_MS);
  const handle = setTimeout(() => {
    qotdPublishTimers.delete(id);
    // Capped early fire for a very long schedule → re-arm for the remainder.
    if (publishAt.getTime() - Date.now() > 1000) scheduleQotdTimer(id, publishAt);
    else void publishDueQotd(id);
  }, delay);
  if (typeof handle.unref === 'function') handle.unref();
  qotdPublishTimers.set(id, handle);
}

/**
 * Arm a precise publish timer for one scheduled QOTD. Called from the create
 * endpoint and from startup hydration. No-op when the scheduler isn't active
 * (dev default) or when the QOTD is already published/held/non-scheduled.
 * Past-due rows publish immediately.
 */
export function armQotdPublishTimer(
  qotd: { id: string; publishAt: Date | null; isPublished: boolean; heldBy: string | null },
): void {
  if (!qotdSchedulerActive) return;
  if (qotd.isPublished || qotd.heldBy || !qotd.publishAt) return;
  if (qotdPublishTimers.has(qotd.id)) return; // already armed
  scheduleQotdTimer(qotd.id, qotd.publishAt);
}

/** Drop an armed timer (on manual publish / hold / delete). */
export function cancelQotdPublishTimer(qotdId: string): void {
  const handle = qotdPublishTimers.get(qotdId);
  if (handle) {
    clearTimeout(handle);
    qotdPublishTimers.delete(qotdId);
  }
}

// Startup-only: re-arm timers for every pending scheduled QOTD and publish any
// already past-due. Runs once shortly after boot; not on an interval.
async function hydrateScheduledQotds(): Promise<void> {
  try {
    const pending = await prisma.qOTD.findMany({
      where: { isPublished: false, heldBy: null, publishAt: { not: null } },
      select: { id: true, publishAt: true, isPublished: true, heldBy: true },
      orderBy: { publishAt: 'asc' },
      take: 366, // at most ~a year of pre-scheduled QOTDs
    });
    for (const qotd of pending) armQotdPublishTimer(qotd);
    if (pending.length > 0) logger.info(`📅 Re-armed ${pending.length} scheduled QOTD timer(s) on boot`);
  } catch (error) {
    logger.error('❌ QOTD hydration failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Start the QOTD auto-publish scheduler. Event-driven: hydrates timers once
 * after boot, then relies on per-QOTD timers (armed at create time). No polling.
 */
export function startQotdAutoPublishScheduler(): void {
  if (qotdSchedulerActive) return;
  qotdSchedulerActive = true;
  qotdHydrateStartupTimeout = setTimeout(() => {
    qotdHydrateStartupTimeout = null;
    void hydrateScheduledQotds();
  }, 15_000); // hydrate once the DB is warm
  logger.info('📅 QOTD auto-publish scheduler started (event-driven timers, no polling)');
}

export function stopQotdAutoPublishScheduler(): void {
  qotdSchedulerActive = false;
  if (qotdHydrateStartupTimeout) {
    clearTimeout(qotdHydrateStartupTimeout);
    qotdHydrateStartupTimeout = null;
  }
  for (const handle of qotdPublishTimers.values()) clearTimeout(handle);
  qotdPublishTimers.clear();
  logger.info('📅 QOTD auto-publish scheduler stopped');
}

// ── Event-status transitions: sleep until the next boundary (no polling) ──
// Same idea as QOTD: instead of a 30-min poll we arm a single timer pointing at
// the nearest future transition moment (the soonest UPCOMING.startDate or
// UPCOMING/ONGOING.endDate). On fire we run updateEventStatuses() and re-plan.
// Re-tuned on every event create/update/delete (reconcileEventStatusesSoon) and
// re-hydrated on boot. With no upcoming events the timer isn't set and the DB
// sleeps indefinitely.
let eventStatusTimer: NodeJS.Timeout | null = null;
let eventStatusStartupTimeout: NodeJS.Timeout | null = null;
let eventStatusActive = false;
let eventStatusReconciling = false;
let eventStatusDirty = false;

async function planNextEventStatusWake(): Promise<void> {
  if (eventStatusTimer) { clearTimeout(eventStatusTimer); eventStatusTimer = null; }
  if (!eventStatusActive) return;
  const now = new Date();
  const [nextStart, nextEnd] = await Promise.all([
    prisma.event.findFirst({
      where: { status: 'UPCOMING', startDate: { gt: now } },
      orderBy: { startDate: 'asc' },
      select: { startDate: true },
    }),
    prisma.event.findFirst({
      where: { status: { in: ['UPCOMING', 'ONGOING'] }, endDate: { gt: now } },
      orderBy: { endDate: 'asc' },
      select: { endDate: true },
    }),
  ]);
  const moments: number[] = [];
  if (nextStart?.startDate) moments.push(nextStart.startDate.getTime());
  if (nextEnd?.endDate) moments.push(nextEnd.endDate.getTime());
  if (moments.length === 0) return; // nothing scheduled → DB sleeps
  const next = Math.min(...moments);
  const delay = Math.min(MAX_TIMER_DELAY_MS, Math.max(1000, next - Date.now()));
  eventStatusTimer = setTimeout(() => { void reconcileEventStatuses(); }, delay);
  if (typeof eventStatusTimer.unref === 'function') eventStatusTimer.unref();
}

// Apply all due transitions, then sleep until the next one. Coalesces concurrent
// re-tune requests via the dirty flag so a burst of event edits runs once.
async function reconcileEventStatuses(): Promise<void> {
  if (!eventStatusActive) return;
  if (eventStatusReconciling) { eventStatusDirty = true; return; }
  eventStatusReconciling = true;
  try {
    do {
      eventStatusDirty = false;
      await updateEventStatuses();
      await planNextEventStatusWake();
    } while (eventStatusDirty && eventStatusActive);
  } catch (error) {
    logger.error('Event status reconcile failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    eventStatusReconciling = false;
  }
}

export function startEventStatusScheduler(): void {
  if (eventStatusActive) return;
  eventStatusActive = true;
  eventStatusStartupTimeout = setTimeout(() => {
    eventStatusStartupTimeout = null;
    void reconcileEventStatuses();
  }, 5_000);
  logger.info('🗓️ Event-status scheduler started (sleeps until the next transition)');
}

export function stopEventStatusScheduler(): void {
  eventStatusActive = false;
  if (eventStatusStartupTimeout) { clearTimeout(eventStatusStartupTimeout); eventStatusStartupTimeout = null; }
  if (eventStatusTimer) { clearTimeout(eventStatusTimer); eventStatusTimer = null; }
  logger.info('🗓️ Event-status scheduler stopped');
}

/** Re-tune after an event create/update/delete so a new/changed boundary is honored. */
export async function reconcileEventStatusesSoon(): Promise<void> {
  if (!eventStatusActive) return;
  await reconcileEventStatuses();
}

/**
 * Start the reminder scheduler
 * Checks every 6 hours for events needing reminders
 */
export function startReminderScheduler(): void {
  if (reminderInterval || reminderStartupTimeout) {
    return;
  }

  // Run immediately on startup
  reminderStartupTimeout = setTimeout(() => {
    reminderStartupTimeout = null;
    sendEventReminders();
  }, 10000); // Wait 10 seconds after startup
  
  // Then run every 6 hours (4 times a day is efficient)
  reminderInterval = setInterval(() => {
    sendEventReminders();
  }, 6 * 60 * 60 * 1000); // Every 6 hours
  
  logger.info('🔔 Event reminder scheduler started (checks every 6 hours)');
}

/**
 * Stop the reminder scheduler
 */
export function stopReminderScheduler(): void {
  if (reminderStartupTimeout) {
    clearTimeout(reminderStartupTimeout);
    reminderStartupTimeout = null;
  }
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
  logger.info('🔕 Event reminder scheduler stopped');
}

/**
 * Manually trigger reminder check (for testing/admin)
 */
export async function triggerReminderCheck(): Promise<{ sent: number; events: string[] }> {
  if (!reminderColumnAvailable) {
    return { sent: 0, events: [] };
  }

  const events: string[] = [];
  
  try {
    const result = await processReminders(
      { minHours: 20, maxHours: 28 },
      { includeEvents: true, logWindow: false }
    );
    return result;
  } catch (error) {
    if (error instanceof Error && error.message.includes('reminder_sent_at')) {
      reminderColumnAvailable = false;
      logger.warn('Manual reminder check skipped: reminder_sent_at column is missing. Run latest migrations.');
      return { sent: 0, events: [] };
    }

    logger.error('Error in manual reminder trigger:', { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
  
  return { sent: 0, events };
}
