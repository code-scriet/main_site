// Pure recipient-filtering for the attendance side of EventCertificateWizard.
// Extracted from the wizard's useMemo blocks so the filter rules (attendance /
// no-cert / search, plus the guest "include non-attendees" gate) have a single
// home and a test surface. Sibling to competitionCertificateUtils.ts, which
// already owns the competition side.
//
// Search semantics are preserved exactly as the wizard had them: the search is
// gated on a trimmed-non-empty check, but matched with the un-trimmed (only
// lower-cased) query — do not "fix" that here without auditing the UI.

import type { CertificateRecipient, GuestCertificateRecipient } from '@/lib/api';

export type RecipientFilter = 'all' | 'attended' | 'no_cert';

export interface AttendanceRecipientFilterOptions {
  filter: RecipientFilter;
  search: string;
}

export function filterAttendanceRecipients(
  recipients: CertificateRecipient[],
  { filter, search }: AttendanceRecipientFilterOptions,
): CertificateRecipient[] {
  let list = recipients;
  if (filter === 'attended') list = list.filter((recipient) => recipient.attended);
  if (filter === 'no_cert') list = list.filter((recipient) => !recipient.hasCertificate);
  if (search.trim()) {
    const query = search.toLowerCase();
    list = list.filter((recipient) =>
      recipient.userName.toLowerCase().includes(query)
      || recipient.userEmail.toLowerCase().includes(query),
    );
  }
  return list;
}

export interface GuestRecipientFilterOptions {
  filter: RecipientFilter;
  search: string;
  includeNonAttendees: boolean;
}

export function filterGuestRecipients(
  recipients: GuestCertificateRecipient[],
  { filter, search, includeNonAttendees }: GuestRecipientFilterOptions,
): GuestCertificateRecipient[] {
  let list = recipients;
  if (!includeNonAttendees) {
    list = list.filter((recipient) => recipient.attended);
  }
  if (filter === 'attended') list = list.filter((recipient) => recipient.attended);
  if (filter === 'no_cert') list = list.filter((recipient) => !recipient.existingCertificateId);
  if (search.trim()) {
    const query = search.toLowerCase();
    list = list.filter((recipient) =>
      recipient.name.toLowerCase().includes(query)
      || recipient.email.toLowerCase().includes(query)
      || recipient.role.toLowerCase().includes(query),
    );
  }
  return list;
}
