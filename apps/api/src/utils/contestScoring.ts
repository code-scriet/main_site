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
