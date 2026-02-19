type RegistrationStatus = 'open' | 'not_started' | 'closed' | 'full';

export interface RegistrationStatusEventInput {
  startDate: Date;
  endDate: Date | null;
  registrationStartDate: Date | null;
  registrationEndDate: Date | null;
  allowLateRegistration: boolean;
  capacity: number | null;
}

export const getRegistrationStatus = (
  event: RegistrationStatusEventInput,
  registrationsCount: number,
  now = new Date()
): RegistrationStatus => {
  if (event.registrationStartDate && now < event.registrationStartDate) {
    return 'not_started';
  }

  const eventEndBoundary = event.endDate ?? event.startDate;
  const registrationCloseBoundary = event.registrationEndDate
    ?? (event.allowLateRegistration ? eventEndBoundary : event.startDate);

  if (now > registrationCloseBoundary) {
    return 'closed';
  }

  if (event.capacity && registrationsCount >= event.capacity) {
    return 'full';
  }

  return 'open';
};
