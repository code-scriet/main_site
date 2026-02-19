// Event Reminder Scheduler
// Sends reminder emails to registered users 24 hours before events

import { prisma } from '../lib/prisma.js';
import { emailService } from './email.js';
import { logger } from './logger.js';

let reminderColumnAvailable = true;

/**
 * Check for events happening in the next 24 hours and send reminders
 */
async function sendEventReminders(): Promise<void> {
  if (!reminderColumnAvailable) {
    return;
  }

  try {
    const now = new Date();
    
    // Find events starting in the next 10-32 hours (wider window to catch events in all timezones)
    // The sentReminders Set prevents duplicate sends
    const minTime = new Date(now.getTime() + 10 * 60 * 60 * 1000);
    const maxTime = new Date(now.getTime() + 32 * 60 * 60 * 1000);
    
    logger.info('🔔 Checking for events needing reminders...', {
      checkWindow: `${minTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} to ${maxTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`
    });
    
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
        // Exclude NETWORK role users from reminders
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
      logger.info('📭 No events needing reminders at this time');
      return;
    }
    
    logger.info(`📬 Found ${pendingRegistrations.length} registration(s) needing reminders`);
    
    for (const registration of pendingRegistrations) {
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
          logger.info(`✅ Reminder sent to ${registration.user.email} for "${registration.event.title}"`);
        } else {
          await prisma.eventRegistration.updateMany({
            where: {
              id: registration.id,
              reminderSentAt: reservationTimestamp,
            },
            data: {
              reminderSentAt: null,
            },
          });
        }
        
        // Small delay between emails to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        await prisma.eventRegistration.updateMany({
          where: {
            id: registration.id,
            reminderSentAt: reservationTimestamp,
          },
          data: {
            reminderSentAt: null,
          },
        });

        logger.error(`❌ Failed to send reminder to ${registration.user.email}`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
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

/**
 * Start the reminder scheduler
 * Checks every 6 hours for events needing reminders
 */
export function startReminderScheduler(): void {
  // Run immediately on startup
  setTimeout(() => {
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
  let sent = 0;
  
  try {
    const now = new Date();
    const minTime = new Date(now.getTime() + 20 * 60 * 60 * 1000);
    const maxTime = new Date(now.getTime() + 28 * 60 * 60 * 1000);
    
    const pendingRegistrations = await prisma.eventRegistration.findMany({
      where: {
        reminderSentAt: null,
        event: {
          startDate: { gte: minTime, lte: maxTime },
          status: 'UPCOMING',
        },
        // Exclude NETWORK role users from reminders
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
            email: true,
            name: true,
          },
        },
      },
    });
    
    for (const reg of pendingRegistrations) {
      if (!events.includes(reg.event.title)) {
        events.push(reg.event.title);
      }

      const reservationTimestamp = new Date();
      const reservation = await prisma.eventRegistration.updateMany({
        where: {
          id: reg.id,
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
          reg.user.email,
          reg.user.name,
          reg.event.title,
          reg.event.startDate,
          reg.event.slug
        );
        if (success) sent++;
        if (!success) {
          await prisma.eventRegistration.updateMany({
            where: {
              id: reg.id,
              reminderSentAt: reservationTimestamp,
            },
            data: {
              reminderSentAt: null,
            },
          });
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (sendError) {
        await prisma.eventRegistration.updateMany({
          where: {
            id: reg.id,
            reminderSentAt: reservationTimestamp,
          },
          data: {
            reminderSentAt: null,
          },
        });
        logger.error('Error sending manual reminder', {
          error: sendError instanceof Error ? sendError.message : String(sendError),
          eventId: reg.event.id,
          registrationId: reg.id,
        });
      }
    }
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
  
  return { sent, events };
}
