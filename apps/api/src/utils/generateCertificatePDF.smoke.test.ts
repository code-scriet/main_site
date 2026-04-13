import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDescription, formatPosition, generateCertificatePDF } from './generateCertificatePDF.js';

test('generateCertificatePDF returns a non-empty PDF buffer', async () => {
  const pdfBuffer = await generateCertificatePDF({
    recipientName: 'Lakshya Pandey',
    eventName: 'Hackathon 2026',
    type: 'PARTICIPATION',
    position: '1',
    domain: 'Artificial Intelligence',
    description: 'For active participation and contribution throughout the event.',
    certId: 'ABCD-EFGH-IJKL',
    issuedAt: new Date('2026-03-13T00:00:00.000Z'),
    signatoryName: 'Test Signatory',
    signatoryTitle: 'Club President',
    facultyName: 'Faculty Signatory',
    facultyTitle: 'Faculty Coordinator',
  });

  assert.ok(pdfBuffer.length > 0, 'expected PDF buffer to be non-empty');
  assert.equal(pdfBuffer.subarray(0, 4).toString('utf8'), '%PDF');
});

test('generateCertificatePDF accepts team-specific metadata', async () => {
  const pdfBuffer = await generateCertificatePDF({
    recipientName: 'Lakshya Pandey',
    teamName: 'Binary Beasts',
    eventName: 'Hackathon 2026',
    type: 'WINNER',
    position: '1st Place',
    description: 'This certificate is awarded to Lakshya Pandey as a member of Team Binary Beasts, which secured 1st Place in Hackathon 2026 (Final Round).',
    certId: 'TEAM-1234-WIN1',
    issuedAt: new Date('2026-03-13T00:00:00.000Z'),
    signatoryName: 'Test Signatory',
    signatoryTitle: 'Club President',
  });

  assert.ok(pdfBuffer.length > 0, 'expected team certificate PDF buffer to be non-empty');
  assert.equal(pdfBuffer.subarray(0, 4).toString('utf8'), '%PDF');
});

test('generateCertificatePDF can render repeatedly after fonts initialize', async () => {
  const first = await generateCertificatePDF({
    recipientName: 'Lakshya Pandey',
    eventName: 'Hackathon 2026',
    type: 'PARTICIPATION',
    certId: 'WXYZ-1234-ABCD',
    issuedAt: new Date('2026-03-13T00:00:00.000Z'),
    signatoryName: 'Test Signatory',
  });

  const second = await generateCertificatePDF({
    recipientName: 'Lakshya Pandey',
    eventName: 'Hackathon 2026',
    type: 'PARTICIPATION',
    certId: 'LMNO-5678-PQRS',
    issuedAt: new Date('2026-03-13T00:00:00.000Z'),
    signatoryName: 'Test Signatory',
  });

  assert.equal(first.subarray(0, 4).toString('utf8'), '%PDF');
  assert.equal(second.subarray(0, 4).toString('utf8'), '%PDF');
});

test('formatPosition normalizes winner-style rank labels', () => {
  assert.equal(formatPosition('1st Place'), 'First Place');
  assert.equal(formatPosition('2nd place'), 'Second Place');
  assert.equal(formatPosition('third place'), 'Third Place');
});

test('buildDescription passes through custom descriptions without modification', () => {
  const description = 'Custom certificate wording for final round winners.';

  assert.deepEqual(
    buildDescription({
      recipientName: 'Lakshya Pandey',
      eventName: 'Hackathon 2026',
      type: 'WINNER',
      description,
      certId: 'DESC-1234-TEST',
      issuedAt: new Date('2026-03-13T00:00:00.000Z'),
      signatoryName: 'Test Signatory',
    }, 'WINNER'),
    [description],
  );
});
