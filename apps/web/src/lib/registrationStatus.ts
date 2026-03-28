import { formatDate, formatTime } from './dateUtils';
import type { Event } from './api';

export function getRegistrationStatus(event: Event): {
  status: 'not_started' | 'open' | 'closed' | 'full' | 'past';
  message: string;
  canRegister: boolean;
} {
  const now = new Date();
  const eventStart = new Date(event.startDate);
  const eventEnd = event.endDate ? new Date(event.endDate) : eventStart;
  const regStart = event.registrationStartDate ? new Date(event.registrationStartDate) : null;
  const regEnd = event.registrationEndDate
    ? new Date(event.registrationEndDate)
    : (event.allowLateRegistration ? eventEnd : eventStart);

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

  if (now > regEnd) {
    return { status: 'closed', message: 'Registration closed', canRegister: false };
  }

  if (event.allowLateRegistration && event.status === 'ONGOING') {
    return { status: 'open', message: 'Late registration open', canRegister: true };
  }

  return { status: 'open', message: 'Registration open', canRegister: true };
}
