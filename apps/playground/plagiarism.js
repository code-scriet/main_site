// Plain-JS mirror of apps/api/src/competition/plagiarism.ts (the unit-tested source of
// truth). Runs on the mostly-idle playground server so the O(N²) similarity compute is
// offloaded from the main API during/after a contest. Keep byte-for-byte in sync with
// the TS version's algorithm.

export function normalizeCode(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/#.*$/gm, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, '"S"')
    .replace(/'(?:\\.|[^'\\])*'/g, "'S'")
    .replace(/`(?:\\.|[^`\\])*`/g, '`S`')
    .toLowerCase()
    .replace(/\s+/g, '');
}

function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h;
}

export function fingerprint(code, k = 5, w = 4) {
  const norm = normalizeCode(code);
  const fps = new Set();
  if (norm.length < k) {
    if (norm) fps.add(hashStr(norm));
    return fps;
  }
  const hashes = [];
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

export function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of small) if (large.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function findPlagiarismPairs(subs, threshold = 0.8) {
  const fps = subs.map((s) => ({ ...s, fp: fingerprint(s.code) }));
  const pairs = [];
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
