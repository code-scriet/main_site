// Event Reminder Scheduler
// Sends reminder emails to registered users 24 hours before events

import { prisma } from '../lib/prisma.js';
import { emailService } from './email.js';
import { logger } from './logger.js';

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

async function isEmailTestingModeActive(): Promise<boolean> {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { emailTestingMode: true },
    });
    return settings?.emailTestingMode ?? false;
  } catch {
    return false;
  }
}

async function processReminders(window: ReminderWindow, options: ProcessReminderOptions): Promise<{ sent: number; events: string[] }> {
  const events: string[] = [];
  let sent = 0;

  // Skip processing entirely when testing mode is active to avoid permanently
  // marking reminderSentAt on real registrations (the email would go to test
  // recipients, but the marker would prevent real delivery after testing ends).
  if (await isEmailTestingModeActive()) {
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
