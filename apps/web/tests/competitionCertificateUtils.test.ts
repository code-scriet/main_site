import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateCompetitionCandidates,
  buildCompetitionBulkRecipients,
  createDefaultTierConfigs,
} from '../src/components/attendance/competitionCertificateUtils.ts';
import type { CompetitionResultsSummaryRound } from '../src/lib/api.ts';

const teamRounds: CompetitionResultsSummaryRound[] = [
  {
    roundId: 'round-1',
    title: 'Round One',
    submissions: [
      {
        submissionId: 'submission-1',
        rank: 1,
        score: 95,
        submittedAt: '2026-04-10T10:00:00.000Z',
        teamId: 'team-alpha',
        teamName: 'Alpha',
        members: [
          { userId: 'user-1', name: 'Asha', email: 'asha@example.com', attended: true },
          { userId: 'user-2', name: 'Ravi', email: 'ravi@example.com', attended: false },
        ],
      },
      {
        submissionId: 'submission-2',
        rank: 2,
        score: 90,
        submittedAt: '2026-04-10T10:05:00.000Z',
        teamId: 'team-beta',
        teamName: 'Beta',
        members: [
          { userId: 'user-3', name: 'Neha', email: 'neha@example.com', attended: true },
        ],
      },
    ],
  },
  {
    roundId: 'round-2',
    title: 'Round Two',
    submissions: [
      {
        submissionId: 'submission-3',
        rank: 2,
        score: 60,
        submittedAt: '2026-04-10T12:00:00.000Z',
        teamId: 'team-alpha',
        teamName: 'Alpha',
        members: [
          { userId: 'user-1', name: 'Asha', email: 'asha@example.com', attended: true },
          { userId: 'user-2', name: 'Ravi', email: 'ravi@example.com', attended: false },
        ],
      },
      {
        submissionId: 'submission-4',
        rank: 1,
        score: 98,
        submittedAt: '2026-04-10T11:55:00.000Z',
        teamId: 'team-beta',
        teamName: 'Beta',
        members: [
          { userId: 'user-3', name: 'Neha', email: 'neha@example.com', attended: true },
        ],
      },
    ],
  },
];

const individualRounds: CompetitionResultsSummaryRound[] = [
  {
    roundId: 'round-a',
    title: 'Qualifier',
    submissions: [
      {
        submissionId: 'submission-a1',
        rank: 1,
        score: 91,
        submittedAt: '2026-04-10T09:00:00.000Z',
        userId: 'solo-1',
        userName: 'Ira',
        userEmail: 'ira@example.com',
        attended: true,
      },
      {
        submissionId: 'submission-a2',
        rank: 2,
        score: 88,
        submittedAt: '2026-04-10T09:05:00.000Z',
        userId: 'solo-2',
        userName: 'Kabir',
        userEmail: 'kabir@example.com',
        attended: false,
      },
    ],
  },
  {
    roundId: 'round-b',
    title: 'Finale',
    submissions: [
      {
        submissionId: 'submission-b1',
        rank: 2,
        score: 80,
        submittedAt: '2026-04-10T13:00:00.000Z',
        userId: 'solo-1',
        userName: 'Ira',
        userEmail: 'ira@example.com',
        attended: true,
      },
      {
        submissionId: 'submission-b2',
        rank: 1,
        score: 97,
        submittedAt: '2026-04-10T12:58:00.000Z',
        userId: 'solo-2',
        userName: 'Kabir',
        userEmail: 'kabir@example.com',
        attended: false,
      },
    ],
  },
];

test('specific_round preserves the selected round ordering', () => {
  const candidates = aggregateCompetitionCandidates(teamRounds, 'specific_round', ['round-1']);

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].teamName, 'Alpha');
  assert.equal(candidates[0].rank, 1);
  assert.equal(candidates[0].placeholderRoundTitle, 'Round One');
  assert.equal(candidates[1].teamName, 'Beta');
  assert.equal(candidates[1].rank, 2);
});

test('best_selected_rounds ranks by each competitor best score', () => {
  const candidates = aggregateCompetitionCandidates(teamRounds, 'best_selected_rounds', ['round-1', 'round-2']);

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].teamName, 'Beta');
  assert.equal(candidates[0].score, 98);
  assert.equal(candidates[0].sourceRoundTitle, 'Round Two');
  assert.equal(candidates[1].teamName, 'Alpha');
  assert.equal(candidates[1].score, 95);
});

test('average_selected_rounds ranks by average score across selected rounds', () => {
  const candidates = aggregateCompetitionCandidates(teamRounds, 'average_selected_rounds', ['round-1', 'round-2']);

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].teamName, 'Beta');
  assert.equal(candidates[0].score, 94);
  assert.equal(candidates[0].placeholderRoundTitle, 'Round One, Round Two');
  assert.equal(candidates[1].teamName, 'Alpha');
  assert.equal(candidates[1].score, 77.5);
});

test('aggregation supports individual competitions and payload generation', () => {
  const candidates = aggregateCompetitionCandidates(individualRounds, 'best_selected_rounds', ['round-a', 'round-b']);

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].displayName, 'Kabir');
  assert.equal(candidates[0].teamName, undefined);
  assert.equal(candidates[0].members.length, 1);

  const { previewRows, recipients } = buildCompetitionBulkRecipients({
    candidates,
    includedUserIds: new Set(['solo-1', 'solo-2']),
    tierConfigs: createDefaultTierConfigs(false),
    eventName: 'Code Clash 2026',
  });

  assert.equal(previewRows.length, 2);
  assert.equal(recipients.length, 2);
  assert.equal(recipients[0].type, 'WINNER');
  assert.match(recipients[0].description ?? '', /Code Clash 2026/);
  assert.equal(recipients[1].type, 'WINNER');
});
