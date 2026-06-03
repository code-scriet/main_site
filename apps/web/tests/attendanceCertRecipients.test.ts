import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterAttendanceRecipients,
  filterGuestRecipients,
} from '../src/components/attendance/attendanceCertRecipients.ts';
import type { CertificateRecipient, GuestCertificateRecipient } from '../src/lib/api.ts';

function recipient(overrides: Partial<CertificateRecipient>): CertificateRecipient {
  return {
    registrationId: 'reg',
    userId: 'u',
    userName: 'Name',
    userEmail: 'name@example.com',
    userAvatar: null,
    attended: false,
    scannedAt: null,
    manualOverride: false,
    hasCertificate: false,
    certificateDbId: null,
    certificateId: null,
    certificateType: null,
    certificatePdfUrl: null,
    emailSent: false,
    emailSentAt: null,
    ...overrides,
  };
}

function guest(overrides: Partial<GuestCertificateRecipient>): GuestCertificateRecipient {
  return {
    invitationId: 'inv',
    userId: 'u',
    name: 'Guest',
    email: 'guest@example.com',
    role: 'Speaker',
    attended: false,
    certificateEnabled: true,
    certificateType: 'SPEAKER',
    ...overrides,
  };
}

test('filterAttendanceRecipients: "attended" keeps only attended', () => {
  const list = [
    recipient({ registrationId: 'a', attended: true }),
    recipient({ registrationId: 'b', attended: false }),
  ];
  const out = filterAttendanceRecipients(list, { filter: 'attended', search: '' });
  assert.deepEqual(out.map((r) => r.registrationId), ['a']);
});

test('filterAttendanceRecipients: "no_cert" drops already-certified', () => {
  const list = [
    recipient({ registrationId: 'a', hasCertificate: true }),
    recipient({ registrationId: 'b', hasCertificate: false }),
  ];
  const out = filterAttendanceRecipients(list, { filter: 'no_cert', search: '' });
  assert.deepEqual(out.map((r) => r.registrationId), ['b']);
});

test('filterAttendanceRecipients: search matches name or email, case-insensitive', () => {
  const list = [
    recipient({ registrationId: 'a', userName: 'Asha Rao', userEmail: 'asha@x.com' }),
    recipient({ registrationId: 'b', userName: 'Bob', userEmail: 'bob@y.com' }),
  ];
  assert.deepEqual(
    filterAttendanceRecipients(list, { filter: 'all', search: 'ASHA' }).map((r) => r.registrationId),
    ['a'],
  );
  assert.deepEqual(
    filterAttendanceRecipients(list, { filter: 'all', search: 'y.com' }).map((r) => r.registrationId),
    ['b'],
  );
});

test('filterAttendanceRecipients: whitespace-only search is treated as no filter', () => {
  const list = [recipient({ registrationId: 'a' }), recipient({ registrationId: 'b' })];
  const out = filterAttendanceRecipients(list, { filter: 'all', search: '   ' });
  assert.equal(out.length, 2);
});

test('filterGuestRecipients: hides non-attendees unless includeNonAttendees', () => {
  const list = [
    guest({ invitationId: 'a', attended: true }),
    guest({ invitationId: 'b', attended: false }),
  ];
  assert.deepEqual(
    filterGuestRecipients(list, { filter: 'all', search: '', includeNonAttendees: false }).map((g) => g.invitationId),
    ['a'],
  );
  assert.deepEqual(
    filterGuestRecipients(list, { filter: 'all', search: '', includeNonAttendees: true }).map((g) => g.invitationId),
    ['a', 'b'],
  );
});

test('filterGuestRecipients: "no_cert" drops guests with an existing certificate', () => {
  const list = [
    guest({ invitationId: 'a', attended: true, existingCertificateId: 'cert-1' }),
    guest({ invitationId: 'b', attended: true, existingCertificateId: null }),
  ];
  const out = filterGuestRecipients(list, { filter: 'no_cert', search: '', includeNonAttendees: true });
  assert.deepEqual(out.map((g) => g.invitationId), ['b']);
});

test('filterGuestRecipients: search also matches role', () => {
  const list = [
    guest({ invitationId: 'a', attended: true, role: 'Judge' }),
    guest({ invitationId: 'b', attended: true, role: 'Speaker' }),
  ];
  const out = filterGuestRecipients(list, { filter: 'all', search: 'judge', includeNonAttendees: true });
  assert.deepEqual(out.map((g) => g.invitationId), ['a']);
});
