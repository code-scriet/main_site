// Unit tests for the plagiarism similarity heuristic. Pins that identical/near-identical
// code flags high and unrelated code stays low, so a tweak to the fingerprint can't
// silently change the review signal.

import assert from 'node:assert/strict';
import test from 'node:test';
import { fingerprint, jaccard, findPlagiarismPairs, normalizeCode } from './plagiarism.js';

const codeA = `function add(a, b) {\n  // sum two numbers\n  return a + b;\n}\nconsole.log(add(1, 2));`;
const codeAReformatted = `function add(a,b){return a+b;}\nconsole.log(add(1,2)); // changed comment`;
const codeB = `import sys\nn = int(input())\nprint(sum(range(n)))\n`;

test('normalizeCode strips comments + collapses whitespace', () => {
  assert.ok(!normalizeCode(codeA).includes('sum two numbers'));
  assert.ok(!normalizeCode(codeA).includes('\n'));
});

test('identical code → similarity 1', () => {
  assert.equal(jaccard(fingerprint(codeA), fingerprint(codeA)), 1);
});

test('reformatted/comment-changed copy → high similarity', () => {
  assert.ok(jaccard(fingerprint(codeA), fingerprint(codeAReformatted)) >= 0.5);
});

test('unrelated code → low similarity', () => {
  assert.ok(jaccard(fingerprint(codeA), fingerprint(codeB)) < 0.3);
});

test('findPlagiarismPairs flags the copy pair, not the unrelated one', () => {
  const pairs = findPlagiarismPairs([
    { userId: 'u1', userName: 'A', code: codeA },
    { userId: 'u2', userName: 'B', code: codeAReformatted },
    { userId: 'u3', userName: 'C', code: codeB },
  ], 0.5);
  assert.equal(pairs.length, 1);
  assert.deepEqual([pairs[0].userAId, pairs[0].userBId], ['u1', 'u2']);
  assert.ok(pairs[0].similarity >= 0.5);
});
