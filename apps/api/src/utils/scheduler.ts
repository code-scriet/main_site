// Event Reminder Scheduler
// Sends reminder emails to registered users 24 hours before events

import { prisma } from '../lib/prisma.js';
import { emailService } from './email.js';
import { logger } from './logger.js';

// Track sent reminders to avoid duplicates (in production, use database)
const sentReminders = new Set<string>();

/**
 * Check for events happening in the next 24 hours and send reminders
 */
async function sendEventReminders(): Promise<void> {
  try {
    const now = new Date();
    
    // Find events starting in the next 10-32 hours (wider window to catch events in all timezones)
    // The sentReminders Set prevents duplicate sends
    const minTime = new Date(now.getTime() + 10 * 60 * 60 * 1000);
    const maxTime = new Date(now.getTime() + 32 * 60 * 60 * 1000);
    
    logger.info('🔔 Checking for events needing reminders...', {
      checkWindow: `${minTime.toISOString()} to ${maxTime.toISOString()}`
    });
    
    // Get events happening tomorrow
    const upcomingEvents = await prisma.event.findMany({
      where: {
        startDate: {
          gte: minTime,
          lte: maxTime,
        },
        status: 'UPCOMING',
      },
      include: {
        registrations: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
      },
    });
    
    if (upcomingEvents.length === 0) {
      logger.info('📭 No events needing reminders at this time');
      return;
    }
    
    logger.info(`📬 Found ${upcomingEvents.length} event(s) needing reminders`);
    
    for (const event of upcomingEvents) {
      // All registrations are considered confirmed
      const registeredUsers = event.registrations;
      
      if (registeredUsers.length === 0) {
        logger.info(`⏭️ Skipping "${event.title}" - no registrations`);
        continue;
      }
      
      logger.info(`📧 Sending reminders for "${event.title}" to ${registeredUsers.length} users`);
      
      for (const registration of registeredUsers) {
        const reminderKey = `${event.id}-${registration.userId}`;
        
        // Skip if already sent
        if (sentReminders.has(reminderKey)) {
          continue;
        }
        
        try {
          const success = await emailService.sendEventReminder(
            registration.user.email,
            registration.user.name,
            event.title,
            event.startDate,
            event.slug
          );
          
          if (success) {
            sentReminders.add(reminderKey);
            logger.info(`✅ Reminder sent to ${registration.user.email} for "${event.title}"`);
          }
          
          // Small delay between emails to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          logger.error(`❌ Failed to send reminder to ${registration.user.email}`, {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
    
    logger.info('✅ Event reminder check complete');
  } catch (error) {
    logger.error('❌ Error in sendEventReminders:', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Clean up old reminder records (events that have passed)
 */
async function cleanupOldReminders(): Promise<void> {
  try {
    const now = new Date();
    
    // Get IDs of past events
    const pastEvents = await prisma.event.findMany({
      where: {
        startDate: { lt: now },
      },
      select: { id: true },
    });
    
    const pastEventIds = new Set(pastEvents.map(e => e.id));
    
    // Remove reminders for past events
    for (const key of sentReminders) {
      const eventId = key.split('-')[0];
      if (pastEventIds.has(eventId)) {
        sentReminders.delete(key);
      }
    }
  } catch (error) {
    logger.error('Error cleaning up reminders:', { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

let reminderInterval: NodeJS.Timeout | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start the reminder scheduler
 * Checks every hour for events needing reminders
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
  
  // Clean up old reminders every 24 hours
  cleanupInterval = setInterval(() => {
    cleanupOldReminders();
  }, 24 * 60 * 60 * 1000);
  
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
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  logger.info('🔕 Event reminder scheduler stopped');
}

/**
 * Manually trigger reminder check (for testing/admin)
 */
export async function triggerReminderCheck(): Promise<{ sent: number; events: string[] }> {
  const events: string[] = [];
  let sent = 0;
  
  try {
    const now = new Date();
    const minTime = new Date(now.getTime() + 20 * 60 * 60 * 1000);
    const maxTime = new Date(now.getTime() + 28 * 60 * 60 * 1000);
    
    const upcomingEvents = await prisma.event.findMany({
      where: {
        startDate: { gte: minTime, lte: maxTime },
        status: 'UPCOMING',
      },
      include: {
        registrations: {
          include: { user: { select: { email: true, name: true } } },
        },
      },
    });
    
    for (const event of upcomingEvents) {
      events.push(event.title);
      for (const reg of event.registrations) {
        const success = await emailService.sendEventReminder(
          reg.user.email,
          reg.user.name,
          event.title,
          event.startDate,
          event.slug
        );
        if (success) sent++;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  } catch (error) {
    logger.error('Error in manual reminder trigger:', { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
  
  return { sent, events };
}
