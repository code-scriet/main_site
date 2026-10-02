import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCertData, type CertRenderSource } from './certificateIssuance.js';

const baseSource: CertRenderSource = {
  certId: 'ABCD-EFGH-IJKL',
  recipientName: 'Lakshya Pandey',
  eventName: 'Hackathon 2026',
  type: 'WINNER',
  issuedAt: new Date('2026-03-13T00:00:00.000Z'),
  signatoryName: 'Test Signatory',
  signatoryTitle: 'Club President',
};

test('buildCertData threads teamName through (the field regeneration used to drop)', () => {
  const data = buildCertData({ ...baseSource, teamName: 'The Null Pointers' });
  assert.equal(data.teamName, 'The Null Pointers');
});

test('buildCertData omits optional fields as undefined when absent', () => {
  const data = buildCertData(baseSource);
  assert.equal(data.teamName, undefined);
  assert.equal(data.position, undefined);
  assert.equal(data.domain, undefined);
  assert.equal(data.description, undefined);
  assert.equal(data.facultyName, undefined);
});

test('buildCertData sanitizes every text field (idempotent — safe on pre-sanitized input)', () => {
  const data = buildCertData({
    ...baseSource,
    recipientName: '<script>alert(1)</script>Mallory',
    eventName: 'Hack<b>a</b>thon',
    teamName: '<img src=x onerror=1>Team',
    description: 'Great <i>work</i>',
  });
  // sanitizeText strips tags; no markup should survive into the PDF payload.
  assert.ok(!/[<>]/.test(data.recipientName), `recipientName not sanitized: ${data.recipientName}`);
  assert.ok(!/[<>]/.test(data.eventName), `eventName not sanitized: ${data.eventName}`);
  assert.ok(!/[<>]/.test(data.teamName ?? ''), `teamName not sanitized: ${data.teamName}`);
  assert.ok(!/[<>]/.test(data.description ?? ''), `description not sanitized: ${data.description}`);
});

test('buildCertData passes through the render image url, empty string → undefined', () => {
  const withImage = buildCertData({ ...baseSource, signatoryImageUrl: 'https://cdn/sig.png' });
  assert.equal(withImage.signatoryImageUrl, 'https://cdn/sig.png');

  const blank = buildCertData({ ...baseSource, signatoryImageUrl: '' });
  assert.equal(blank.signatoryImageUrl, undefined);
});

test('buildCertData preserves non-text fields verbatim', () => {
  const data = buildCertData({ ...baseSource, position: '1', domain: 'AI' });
  assert.equal(data.certId, 'ABCD-EFGH-IJKL');
  assert.equal(data.type, 'WINNER');
  assert.equal(data.issuedAt.toISOString(), '2026-03-13T00:00:00.000Z');
  assert.equal(data.position, '1');
  assert.equal(data.domain, 'AI');
});
