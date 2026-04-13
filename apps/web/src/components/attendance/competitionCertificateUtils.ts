import type {
  CertType,
  CertificateBulkRecipientInput,
  CertificateTemplate,
  CompetitionGenerationStrategy,
  CompetitionResultsSummaryRound,
  CompetitionResultsSummarySubmission,
} from '../../lib/api.ts';

export type CompetitionCertificateTierKey = 'rank_1' | 'rank_2' | 'rank_3' | 'other_ranked';

export interface CompetitionCertificateTierConfig {
  type: CertType;
  position: string;
  descriptionTemplate: string;
  template: CertificateTemplate;
}

export type CompetitionCertificateTierConfigMap = Record<
  CompetitionCertificateTierKey,
  CompetitionCertificateTierConfig
>;

export interface CompetitionCertificateMember {
  userId: string;
  name: string;
  email: string;
  attended: boolean;
}

export interface CompetitionCertificateCandidate {
  competitorKey: string;
  displayName: string;
  teamId?: string;
  teamName?: string;
  rank: number;
  score: number;
  bestScore: number;
  earliestSubmittedAt: string;
  sourceRoundId?: string;
  sourceRoundTitle: string;
  placeholderRoundTitle: string;
  strategySourceLabel: string;
  contributingRoundIds: string[];
  contributingRoundTitles: string[];
  members: CompetitionCertificateMember[];
}

export interface CompetitionCertificatePreviewRow {
  competitorKey: string;
  userId: string;
  name: string;
  email: string;
  attended: boolean;
  teamName?: string;
  rank: number;
  score: number;
  certType: CertType;
  position: string | null;
  description: string;
  template: CertificateTemplate;
  strategySource: string;
  tierKey: CompetitionCertificateTierKey;
}

type RoundSubmissionEntry = {
  roundId: string;
  roundTitle: string;
  submission: CompetitionResultsSummarySubmission;
};

type GroupedCandidateEntry = {
  key: string;
  displayName: string;
  teamId?: string;
  teamName?: string;
  members: CompetitionCertificateMember[];
  roundId: string;
  roundTitle: string;
  score: number;
  submittedAt: string;
};

const TEMPLATE_PLACEHOLDER_PATTERN = /\{(name|teamName|position|eventName|roundTitle)\}/g;

function getSubmissionMembers(submission: CompetitionResultsSummarySubmission): CompetitionCertificateMember[] {
  if (submission.members && submission.members.length > 0) {
    return submission.members.map((member) => ({
      userId: member.userId,
      name: member.name,
      email: member.email,
      attended: member.attended,
    }));
  }

  if (submission.userId && submission.userName && submission.userEmail) {
    return [{
      userId: submission.userId,
      name: submission.userName,
      email: submission.userEmail,
      attended: submission.attended ?? false,
    }];
  }

  return [];
}

function getCompetitorKey(submission: CompetitionResultsSummarySubmission): string {
  if (submission.teamId) {
    return `team:${submission.teamId}`;
  }

  if (submission.userId) {
    return `user:${submission.userId}`;
  }

  return `submission:${submission.submissionId}`;
}

function getDisplayName(submission: CompetitionResultsSummarySubmission): string {
  return submission.teamName || submission.userName || submission.userEmail || submission.submissionId;
}

function getComparableScore(value: number | null | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function compareCandidates(
  left: Pick<CompetitionCertificateCandidate, 'score' | 'bestScore' | 'earliestSubmittedAt' | 'displayName'>,
  right: Pick<CompetitionCertificateCandidate, 'score' | 'bestScore' | 'earliestSubmittedAt' | 'displayName'>,
): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (right.bestScore !== left.bestScore) {
    return right.bestScore - left.bestScore;
  }

  const leftTime = new Date(left.earliestSubmittedAt).getTime();
  const rightTime = new Date(right.earliestSubmittedAt).getTime();
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return left.displayName.localeCompare(right.displayName);
}

function assignRanks(candidates: Omit<CompetitionCertificateCandidate, 'rank'>[]): CompetitionCertificateCandidate[] {
  return [...candidates]
    .sort(compareCandidates)
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    }));
}

function flattenSelectedEntries(
  rounds: CompetitionResultsSummaryRound[],
  selectedRoundIds: string[],
): RoundSubmissionEntry[] {
  const selectedSet = new Set(selectedRoundIds);

  return rounds.flatMap((round) =>
    selectedSet.has(round.roundId)
      ? round.submissions.map((submission) => ({
          roundId: round.roundId,
          roundTitle: round.title,
          submission,
        }))
      : [],
  );
}

function groupEntriesByCompetitor(entries: RoundSubmissionEntry[]): Map<string, GroupedCandidateEntry[]> {
  const grouped = new Map<string, GroupedCandidateEntry[]>();

  for (const entry of entries) {
    const members = getSubmissionMembers(entry.submission);
    if (members.length === 0) continue;

    const candidateEntry: GroupedCandidateEntry = {
      key: getCompetitorKey(entry.submission),
      displayName: getDisplayName(entry.submission),
      teamId: entry.submission.teamId,
      teamName: entry.submission.teamName,
      members,
      roundId: entry.roundId,
      roundTitle: entry.roundTitle,
      score: getComparableScore(entry.submission.score),
      submittedAt: entry.submission.submittedAt,
    };

    const existing = grouped.get(candidateEntry.key) || [];
    existing.push(candidateEntry);
    grouped.set(candidateEntry.key, existing);
  }

  return grouped;
}

function getBestEntry(entries: GroupedCandidateEntry[]): GroupedCandidateEntry {
  return [...entries].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return new Date(left.submittedAt).getTime() - new Date(right.submittedAt).getTime();
  })[0];
}

export function isTeamCompetition(rounds: CompetitionResultsSummaryRound[]): boolean {
  return rounds.some((round) =>
    round.submissions.some((submission) => Boolean(submission.teamId || submission.teamName)),
  );
}

export function getTierKeyForRank(rank: number): CompetitionCertificateTierKey {
  if (rank === 1) return 'rank_1';
  if (rank === 2) return 'rank_2';
  if (rank === 3) return 'rank_3';
  return 'other_ranked';
}

export function getTierLabel(tierKey: CompetitionCertificateTierKey): string {
  switch (tierKey) {
    case 'rank_1':
      return '1st Place';
    case 'rank_2':
      return '2nd Place';
    case 'rank_3':
      return '3rd Place';
    default:
      return 'Other Participants';
  }
}

export function createDefaultTierConfigs(isTeamEvent: boolean): CompetitionCertificateTierConfigMap {
  const winnerTemplate = isTeamEvent
    ? 'This certificate is awarded to {name} as a member of Team {teamName}, which secured {position} in {eventName} ({roundTitle}).'
    : 'This certificate is awarded to {name} for securing {position} in {eventName} ({roundTitle}).';

  return {
    rank_1: {
      type: 'WINNER',
      position: '1st Place',
      descriptionTemplate: winnerTemplate,
      template: 'gold',
    },
    rank_2: {
      type: 'WINNER',
      position: '2nd Place',
      descriptionTemplate: winnerTemplate,
      template: 'gold',
    },
    rank_3: {
      type: 'WINNER',
      position: '3rd Place',
      descriptionTemplate: winnerTemplate,
      template: 'gold',
    },
    other_ranked: {
      type: 'PARTICIPATION',
      position: '',
      descriptionTemplate: 'This certificate is awarded for participation in {eventName} ({roundTitle}).',
      template: 'white',
    },
  };
}

export function resolveCompetitionTemplate(
  template: string,
  values: {
    name: string;
    teamName?: string;
    position?: string;
    eventName: string;
    roundTitle: string;
  },
): string {
  return template
    .replace(TEMPLATE_PLACEHOLDER_PATTERN, (_, key: string) => {
      switch (key) {
        case 'name':
          return values.name;
        case 'teamName':
          return values.teamName || '';
        case 'position':
          return values.position || '';
        case 'eventName':
          return values.eventName;
        case 'roundTitle':
          return values.roundTitle;
        default:
          return '';
      }
    })
    .replace(/\(\s*\)/g, '')
    .replace(/\s+,/g, ',')
    .replace(/\s+\./g, '.')
    .replace(/\s+\)/g, ')')
    .replace(/\(\s+/g, '(')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function aggregateCompetitionCandidates(
  rounds: CompetitionResultsSummaryRound[],
  strategy: CompetitionGenerationStrategy,
  selectedRoundIds: string[],
): CompetitionCertificateCandidate[] {
  if (strategy === 'specific_round') {
    const selectedRound = rounds.find((round) => round.roundId === selectedRoundIds[0]);
    if (!selectedRound) return [];

    const candidates: Omit<CompetitionCertificateCandidate, 'rank'>[] = [];

    for (const submission of selectedRound.submissions) {
        const members = getSubmissionMembers(submission);
        if (members.length === 0) continue;

        candidates.push({
          competitorKey: getCompetitorKey(submission),
          displayName: getDisplayName(submission),
          teamId: submission.teamId,
          teamName: submission.teamName,
          score: getComparableScore(submission.score),
          bestScore: getComparableScore(submission.score),
          earliestSubmittedAt: submission.submittedAt,
          sourceRoundId: selectedRound.roundId,
          sourceRoundTitle: selectedRound.title,
          placeholderRoundTitle: selectedRound.title,
          strategySourceLabel: selectedRound.title,
          contributingRoundIds: [selectedRound.roundId],
          contributingRoundTitles: [selectedRound.title],
          members,
        });
    }

    return assignRanks(candidates);
  }

  const selectedRounds = rounds.filter((round) => selectedRoundIds.includes(round.roundId));
  const selectedEntries = flattenSelectedEntries(rounds, selectedRoundIds);
  const groupedEntries = groupEntriesByCompetitor(selectedEntries);

  if (groupedEntries.size === 0) return [];

  const sharedAverageRoundTitle = selectedRounds.map((round) => round.title).join(', ');

  const aggregated = Array.from(groupedEntries.values()).map((entries) => {
    const bestEntry = getBestEntry(entries);
    const totalScore = entries.reduce((sum, entry) => sum + entry.score, 0);
    const averageScore = totalScore / entries.length;
    const earliestSubmittedAt = [...entries]
      .sort((left, right) => new Date(left.submittedAt).getTime() - new Date(right.submittedAt).getTime())[0]
      .submittedAt;
    const uniqueRoundIds = Array.from(new Set(entries.map((entry) => entry.roundId)));
    const uniqueRoundTitles = Array.from(new Set(entries.map((entry) => entry.roundTitle)));

    return {
      competitorKey: bestEntry.key,
      displayName: bestEntry.displayName,
      teamId: bestEntry.teamId,
      teamName: bestEntry.teamName,
      score: strategy === 'best_selected_rounds' ? bestEntry.score : averageScore,
      bestScore: bestEntry.score,
      earliestSubmittedAt,
      sourceRoundId: strategy === 'best_selected_rounds' ? bestEntry.roundId : undefined,
      sourceRoundTitle: strategy === 'best_selected_rounds' ? bestEntry.roundTitle : sharedAverageRoundTitle,
      placeholderRoundTitle: strategy === 'best_selected_rounds' ? bestEntry.roundTitle : sharedAverageRoundTitle,
      strategySourceLabel: strategy === 'best_selected_rounds'
        ? `Best result from ${bestEntry.roundTitle}`
        : `Average across ${sharedAverageRoundTitle}`,
      contributingRoundIds: uniqueRoundIds,
      contributingRoundTitles: uniqueRoundTitles,
      members: bestEntry.members,
    };
  });

  return assignRanks(aggregated);
}

export function buildCompetitionBulkRecipients(params: {
  candidates: CompetitionCertificateCandidate[];
  includedUserIds: Set<string>;
  tierConfigs: CompetitionCertificateTierConfigMap;
  eventName: string;
}): {
  previewRows: CompetitionCertificatePreviewRow[];
  recipients: CertificateBulkRecipientInput[];
} {
  const previewRows: CompetitionCertificatePreviewRow[] = [];
  const recipients: CertificateBulkRecipientInput[] = [];

  for (const candidate of params.candidates) {
    const tierKey = getTierKeyForRank(candidate.rank);
    const tierConfig = params.tierConfigs[tierKey];
    const position = tierConfig.position.trim() || null;

    for (const member of candidate.members) {
      if (!params.includedUserIds.has(member.userId)) {
        continue;
      }

      const description = resolveCompetitionTemplate(tierConfig.descriptionTemplate, {
        name: member.name,
        teamName: candidate.teamName,
        position: position || undefined,
        eventName: params.eventName,
        roundTitle: candidate.placeholderRoundTitle,
      });

      previewRows.push({
        competitorKey: candidate.competitorKey,
        userId: member.userId,
        name: member.name,
        email: member.email,
        attended: member.attended,
        teamName: candidate.teamName,
        rank: candidate.rank,
        score: candidate.score,
        certType: tierConfig.type,
        position,
        description,
        template: tierConfig.template,
        strategySource: candidate.strategySourceLabel,
        tierKey,
      });

      recipients.push({
        name: member.name,
        email: member.email,
        userId: member.userId,
        type: tierConfig.type,
        position,
        description,
        template: tierConfig.template,
        teamName: candidate.teamName || null,
      });
    }
  }

  return { previewRows, recipients };
}
