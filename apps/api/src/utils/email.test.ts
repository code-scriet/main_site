import assert from 'node:assert/strict';
import test from 'node:test';
import { emailTemplateTestUtils } from './email.js';

test('markdownToEmailHtml sanitizes raw HTML before styling', () => {
  const html = emailTemplateTestUtils.markdownToEmailHtml(
    'Hello<script>alert(1)</script><img src="https://example.com/x.png" onerror="alert(1)" /><a href="javascript:alert(1)">bad</a>'
  );

  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('onerror='));
  assert.ok(!html.includes('javascript:alert(1)'));
  assert.ok(html.includes('<img src="https://example.com/x.png">'));
});
