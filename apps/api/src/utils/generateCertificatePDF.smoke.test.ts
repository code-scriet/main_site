import assert from 'node:assert/strict';
import test from 'node:test';
import { generateCertificatePDF } from './generateCertificatePDF.js';

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
