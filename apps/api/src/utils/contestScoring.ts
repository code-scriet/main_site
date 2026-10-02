// Contest scoring engine (Phase A redesign) — pure, unit-tested. The HTTP/query
// layer (routes/competition.ts) reads the per-problem stored CONTEST score and the
// round/problem raw weights, then calls these to derive the normalized 0–100 round
// and event-final scores + the ICPC penalty. Keeping it pure means weights can be
// retuned in admin config and recomputed at read time without any rejudge.
//
// Scoring hierarchy (each level capped at 100):
//   problem  → private-test pass % (stored at submit; computed in problemsCore)
//   round    → Σ(problem% × normalized problem weight)
//   final    → Σ(round% × normalized round weight)

const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp100 = (n: number): number => Math.max(0, Math.min(100, n));

/**
 * Normalize raw weights so they sum to 1. Falls back to an equal split when every
 * weight is ≤ 0 (a misconfigured round still scores fairly) and to an empty array
 * when there are no items.
 */
export function normalizeWeights(weights: number[]): number[] {
  if (weights.length === 0) return [];
  const safe = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const total = safe.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return weights.map(() => 1 / weights.length);
  return safe.map((w) => w / total);
}

export interface WeightedComponent {
  /** Raw weight (e.g. CompetitionRoundProblem.points, or CompetitionRound.finalWeight). */
  weight: number;
  /** This component's own 0–100 score (problem private-% or round score). */
  score: number;
}

/**
 * Weighted, normalized aggregate of components into a single 0–100 score. Used for
 * both round-score (problems → round) and event-final (rounds → final). Components
 * with a non-positive raw weight still participate via the equal-split fallback when
 * the whole set sums to zero. Returns 0 for an empty set.
 */
export function aggregateWeighted(components: WeightedComponent[]): number {
  if (components.length === 0) return 0;
  const norm = normalizeWeights(components.map((c) => c.weight));
  const total = components.reduce((sum, c, i) => sum + clamp100(c.score) * norm[i], 0);
  return round2(clamp100(total));
}

export interface SolvedProblemPenalty {
  /** Non-accepted judged attempts before the first AC on this problem. */
  wrongAttempts: number;
  /** Whole minutes from round start to the first AC on this problem. */
  minutesToSolve: number;
}

/**
 * ICPC-style penalty: for each SOLVED problem, (wrong attempts × penaltyPerWrong) +
 * minutes-to-solve. Unsolved problems contribute nothing (standard ICPC). Lower is
 * better; used as the tie-break after score in ICPC rounds.
 */
export function computeIcpcPenalty(solved: SolvedProblemPenalty[], penaltyPerWrong = 20): number {
  return solved.reduce(
    (total, p) => total + Math.max(0, p.wrongAttempts) * penaltyPerWrong + Math.max(0, p.minutesToSolve),
    0,
  );
}

export interface RankableEntry {
  /** 0–100 aggregate score (round or final). */
  score: number;
  /** ICPC penalty (ignored for BEST_SCORE). */
  penalty: number;
  /** Earliest meaningful submission time (ms) — BEST_SCORE tie-break. */
  earliestMs: number;
}

/**
 * Standard 1224 ranking for contest entries. BEST_SCORE: score desc, then earliest
 * submission. ICPC: score desc, then penalty asc, then earliest submission. Equal
 * keys share a rank. Returns ranks aligned to the input order.
 */
export interface DsaLbProblemLink { problemId: string; points: number; problem: { title: string } }
export interface DsaLbSubmission {
  problemId: string; userId: string; score: number; verdict: string; runtimeMs: number | null;
  contestWrongAttempts: number; contestSolvedAt: Date | null;
  user: { id: string; name: string; avatar: string | null };
}

export type TeamAggregationMode = 'BEST_PER_PROBLEM' | 'AVERAGE' | 'BEST_MEMBER';

/** Team grouping for a team event: how to fold members + which team each user is in. */
export interface TeamLeaderboardOptions {
  aggregation: TeamAggregationMode;
  teamByUser: Map<string, { teamId: string; teamName: string }>;
}

export interface DsaLeaderboardRow {
  rank: number;
  /** userId for solo rows, teamId for team rows. */
  userId: string;
  /** userName for solo rows, teamName for team rows. */
  userName: string;
  avatar: string | null;
  totalScore: number;
  penalty: number;
  totalRuntimeMs: number;
  /** Present on team rows: member display names. */
  members?: string[];
  /** True when this row represents a team (team event). */
  isTeam?: boolean;
  problems: Array<{ problemId: string; title: string; score: number; weightedScore: number; verdict: string; runtimeMs: number | null }>;
}

interface ScoreCell { score: number; verdict: string; runtimeMs: number | null; wrongAttempts: number; solvedAt: Date | null }
interface DerivedEntry { totalScore: number; penalty: number; completionMs: number; totalRuntimeMs: number; problems: DsaLeaderboardRow['problems'] }

// Derive a normalized round score + ICPC penalty + per-problem breakdown from one
// entity's per-problem cells (used for a solo user and for a synthesized team).
function deriveEntry(
  links: DsaLbProblemLink[],
  weightByProblem: Map<string, number>,
  cells: Map<string, ScoreCell>,
  startedMs: number | null,
): DerivedEntry {
  const totalScore = aggregateWeighted(links.map((link) => ({ weight: link.points, score: cells.get(link.problemId)?.score ?? 0 })));
  const solved: SolvedProblemPenalty[] = [];
  let completionMs = startedMs ?? 0;
  let totalRuntimeMs = 0;
  for (const link of links) {
    const cell = cells.get(link.problemId);
    if (!cell) continue;
    totalRuntimeMs += cell.runtimeMs ?? 0;
    if (cell.verdict === 'ACCEPTED' && cell.solvedAt) {
      const minutesToSolve = startedMs ? Math.max(0, Math.floor((cell.solvedAt.getTime() - startedMs) / 60000)) : 0;
      solved.push({ wrongAttempts: cell.wrongAttempts, minutesToSolve });
      completionMs = Math.max(completionMs, cell.solvedAt.getTime());
    }
  }
  const problems = links
    .filter((link) => cells.has(link.problemId))
    .map((link) => {
      const cell = cells.get(link.problemId)!;
      return {
        problemId: link.problemId,
        title: link.problem.title,
        score: cell.score,
        weightedScore: Math.round(cell.score * (weightByProblem.get(link.problemId) ?? 0) * 100) / 100,
        verdict: cell.verdict,
        runtimeMs: cell.runtimeMs,
      };
    });
  return { totalScore, penalty: computeIcpcPenalty(solved), completionMs, totalRuntimeMs, problems };
}

// Shared DSA leaderboard builder. Computes each participant's normalized 0–100 round
// score (Σ best% × normalized problem weight), ICPC penalty, and 1224 rank under the
// round's penalty model. Used by GET /results (FINISHED, top 10), GET /leaderboard
// (live), the admin monitor, and the realtime broadcaster — single source of truth.
export function buildDsaLeaderboard(
  links: DsaLbProblemLink[],
  submissions: DsaLbSubmission[],
  startedMs: number | null,
  penaltyModel: 'BEST_SCORE' | 'ICPC',
  limit: number,
  team?: TeamLeaderboardOptions,
): DsaLeaderboardRow[] {
  const normWeights = normalizeWeights(links.map((link) => link.points));
  const weightByProblem = new Map(links.map((link, i) => [link.problemId, normWeights[i]]));

  // Per-user cells (one entry per submitter).
  type UserEntry = { userId: string; userName: string; avatar: string | null; cells: Map<string, ScoreCell> };
  const byUser = new Map<string, UserEntry>();
  for (const submission of submissions) {
    if (!weightByProblem.has(submission.problemId)) continue;
    const entry = byUser.get(submission.userId) ?? {
      userId: submission.userId, userName: submission.user.name, avatar: submission.user.avatar, cells: new Map<string, ScoreCell>(),
    };
    entry.cells.set(submission.problemId, {
      score: submission.score, verdict: submission.verdict, runtimeMs: submission.runtimeMs,
      wrongAttempts: submission.contestWrongAttempts, solvedAt: submission.contestSolvedAt,
    });
    byUser.set(submission.userId, entry);
  }

  type Computed = { id: string; name: string; avatar: string | null; members?: string[]; isTeam?: boolean } & DerivedEntry;
  let computed: Computed[];

  if (!team) {
    // Solo: one row per user.
    computed = Array.from(byUser.values()).map((u) => ({
      id: u.userId, name: u.userName, avatar: u.avatar, ...deriveEntry(links, weightByProblem, u.cells, startedMs),
    }));
  } else {
    // Team: group submitters by team, fold members per the chosen aggregation.
    const teams = new Map<string, { teamName: string; members: UserEntry[] }>();
    for (const u of byUser.values()) {
      const t = team.teamByUser.get(u.userId);
      if (!t) continue; // a submitter not on a team (shouldn't happen for team events) is skipped
      const bucket = teams.get(t.teamId) ?? { teamName: t.teamName, members: [] as UserEntry[] };
      bucket.members.push(u);
      teams.set(t.teamId, bucket);
    }
    computed = Array.from(teams.entries()).map(([teamId, bucket]) => {
      const memberNames = bucket.members.map((m) => m.userName);
      const memberDerived = bucket.members.map((m) => deriveEntry(links, weightByProblem, m.cells, startedMs));

      if (team.aggregation === 'BEST_MEMBER') {
        // The single best member carries the team (score desc, then penalty, then earliest).
        let best = memberDerived[0];
        for (const d of memberDerived) {
          if (d.totalScore > best.totalScore
            || (d.totalScore === best.totalScore && d.penalty < best.penalty)
            || (d.totalScore === best.totalScore && d.penalty === best.penalty && d.completionMs < best.completionMs)) best = d;
        }
        return { id: teamId, name: bucket.teamName, avatar: null, isTeam: true, members: memberNames, ...best };
      }

      // BEST_PER_PROBLEM + AVERAGE both synthesize team cells from members; the per-problem
      // cell is the best member's cell on that problem (highest score, tie → earliest solve).
      const teamCells = new Map<string, ScoreCell>();
      for (const link of links) {
        let pick: ScoreCell | null = null;
        for (const m of bucket.members) {
          const c = m.cells.get(link.problemId);
          if (!c) continue;
          if (!pick || c.score > pick.score
            || (c.score === pick.score && (c.solvedAt?.getTime() ?? Infinity) < (pick.solvedAt?.getTime() ?? Infinity))) pick = c;
        }
        if (pick) teamCells.set(link.problemId, pick);
      }
      const derived = deriveEntry(links, weightByProblem, teamCells, startedMs);
      if (team.aggregation === 'AVERAGE') {
        // Round score = mean of members' round scores; penalty = mean; keep the
        // best-per-problem breakdown + completion for display/tie-break.
        const avgScore = memberDerived.length ? memberDerived.reduce((s, d) => s + d.totalScore, 0) / memberDerived.length : 0;
        const avgPenalty = memberDerived.length ? Math.round(memberDerived.reduce((s, d) => s + d.penalty, 0) / memberDerived.length) : 0;
        return { id: teamId, name: bucket.teamName, avatar: null, isTeam: true, members: memberNames, ...derived, totalScore: Math.round(Math.min(100, avgScore) * 100) / 100, penalty: avgPenalty };
      }
      return { id: teamId, name: bucket.teamName, avatar: null, isTeam: true, members: memberNames, ...derived };
    });
  }

  const ranks = rankEntries(
    computed.map((c) => ({ score: c.totalScore, penalty: c.penalty, earliestMs: c.completionMs })),
    penaltyModel,
  );
  return computed
    .map((c, index) => ({ rank: ranks[index], ...c }))
    .sort((a, b) => (a.rank - b.rank) || (a.completionMs - b.completionMs))
    .slice(0, limit)
    .map(({ completionMs: _completionMs, id, name, ...rest }) => ({
      rank: rest.rank,
      userId: id,
      userName: name,
      avatar: rest.avatar,
      totalScore: rest.totalScore,
      penalty: rest.penalty,
      totalRuntimeMs: rest.totalRuntimeMs,
      ...(rest.members ? { members: rest.members } : {}),
      ...(rest.isTeam ? { isTeam: true } : {}),
      problems: rest.problems,
    }));
}

export function rankEntries(
  entries: RankableEntry[],
  model: 'BEST_SCORE' | 'ICPC',
): number[] {
  const cmp = (a: RankableEntry, b: RankableEntry): number => {
    if (a.score !== b.score) return b.score - a.score;
    if (model === 'ICPC' && a.penalty !== b.penalty) return a.penalty - b.penalty;
    return a.earliestMs - b.earliestMs;
  };
  const tie = (a: RankableEntry, b: RankableEntry): boolean =>
    a.score === b.score && (model !== 'ICPC' || a.penalty === b.penalty);

  const order = entries.map((entry, index) => ({ entry, index })).sort((x, y) => cmp(x.entry, y.entry));
  const ranks = new Array<number>(entries.length).fill(0);
  let currentRank = 1;
  order.forEach((item, i) => {
    if (i > 0 && !tie(item.entry, order[i - 1].entry)) currentRank = i + 1;
    ranks[item.index] = currentRank;
  });
  return ranks;
}
