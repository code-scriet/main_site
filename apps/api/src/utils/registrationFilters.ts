import { Prisma, RegistrationType } from '@prisma/client';
import { prisma, withRetry } from '../lib/prisma.js';

// Hard Constraint #11: capacity counts and public "X registered" totals
// must only consider PARTICIPANT registrations. GUEST registrations come
// from invitations and never consume participant capacity.

export const participantsOnly: Prisma.EventRegistrationWhereInput = {
  registrationType: RegistrationType.PARTICIPANT,
};

export const guestsOnly: Prisma.EventRegistrationWhereInput = {
  registrationType: RegistrationType.GUEST,
};

export const isParticipant = <T extends { registrationType: RegistrationType }>(reg: T): boolean =>
  reg.registrationType === RegistrationType.PARTICIPANT;

export const isGuest = <T extends { registrationType: RegistrationType }>(reg: T): boolean =>
  reg.registrationType === RegistrationType.GUEST;

export const countParticipants = (eventId: string): Promise<number> =>
  withRetry(() =>
    prisma.eventRegistration.count({
      where: { eventId, ...participantsOnly },
    }),
  );

export const countGuests = (eventId: string): Promise<number> =>
  withRetry(() =>
    prisma.eventRegistration.count({
      where: { eventId, ...guestsOnly },
    }),
  );
