import { prisma } from '../lib/prisma.js';
import { EventStatus } from '@prisma/client';
import { logger } from './logger.js';

/**
 * Updates the status of events based on their start and end dates.
 * - UPCOMING -> ONGOING (if startDate <= now)
 * - ONGOING -> PAST (if endDate < now)
 * - UPCOMING -> PAST (if endDate < now - e.g. missed update)
 */
export async function updateEventStatuses() {
  const now = new Date();

  try {
    // 1. Mark UPCOMING events as ONGOING if they have started
    await prisma.event.updateMany({
      where: {
        status: EventStatus.UPCOMING,
        startDate: { lte: now },
        // Ensure we don't accidentally set to ONGOING if it's already over (addressed in step 2/3)
        // But strictly: if it started and hasn't ended (or has no end date?), it's ONGOING.
        // If it has ended, step 2/3 will catch it.
        OR: [
            { endDate: { gt: now } },
            { endDate: null } // Infinite events?
        ]
      },
      data: {
        status: EventStatus.ONGOING,
      },
    });

    // 2. Mark ONGOING events as PAST if they have ended
    await prisma.event.updateMany({
      where: {
        status: EventStatus.ONGOING,
        endDate: { lt: now }, // Strictly less than now
      },
      data: {
        status: EventStatus.PAST,
      },
    });

    // 3. Catch-all: Mark UPCOMING events as PAST if they have already ended (missed the window)
    await prisma.event.updateMany({
        where: {
            status: EventStatus.UPCOMING,
            endDate: { lt: now }
        },
        data: {
            status: EventStatus.PAST
        }
    })

  } catch (error) {
    logger.error('Failed to update event statuses:', { error: error instanceof Error ? error.message : String(error) });
    // Non-blocking error, we don't want to crash the request
  }
}
