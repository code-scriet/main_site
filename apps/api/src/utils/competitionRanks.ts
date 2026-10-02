// Standard competition ranking (1224) for competition-round submissions.
// Pure + side-effect-free so it can be unit-tested without a DB; the route layer
// (`recomputeRoundRanks`) owns the query (ordering) and the set-based write.
//
// Contract: callers pass submissions ALREADY ordered best-first — score desc, then
// earlier submission first for ties (the same `ORDER BY score DESC, submitted_at ASC`
// the query uses). Equal scores share a rank; the next distinct score jumps to
// (index + 1), so ranks gap after a tie (1,1,3,4) — this is the "1224" convention.
// `null` scores tie among themselves (`null !== null` is false), matching SQL's
// equality-of-NULLs-as-distinct caveat *not* applying here because we compare in JS.

export interface RankableSubmission {
  id: string;
  score: number | null;
}

export interface RankedSubmission {
  id: string;
  rank: number;
}

export function computeRanksFromScores(ordered: RankableSubmission[]): RankedSubmission[] {
  const ranked: RankedSubmission[] = [];
  let currentRank = 1;
  for (let index = 0; index < ordered.length; index += 1) {
    if (index > 0 && ordered[index].score !== ordered[index - 1].score) {
      currentRank = index + 1;
    }
    ranked.push({ id: ordered[index].id, rank: currentRank });
  }
  return ranked;
}
