import type { InvitationStatus } from '@prisma/client';

export type DerivedInvitationStatus = InvitationStatus | 'EXPIRED';

export function getEffectiveEventEnd(event: { startDate: Date; endDate: Date | null }): Date {
  return event.endDate ?? event.startDate;
}

export function deriveInvitationStatus(invitation: {
  status: InvitationStatus;
  event: { startDate: Date; endDate: Date | null };
}): DerivedInvitationStatus {
  if (invitation.status === 'PENDING' && getEffectiveEventEnd(invitation.event) < new Date()) {
    return 'EXPIRED';
  }

  return invitation.status;
}
