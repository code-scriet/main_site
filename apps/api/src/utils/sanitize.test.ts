import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeHtml, sanitizeMarkdown, sanitizeText } from './sanitize.js';

// F1: sanitize.ts now backs sanitizeHtml/Markdown/Text with `sanitize-html`
// (was isomorphic-dompurify). These assert the security guarantees + the
// allowed-content preservation that the consolidation must hold equal-or-stricter.

const DANGER = /<script|<iframe|<svg|<style|<object|<embed|<form|on\w+\s*=|javascript:|data:image/i;

test('sanitizeHtml strips every dangerous construct', () => {
  const cases = [
    '<script>alert(1)</script>keep',
    '<img src="x" onerror="alert(1)">',
    '<a href="javascript:alert(1)">x</a>',
    '<div onclick="evil()">c</div>',
    '<iframe src="https://evil.com"></iframe>',
    '<svg onload="x()"></svg>',
    '<style>body{}</style>',
    '<img src="data:image/png;base64,AAAA">',  // data: image — old config leaked this
    '<a href="//evil.com">proto-rel</a>',       // proto-relative — old config leaked this
    '<object data="x.swf"></object>',
    '<form action="/x"><input></form>',
    // scheme-obfuscation variants (case / tab / entity / leading space / vbscript)
    '<a href="JaVaScRiPt:alert(1)">x</a>',
    '<a href="java\tscript:alert(1)">x</a>',
    '<a href="java&#115;cript:alert(1)">x</a>',
    '<a href=" javascript:alert(1)">x</a>',
    '<a href="vbscript:msgbox(1)">x</a>',
    '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    '<scr<script>ipt>alert(1)</scr</script>ipt>',  // nested/split tag
  ];
  for (const c of cases) {
    const out = sanitizeHtml(c);
    assert.ok(!DANGER.test(out), `danger leaked for input ${c} → ${out}`);
    // No live scheme survives in an href, regardless of obfuscation.
    assert.ok(!/href="[^"]*(javascript|vbscript|data):/i.test(out), `dangerous href survived: ${out}`);
  }
});

test('sanitizeHtml preserves safe rich content', () => {
  assert.match(sanitizeHtml('<p>Hello <strong>world</strong></p>'), /<p>Hello <strong>world<\/strong><\/p>/);
  assert.match(sanitizeHtml('<h2>T</h2><ul><li>a</li></ul>'), /<h2>T<\/h2>/);
  assert.match(sanitizeHtml('<a href="https://x.com">link</a>'), /href="https:\/\/x\.com"/);
  // rel=noopener / target are safe, allowlisted attributes — kept.
  assert.match(sanitizeHtml('<a href="https://x.com" target="_blank" rel="noopener">l</a>'), /rel="noopener"/);
  // relative + anchor hrefs allowed
  assert.match(sanitizeHtml('<a href="/events/x">e</a>'), /href="\/events\/x"/);
  assert.match(sanitizeHtml('<a href="#top">t</a>'), /href="#top"/);
  // mailto/tel allowed
  assert.match(sanitizeHtml('<a href="mailto:a@b.com">m</a>'), /href="mailto:a@b\.com"/);
});

test('sanitizeMarkdown additionally allows details/summary', () => {
  const out = sanitizeMarkdown('<details><summary>S</summary>body</details>');
  assert.match(out, /<details>/);
  assert.match(out, /<summary>S<\/summary>/);
  // still strips danger
  assert.ok(!DANGER.test(sanitizeMarkdown('<details><script>x</script></details>')));
});

test('sanitizeText strips all tags but keeps text', () => {
  assert.equal(sanitizeText('<script>alert(1)</script>keep<b>me</b>'), 'keepme');
  assert.equal(sanitizeText('<p>plain</p>'), 'plain');
  assert.equal(sanitizeText(''), '');
  assert.equal(sanitizeText(null), '');
  assert.equal(sanitizeText(undefined), '');
});

test('empty/nullish inputs return empty string', () => {
  for (const fn of [sanitizeHtml, sanitizeMarkdown, sanitizeText]) {
    assert.equal(fn(''), '');
    assert.equal(fn(null), '');
    assert.equal(fn(undefined), '');
  }
});
