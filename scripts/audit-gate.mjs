#!/usr/bin/env node
// CI security gate for PRODUCTION dependencies.
//
// Replaces a bare `npm audit --omit=dev --audit-level=high`, which is all-or-nothing:
// the moment one unfixable-but-inapplicable advisory lands, the only options are to
// disable the gate (`|| true`) or to take a risky dependency jump. Both are bad — the
// first silently stops protecting us, the second churns prod to fix a non-issue.
//
// Instead: every HIGH/CRITICAL advisory in production deps fails the build UNLESS its
// GHSA id is listed below with a written justification and a review date. Anything new,
// or anything whose id isn't listed, still fails loudly. Moderate/low are reported only
// (same threshold the previous gate used).
//
// Reviewing an entry means confirming the vulnerable code path is genuinely unreachable
// in this app — not merely that it's inconvenient to upgrade. Re-check on dependency
// bumps and delete the entry the moment a real fix is installable.

import { execSync } from 'node:child_process';

/** GHSA id → why it cannot affect this app. Keep short, factual, and dated. */
const REVIEWED_EXCEPTIONS = {
  'GHSA-qwww-vcr4-c8h2': {
    package: 'react-router / react-router-dom',
    title: 'RSC Mode CSRF Bypass Allows Action Execution Before 400 Response',
    reason:
      'Requires React Router RSC (React Server Components) mode / server actions. Both apps/web and '
      + 'apps/playground are client-only SPAs: they import react-router-dom for BrowserRouter/Routes/Link '
      + 'and ship no server runtime, no createStaticHandler, and no @react-router/server|node|dev package — '
      + 'so the vulnerable request path does not exist here. No fix exists in the 7.x line (patched in 8.3.0); '
      + "npm's suggested 'fix' is a DOWNGRADE to 7.11.0, which would drop unrelated fixes.",
    reviewed: '2026-08-05',
    removeWhen: 'Migrating to react-router 8.3+, or a 7.x backport ships.',
  },
};

const raw = (() => {
  try {
    // npm audit exits non-zero whenever vulnerabilities exist — capture output either way.
    return execSync('npm audit --omit=dev --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (error) {
    if (error.stdout) return error.stdout;
    console.error('audit-gate: could not run `npm audit`:', error.message);
    process.exit(1);
  }
})();

let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error('audit-gate: could not parse `npm audit --json` output.');
  process.exit(1);
}

// A gate that fails OPEN is worse than no gate. When `npm audit` cannot reach
// the registry (offline runner, rate limit, EAUDITNOPJSON) it still exits with
// valid JSON — but it is `{"error":{...}}`, with no `vulnerabilities` key. The
// scan loop below would then iterate zero times, find nothing unreviewed, and
// print PASS while a CRITICAL advisory sailed through. Refuse anything that
// isn't a real audit report.
if (report && typeof report === 'object' && report.error) {
  const { code, summary, detail } = report.error;
  console.error(`audit-gate: \`npm audit\` failed (${code ?? 'unknown'}): ${summary ?? detail ?? 'no detail'}`);
  console.error('audit-gate: FAIL — refusing to pass without a completed audit.');
  process.exit(1);
}

if (
  !report
  || typeof report !== 'object'
  || typeof report.vulnerabilities !== 'object'
  || report.vulnerabilities === null
  || typeof report.metadata !== 'object'
  || report.metadata === null
) {
  console.error('audit-gate: `npm audit --json` returned no vulnerability report (unrecognised shape).');
  console.error('audit-gate: FAIL — refusing to pass without a completed audit.');
  process.exit(1);
}

const BLOCKING = new Set(['high', 'critical']);
const blocking = new Map(); // GHSA id → { id, title, severity, packages:Set }
const counts = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };

for (const [pkg, vuln] of Object.entries(report.vulnerabilities)) {
  counts[vuln.severity] = (counts[vuln.severity] ?? 0) + 1;
  for (const via of vuln.via ?? []) {
    // String `via` entries are transitive pointers to another package, not advisories.
    if (typeof via !== 'object' || !BLOCKING.has(via.severity)) continue;
    const id = String(via.url ?? '').split('/').pop() || via.source || via.title;
    if (!blocking.has(id)) {
      blocking.set(id, { id, title: via.title, severity: via.severity, packages: new Set() });
    }
    blocking.get(id).packages.add(pkg);
  }
}

const unreviewed = [...blocking.values()].filter((a) => !REVIEWED_EXCEPTIONS[a.id]);
const excepted = [...blocking.values()].filter((a) => REVIEWED_EXCEPTIONS[a.id]);

console.log(
  `audit-gate: production deps — ${counts.critical ?? 0} critical, ${counts.high ?? 0} high, `
  + `${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low`,
);

for (const advisory of excepted) {
  const note = REVIEWED_EXCEPTIONS[advisory.id];
  console.log(`\n  ALLOWED (reviewed ${note.reviewed}) ${advisory.id} — ${advisory.title}`);
  console.log(`    packages: ${[...advisory.packages].join(', ')}`);
  console.log(`    why it cannot apply here: ${note.reason}`);
  console.log(`    remove when: ${note.removeWhen}`);
}

if (unreviewed.length > 0) {
  console.error(`\naudit-gate: FAILED — ${unreviewed.length} unreviewed high/critical advisory(ies) in production deps:`);
  for (const advisory of unreviewed) {
    console.error(`  ${advisory.severity.toUpperCase()} ${advisory.id} — ${advisory.title}`);
    console.error(`    packages: ${[...advisory.packages].join(', ')}`);
    console.error('    https://github.com/advisories/' + advisory.id);
  }
  console.error('\nFix it (`npm audit fix`, or bump the dependency). If — and only if — the vulnerable');
  console.error('code path genuinely cannot be reached from this app, add the GHSA id to');
  console.error('REVIEWED_EXCEPTIONS in scripts/audit-gate.mjs with a written justification.');
  process.exit(1);
}

console.log('\naudit-gate: PASS — no unreviewed high/critical advisories in production dependencies.');
