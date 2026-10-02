// Unit tests for the 1224 competition ranking. This is the regression PR #101 fixes:
// re-scoring a FINISHED round must re-derive the WHOLE board's ranks from scores, or
// a corrected score leaves `rank` stale (results + exports read `rank` → misordered
// podium). The pure ranking is pinned here so the tie/gap/re-score cases can't drift.

import assert from 'node:assert/strict';
import test from 'node:test';
import { computeRanksFromScores } from './competitionRanks.js';

const ranksOf = (input: Array<{ id: string; score: number | null }>) =>
  computeRanksFromScores(input).map((r) => r.rank);

test('empty board → no ranks', () => {
  assert.deepEqual(computeRanksFromScores([]), []);
});

test('all distinct scores → 1,2,3 (best-first)', () => {
  assert.deepEqual(
    ranksOf([
      { id: 'a', score: 100 },
      { id: 'b', score: 90 },
      { id: 'c', score: 80 },
    ]),
    [1, 2, 3],
  );
});

test('ties share a rank and the next score gaps (1224)', () => {
  // two tied at the top → both rank 1, the next jumps to 3 (not 2)
  assert.deepEqual(
    ranksOf([
      { id: 'a', score: 100 },
      { id: 'b', score: 100 },
      { id: 'c', score: 90 },
      { id: 'd', score: 80 },
    ]),
    [1, 1, 3, 4],
  );
});

test('multiple tie groups gap correctly', () => {
  assert.deepEqual(
    ranksOf([
      { id: 'a', score: 100 },
      { id: 'b', score: 100 },
      { id: 'c', score: 90 },
      { id: 'd', score: 90 },
      { id: 'e', score: 80 },
    ]),
    [1, 1, 3, 3, 5],
  );
});

test('everyone tied → all rank 1', () => {
  assert.deepEqual(
    ranksOf([
      { id: 'a', score: 50 },
      { id: 'b', score: 50 },
      { id: 'c', score: 50 },
    ]),
    [1, 1, 1],
  );
});

test('null scores tie among themselves (sorted last by the query)', () => {
  assert.deepEqual(
    ranksOf([
      { id: 'a', score: 100 },
      { id: 'b', score: null },
      { id: 'c', score: null },
    ]),
    [1, 2, 2],
  );
});

test('re-scoring reorders the board → ranks follow the new order', () => {
  // Submission 'b' was corrected from 80 → 110, so the re-queried board is now
  // ordered b, a, c. Ranks must reflect the corrected ordering, not the old one.
  const board = [
    { id: 'b', score: 110 },
    { id: 'a', score: 100 },
    { id: 'c', score: 80 },
  ];
  assert.deepEqual(computeRanksFromScores(board), [
    { id: 'b', rank: 1 },
    { id: 'a', rank: 2 },
    { id: 'c', rank: 3 },
  ]);
});
