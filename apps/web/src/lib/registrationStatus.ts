import { formatDate, formatTime } from './dateUtils';
import type { Event } from './api';

export function getRegistrationStatus(event: Event): {
  status: 'not_started' | 'open' | 'closed' | 'full' | 'past';
  message: string;
  canRegister: boolean;
} {
  const now = new Date();
  const eventStart = new Date(event.startDate);
  const regStart = event.registrationStartDate ? new Date(event.registrationStartDate) : null;
  const regEnd = event.registrationEndDate ? new Date(event.registrationEndDate) : eventStart;

  if (event.status === 'PAST') {
    return { status: 'past', message: 'Event has ended', canRegister: false };
  }

  if (event.capacity && event._count && event._count.registrations >= event.capacity) {
    return { status: 'full', message: 'Event is full', canRegister: false };
  }

  if (regStart && now < regStart) {
    return {
      status: 'not_started',
      message: `Registration opens ${formatDate(regStart)} at ${formatTime(regStart)}`,
      canRegister: false
    };
  }

  // If late registration is allowed, check if we're still within the extended window
  if (event.allowLateRegistration) {
    // When late registration is allowed, registration stays open even during the event
    // until the registration end date (which can be during/after event start)
    if (regEnd && now > regEnd) {
      return { status: 'closed', message: 'Registration closed', canRegister: false };
    }
    // Event is ONGOING but late registration is allowed
    if (event.status === 'ONGOING') {
      return { status: 'open', message: 'Late registration open', canRegister: true };
    }
  } else {
    // Standard behavior: registration closes when reg end date passes
    if (regEnd && now > regEnd) {
      return { status: 'closed', message: 'Registration closed', canRegister: false };
    }
  }

  return { status: 'open', message: 'Registration open', canRegister: true };
}
