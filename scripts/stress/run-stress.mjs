// Judge stress harness — drives the REAL pipeline (runJudge → executionRouting
// lanes/admission → the real workers/executor.js chain) against simulated
// upstreams with calibrated latencies and explicit capacity assumptions.
//
//   node --import tsx scripts/stress/run-stress.mjs [--quick] [--out results.json]
//
// Time compression: latencies, arrival rates, and durations all divide by
// TIME_SCALE — queueing behavior (Little's law) is preserved, results are
// reported back in real-world units. Only the judge's absolute HTTP timeouts
// (15s/30s) and the worker's 12s upstream stall guard are NOT scaled, i.e. the
// harness is slightly LENIENT about hard timeouts; the sims fail fast rather
// than stall, so this only matters at extremes.
//
// No real requests leave the machine — see upstream-sim.mjs for why we simulate
// instead of load-testing the free public services.

import { writeFileSync } from 'node:fs';
import { startUpstreamSim } from './upstream-sim.mjs';
import { startWorkerHost } from './worker-host.mjs';

const TIME_SCALE = 3;
const QUICK = process.argv.includes('--quick');
const outIdx = process.argv.indexOf('--out');
const OUT_PATH = outIdx > -1 ? process.argv[outIdx + 1] : 'stress-results.json';

// --- boot simulated upstreams + the real worker, then the real judge ---------
const sim = await startUpstreamSim({ timeScale: TIME_SCALE });
const workerHost = await startWorkerHost({ wandboxUrl: sim.wandboxUrl, godboltBase: sim.godboltBase });

process.env.NODE_ENV = 'development'; // worker allows the dev Origin header
process.env.EXECUTOR_URL = workerHost.executorUrl;

const { runJudge } = await import('../../apps/api/src/utils/codeJudge.ts');
const { setProviderSettingOverride, executionRouter, isJudgeLaneSaturated } =
  await import('../../apps/api/src/utils/executionRouting.ts');

// --- student behavior model ---------------------------------------------------
const LANGUAGE_MIX = [
  ['CPP', 0.45],
  ['PYTHON', 0.35],
  ['JAVA', 0.15],
  ['JAVASCRIPT', 0.05],
];
const USER_CODE = {
  CPP: '#include <bits/stdc++.h>\nint main(){long long a;std::cin>>a;std::cout<<42;}\n',
  PYTHON: 'print(42)\n',
  JAVA: 'public class Main{public static void main(String[] a){System.out.println(42);}}\n',
  JAVASCRIPT: 'console.log(42);\n',
};

function pickLanguage() {
  let r = Math.random();
  for (const [lang, weight] of LANGUAGE_MIX) {
    r -= weight;
    if (r <= 0) return lang;
  }
  return 'PYTHON';
}

function buildTestCases(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `t${i + 1}`,
    input: `${i + 1}\n`,
    expectedOutput: '42',
  }));
}

// --- scenarios (rates/durations in REAL-WORLD units) --------------------------
// Rates model a contest hall: a "testrun" is a sample-test run (3 tests), a
// "submit" judges the full suite (8 tests). 120 steady ≈ every student runs
// code every ~3min and submits every ~8min; 200 peak scales that up; endburst
// models the final minutes where everyone submits.
const NOMINAL_CAPS = { wandbox: 8, godbolt: 12 };
const SCENARIOS = [
  {
    name: '120-students-steady',
    phases: [{ testrunPerMin: 40, submitPerMin: 15, sec: 180 }],
  },
  {
    name: '200-students-peak',
    phases: [{ testrunPerMin: 70, submitPerMin: 30, sec: 180 }],
  },
  {
    name: '200-students-endburst',
    phases: [
      { testrunPerMin: 30, submitPerMin: 15, sec: 90 },
      { testrunPerMin: 40, submitPerMin: 100, sec: 60 },
      { testrunPerMin: 10, submitPerMin: 20, sec: 60 },
    ],
  },
  {
    name: '200-peak-wandbox-outage-90s',
    phases: [{ testrunPerMin: 70, submitPerMin: 30, sec: 210 }],
    outage: { provider: 'wandbox', atSec: 45, forSec: 90 },
  },
  {
    name: '200-peak-pessimistic-caps',
    caps: { wandbox: 4, godbolt: 8 },
    phases: [{ testrunPerMin: 70, submitPerMin: 30, sec: 180 }],
  },
];
const MODES = ['wandbox', 'balanced'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const expDelay = (perMinReal) => {
  const perMs = (perMinReal / 60000) * TIME_SCALE; // events per scaled ms
  return -Math.log(1 - Math.random()) / perMs;
};

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function summarizeLatencies(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const scale = (v) => Math.round(v * TIME_SCALE); // back to real-world ms
  return {
    count: sorted.length,
    p50: scale(percentile(sorted, 50)),
    p95: scale(percentile(sorted, 95)),
    p99: scale(percentile(sorted, 99)),
    max: scale(sorted[sorted.length - 1] ?? 0),
  };
}

async function runScenario(scenario, mode) {
  const caps = scenario.caps ?? NOMINAL_CAPS;
  await sim.control({ reset: true, caps });
  setProviderSettingOverride(mode);
  executionRouter.reportSuccess('wandbox');
  executionRouter.reportSuccess('godbolt');

  const durationFactor = QUICK ? 0.5 : 1;
  const results = {
    scenario: scenario.name,
    mode,
    caps,
    offered: { submit: 0, testrun: 0 },
    busyRejections: { submit: 0, testrun: 0 },
    verdicts: {},
    latenciesMs: { submit: [], testrun: [] },
    peakRssMb: 0,
    peakLoopLagMs: 0,
  };

  // resource samplers
  let lastTick = Date.now();
  const sampler = setInterval(() => {
    const nowTs = Date.now();
    results.peakLoopLagMs = Math.max(results.peakLoopLagMs, nowTs - lastTick - 100);
    lastTick = nowTs;
    results.peakRssMb = Math.max(results.peakRssMb, Math.round(process.memoryUsage.rss() / 1024 / 1024));
  }, 100);

  if (scenario.outage) {
    setTimeout(() => {
      void sim.control({
        outage: {
          provider: scenario.outage.provider,
          forMs: (scenario.outage.forSec * 1000 * durationFactor) / TIME_SCALE,
        },
      });
    }, (scenario.outage.atSec * 1000 * durationFactor) / TIME_SCALE);
  }

  const pending = new Set();
  const fireOp = (lane) => {
    results.offered[lane] += 1;
    // Mirrors problemsCore's fast-fail admission: a saturated lane rejects
    // BEFORE the student's attempt/quota would be consumed.
    if (isJudgeLaneSaturated(lane)) {
      results.busyRejections[lane] += 1;
      return;
    }
    const language = pickLanguage();
    const t0 = performance.now();
    const p = runJudge({
      language,
      userCode: USER_CODE[language],
      testCases: buildTestCases(lane === 'submit' ? 8 : 3),
      timeLimitMs: 2000,
      mode: lane,
    })
      .then((r) => {
        results.latenciesMs[lane].push(performance.now() - t0);
        results.verdicts[r.verdict] = (results.verdicts[r.verdict] || 0) + 1;
      })
      .catch((err) => {
        results.verdicts.THREW = (results.verdicts.THREW || 0) + 1;
        results.lastError = String(err?.message || err);
      })
      .finally(() => pending.delete(p));
    pending.add(p);
  };

  const laneStream = async (lane, perMin, endAt) => {
    if (perMin <= 0) return;
    for (;;) {
      const wait = expDelay(perMin);
      if (Date.now() + wait > endAt) break;
      await sleep(wait);
      fireOp(lane);
    }
    await sleep(Math.max(0, endAt - Date.now()));
  };

  const startedAt = Date.now();
  for (const phase of scenario.phases) {
    const endAt = Date.now() + (phase.sec * 1000 * durationFactor) / TIME_SCALE;
    await Promise.all([
      laneStream('testrun', phase.testrunPerMin, endAt),
      laneStream('submit', phase.submitPerMin, endAt),
    ]);
  }
  const loadWindowMs = Date.now() - startedAt;

  // drain in-flight work (grace = 40 real-world seconds)
  const drainDeadline = Date.now() + (40 * 1000) / TIME_SCALE;
  while (pending.size > 0 && Date.now() < drainDeadline) await sleep(50);
  clearInterval(sampler);

  const realMinutes = (loadWindowMs * TIME_SCALE) / 60000;
  const completed = Object.entries(results.verdicts).reduce((sum, [, n]) => sum + n, 0);
  const summary = {
    scenario: scenario.name,
    mode,
    caps,
    realLoadMinutes: Number(realMinutes.toFixed(2)),
    offered: results.offered,
    completed,
    throughputPerMin: Number((completed / realMinutes).toFixed(1)),
    busyRejections: results.busyRejections,
    verdicts: results.verdicts,
    judgeErrorRate: Number((((results.verdicts.JUDGE_ERROR || 0) / Math.max(1, completed)) * 100).toFixed(2)),
    latency: {
      submit: summarizeLatencies(results.latenciesMs.submit),
      testrun: summarizeLatencies(results.latenciesMs.testrun),
    },
    stillInFlightAfterGrace: pending.size,
    peakRssMb: results.peakRssMb,
    peakLoopLagMs: results.peakLoopLagMs,
    sim: sim.stats(),
    router: executionRouter.snapshot(),
    ...(results.lastError ? { lastError: results.lastError } : {}),
  };

  // let stragglers finish before the next scenario reuses the sim counters
  while (pending.size > 0) await sleep(100);
  return summary;
}

const all = [];
for (const scenario of SCENARIOS) {
  for (const mode of MODES) {
    process.stdout.write(`\n▶ ${scenario.name} [${mode}] ...`);
    const summary = await runScenario(scenario, mode);
    all.push(summary);
    const s = summary;
    process.stdout.write(
      ` done — completed ${s.completed}/${s.offered.submit + s.offered.testrun}` +
      ` (busy ${s.busyRejections.submit + s.busyRejections.testrun}, judgeErr ${s.judgeErrorRate}%)` +
      ` submit p50/p95 ${s.latency.submit.p50}/${s.latency.submit.p95}ms` +
      ` testrun p50/p95 ${s.latency.testrun.p50}/${s.latency.testrun.p95}ms\n`,
    );
  }
}

writeFileSync(OUT_PATH, JSON.stringify({ timeScale: TIME_SCALE, quick: QUICK, generatedAt: new Date().toISOString(), runs: all }, null, 2));
console.log(`\nResults written to ${OUT_PATH}`);

await workerHost.close();
await sim.close();
process.exit(0);
