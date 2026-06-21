// Unit tests for the contest scoring engine (Phase A redesign): weight normalization,
// the round/final weighted aggregate (capped 0–100), ICPC penalty, and ranking under
// both BEST_SCORE and ICPC. These pin the 3-level "problem → round → final" math so a
// retune of admin weights can't silently change the scoring contract.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateWeighted,
  buildDsaLeaderboard,
  computeIcpcPenalty,
  normalizeWeights,
  rankEntries,
  type DsaLbProblemLink,
  type DsaLbSubmission,
} from './contestScoring.js';

const links: DsaLbProblemLink[] = [
  { problemId: 'p1', points: 100, problem: { title: 'P1' } },
  { problemId: 'p2', points: 100, problem: { title: 'P2' } },
];
const sub = (userId: string, name: string, problemId: string, score: number): DsaLbSubmission => ({
  problemId, userId, score, verdict: score === 100 ? 'ACCEPTED' : 'WRONG_ANSWER', runtimeMs: 10,
  contestWrongAttempts: 0, contestSolvedAt: score === 100 ? new Date(1000) : null,
  user: { id: userId, name, avatar: null },
});

test('normalizeWeights: proportional weights sum to 1', () => {
  const n = normalizeWeights([6, 4]);
  assert.equal(Math.round((n[0] + n[1]) * 1000) / 1000, 1);
  assert.ok(Math.abs(n[0] - 0.6) < 1e-9 && Math.abs(n[1] - 0.4) < 1e-9);
});

test('normalizeWeights: all-zero falls back to equal split', () => {
  assert.deepEqual(normalizeWeights([0, 0, 0]), [1 / 3, 1 / 3, 1 / 3]);
});

test('normalizeWeights: empty → empty', () => {
  assert.deepEqual(normalizeWeights([]), []);
});

test('aggregateWeighted: hard 0.6 / easy 0.4 within a round', () => {
  // hard problem 100%, easy problem 50% → 0.6*100 + 0.4*50 = 80
  const score = aggregateWeighted([
    { weight: 0.6, score: 100 },
    { weight: 0.4, score: 50 },
  ]);
  assert.equal(score, 80);
});

test('aggregateWeighted: event-final hard round 0.7 / easy round 0.3', () => {
  // round2 (hard) 90, round1 (easy) 50 → 0.7*90 + 0.3*50 = 78
  const final = aggregateWeighted([
    { weight: 0.7, score: 90 },
    { weight: 0.3, score: 50 },
  ]);
  assert.equal(final, 78);
});

test('aggregateWeighted: caps at 100 and clamps component scores', () => {
  assert.equal(aggregateWeighted([{ weight: 1, score: 100 }, { weight: 1, score: 100 }]), 100);
  // an out-of-range component score is clamped to [0,100]
  assert.equal(aggregateWeighted([{ weight: 1, score: 150 }]), 100);
  assert.equal(aggregateWeighted([{ weight: 1, score: -20 }]), 0);
});

test('aggregateWeighted: empty set → 0', () => {
  assert.equal(aggregateWeighted([]), 0);
});

test('aggregateWeighted: all-zero weights → equal split (still scores)', () => {
  // two problems, weights 0, scores 100 and 0 → equal split → 50
  assert.equal(aggregateWeighted([{ weight: 0, score: 100 }, { weight: 0, score: 0 }]), 50);
});

test('computeIcpcPenalty: wrong attempts × 20 + minutes, solved only', () => {
  // 2 wrong + solved at 30min, plus a clean solve at 10min → (2*20+30) + (0+10) = 80
  assert.equal(
    computeIcpcPenalty([
      { wrongAttempts: 2, minutesToSolve: 30 },
      { wrongAttempts: 0, minutesToSolve: 10 },
    ]),
    80,
  );
  assert.equal(computeIcpcPenalty([]), 0);
});

test('rankEntries BEST_SCORE: score desc, earliest submission tie-break, 1224', () => {
  const ranks = rankEntries(
    [
      { score: 90, penalty: 0, earliestMs: 200 },
      { score: 90, penalty: 0, earliestMs: 100 },
      { score: 80, penalty: 0, earliestMs: 50 },
    ],
    'BEST_SCORE',
  );
  // both 90s share rank 1, the 80 gaps to 3
  assert.deepEqual(ranks, [1, 1, 3]);
});

test('rankEntries ICPC: equal score broken by lower penalty', () => {
  const ranks = rankEntries(
    [
      { score: 100, penalty: 120, earliestMs: 10 },
      { score: 100, penalty: 40, earliestMs: 20 },
    ],
    'ICPC',
  );
  // lower penalty (second entry) ranks 1
  assert.deepEqual(ranks, [2, 1]);
});

// ── Team aggregation (Phase H1) ──
// Team T1: u1 solves p1 (100), u2 solves p2 (100). p1 + p2 weighted 50/50.
const teamSubs = [sub('u1', 'Alice', 'p1', 100), sub('u2', 'Bob', 'p2', 100)];
const teamByUser = new Map([
  ['u1', { teamId: 't1', teamName: 'Team One' }],
  ['u2', { teamId: 't1', teamName: 'Team One' }],
]);

test('team BEST_PER_PROBLEM: best member per problem → full team score', () => {
  const rows = buildDsaLeaderboard(links, teamSubs, null, 'BEST_SCORE', 10, { aggregation: 'BEST_PER_PROBLEM', teamByUser });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].userId, 't1');
  assert.equal(rows[0].userName, 'Team One');
  assert.equal(rows[0].isTeam, true);
  assert.deepEqual(rows[0].members?.sort(), ['Alice', 'Bob']);
  // p1=100 (Alice) + p2=100 (Bob) → 0.5*100 + 0.5*100 = 100
  assert.equal(rows[0].totalScore, 100);
});

test('team AVERAGE: mean of members’ round scores', () => {
  // Alice round = 0.5*100 + 0.5*0 = 50; Bob = 50 → mean 50
  const rows = buildDsaLeaderboard(links, teamSubs, null, 'BEST_SCORE', 10, { aggregation: 'AVERAGE', teamByUser });
  assert.equal(rows[0].totalScore, 50);
});

test('team BEST_MEMBER: the single strongest member carries the team', () => {
  // both members score 50 → best member = 50
  const rows = buildDsaLeaderboard(links, teamSubs, null, 'BEST_SCORE', 10, { aggregation: 'BEST_MEMBER', teamByUser });
  assert.equal(rows[0].totalScore, 50);
});

test('solo (no team option): one row per user, no team flag', () => {
  const rows = buildDsaLeaderboard(links, teamSubs, null, 'BEST_SCORE', 10);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => !r.isTeam));
});
