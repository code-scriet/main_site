import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { Font } from '@react-pdf/renderer';
import { initFonts, resetFontInitializationForTests } from './generateCertificatePDF.js';

test('initFonts retries cleanly after a registration failure', async () => {
  resetFontInitializationForTests();

  let registerCallCount = 0;
  const registerMock = mock.method(Font, 'register', () => {
    registerCallCount += 1;
    if (registerCallCount === 1) {
      throw new Error('boom');
    }
  });
  const hyphenationMock = mock.method(Font, 'registerHyphenationCallback', () => {});

  await assert.rejects(initFonts(), /Certificate font initialization failed/);
  await assert.doesNotReject(initFonts());
  assert.equal(registerCallCount, 8);

  registerMock.mock.restore();
  hyphenationMock.mock.restore();
  resetFontInitializationForTests();
});
