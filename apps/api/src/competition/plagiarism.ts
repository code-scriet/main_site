// Code-similarity heuristic for the contest plagiarism check (Phase H4). Language-agnostic
// winnowing fingerprints + Jaccard overlap. This is a DETERRENT a human reviews — it
// catches copy-paste with light edits (reformatting, comment/string changes), not
// aggressive renaming or algorithmic rewrites. Never auto-penalizes.
//
// A byte-identical JS mirror runs on the playground server (CPU offload); keep the two in
// sync — this TS copy is the unit-tested source of truth.

// Strip comments + string/char literals, lowercase, and remove ALL whitespace so the
// fingerprint is insensitive to reformatting/indentation (a common plagiarism edit).
export function normalizeCode(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')          // block comments
    .replace(/\/\/.*$/gm, ' ')                   // // line comments
    .replace(/#.*$/gm, ' ')                       // # line comments (py/sh)
    .replace(/"(?:\\.|[^"\\])*"/g, '"S"')        // double-quoted strings
    .replace(/'(?:\\.|[^'\\])*'/g, "'S'")        // single-quoted strings
    .replace(/`(?:\\.|[^`\\])*`/g, '`S`')        // template strings
    .toLowerCase()
    .replace(/\s+/g, '');
}

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h;
}

/** Winnowing fingerprint set: min k-gram hash per sliding window of size w. */
export function fingerprint(code: string, k = 5, w = 4): Set<number> {
  const norm = normalizeCode(code);
  const fps = new Set<number>();
  if (norm.length < k) {
    if (norm) fps.add(hashStr(norm));
    return fps;
  }
  const hashes: number[] = [];
  for (let i = 0; i + k <= norm.length; i += 1) hashes.push(hashStr(norm.slice(i, i + k)));
  if (hashes.length < w) {
    fps.add(Math.min(...hashes));
    return fps;
  }
  for (let i = 0; i + w <= hashes.length; i += 1) {
    let min = hashes[i];
    for (let j = 1; j < w; j += 1) if (hashes[i + j] < min) min = hashes[i + j];
    fps.add(min);
  }
  return fps;
}

export function jaccard(a: Set<number>, b: Set<number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of small) if (large.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export interface PlagiarismInput { userId: string; userName: string; code: string }
export interface PlagiarismPair { userAId: string; userAName: string; userBId: string; userBName: string; similarity: number }

/** All pairs with similarity ≥ threshold (0–1), highest first. Pair ordered by userId so
 *  the (userA,userB) key is stable. O(N²) over submissions — the offloaded heavy part. */
export function findPlagiarismPairs(subs: PlagiarismInput[], threshold = 0.8): PlagiarismPair[] {
  const fps = subs.map((s) => ({ ...s, fp: fingerprint(s.code) }));
  const pairs: PlagiarismPair[] = [];
  for (let i = 0; i < fps.length; i += 1) {
    for (let j = i + 1; j < fps.length; j += 1) {
      const sim = jaccard(fps[i].fp, fps[j].fp);
      if (sim < threshold) continue;
      const [a, b] = fps[i].userId < fps[j].userId ? [fps[i], fps[j]] : [fps[j], fps[i]];
      pairs.push({ userAId: a.userId, userAName: a.userName, userBId: b.userId, userBName: b.userName, similarity: Math.round(sim * 1000) / 1000 });
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity);
}
