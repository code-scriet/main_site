// Dual-provider execution routing for the code judge.
//
// Why: Wandbox and godbolt are both free services with no SLA. Historically the
// judge sent EVERY execution to one admin-chosen primary and relied on the CF
// Worker to fall back on an infra failure — which serializes the whole contest
// load onto one upstream while the other host sits idle.
//
// This module makes the judge provider-aware:
//  - `Settings.codeExecutionProvider = 'balanced'` splits traffic across BOTH
//    upstreams: least-loaded pick per request, round-robin on ties. JavaScript
//    always routes to Wandbox (godbolt has no JS runtime).
//  - Each provider gets its OWN concurrency lane per mode (submit/testrun), so
//    in balanced mode capacity ADDS instead of sharing one global semaphore.
//  - A provider that infra-fails goes on a short cooldown so new requests
//    prefer the healthy host; the CF Worker's per-request fallback chain stays
//    the last-resort safety net underneath.
//  - Bounded admission: when a lane's total queue passes its cap, callers fail
//    fast (503 "judge busy") BEFORE consuming the student's attempt/quota,
//    instead of piling unbounded waiters onto the semaphore.
//
// Memory: O(1) — a handful of counters per provider, no per-user state (HC #1).

import type { ProblemLanguage } from '@prisma/client';
import { getCachedSettings } from './settingsCache.js';

export type ExecutionProvider = 'wandbox' | 'godbolt';
export type ExecutionProviderSetting = ExecutionProvider | 'balanced';
export type JudgeLane = 'submit' | 'testrun';

export const EXECUTION_PROVIDERS: readonly ExecutionProvider[] = ['wandbox', 'godbolt'];

export function normalizeProviderSetting(value: unknown): ExecutionProviderSetting {
  return value === 'godbolt' || value === 'balanced' ? value : 'wandbox';
}

/** godbolt (Compiler Explorer) compiles but cannot EXECUTE JavaScript/Node. */
export function providerSupportsLanguage(provider: ExecutionProvider, language: ProblemLanguage): boolean {
  if (provider === 'godbolt') return language !== 'JAVASCRIPT';
  return true;
}

interface LaneState {
  active: number;
  queue: Array<() => void>;
}

interface ProviderState {
  cooldownUntil: number;
  lanes: Record<JudgeLane, LaneState>;
}

export interface ExecutionRouterOptions {
  /** Max concurrent executions per provider, per lane. */
  submitConcurrency?: number;
  testrunConcurrency?: number;
  /** Max TOTAL waiters (across providers) a lane accepts before admission fails fast. */
  submitQueueCap?: number;
  testrunQueueCap?: number;
  /** How long an infra-failing provider is depriorotized before being retried. */
  cooldownMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export interface ExecutionRouterSnapshot {
  providers: Record<ExecutionProvider, {
    coolingDown: boolean;
    lanes: Record<JudgeLane, { active: number; waiting: number }>;
  }>;
}

export interface ExecutionRouter {
  chooseProvider(setting: ExecutionProviderSetting, language: ProblemLanguage, lane: JudgeLane): ExecutionProvider;
  /** Waits for a slot in the provider's lane; resolves to an idempotent release fn. */
  acquire(provider: ExecutionProvider, lane: JudgeLane): Promise<() => void>;
  /** True when the lane's combined queue is past its cap — callers should 503 fast. */
  isLaneSaturated(lane: JudgeLane): boolean;
  reportInfraFailure(provider: ExecutionProvider): void;
  reportSuccess(provider: ExecutionProvider): void;
  snapshot(): ExecutionRouterSnapshot;
}

const DEFAULT_COOLDOWN_MS = 45_000;
const DEFAULT_SUBMIT_QUEUE_CAP = 80;
const DEFAULT_TESTRUN_QUEUE_CAP = 120;

export function createExecutionRouter(opts: ExecutionRouterOptions = {}): ExecutionRouter {
  const now = opts.now ?? Date.now;
  const cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const laneLimits: Record<JudgeLane, number> = {
    submit: Math.max(1, opts.submitConcurrency ?? 5),
    testrun: Math.max(1, opts.testrunConcurrency ?? 10),
  };
  const queueCaps: Record<JudgeLane, number> = {
    submit: Math.max(1, opts.submitQueueCap ?? DEFAULT_SUBMIT_QUEUE_CAP),
    testrun: Math.max(1, opts.testrunQueueCap ?? DEFAULT_TESTRUN_QUEUE_CAP),
  };

  const providers: Record<ExecutionProvider, ProviderState> = {
    wandbox: { cooldownUntil: 0, lanes: { submit: { active: 0, queue: [] }, testrun: { active: 0, queue: [] } } },
    godbolt: { cooldownUntil: 0, lanes: { submit: { active: 0, queue: [] }, testrun: { active: 0, queue: [] } } },
  };
  // Tie-breaker for equally-loaded healthy providers — alternates so a quiet
  // period doesn't pin everything to one host.
  let rrToggle = 0;

  const isHealthy = (p: ExecutionProvider): boolean => providers[p].cooldownUntil <= now();
  const laneLoad = (p: ExecutionProvider, lane: JudgeLane): number => {
    const l = providers[p].lanes[lane];
    return l.active + l.queue.length;
  };

  const chooseProvider = (
    setting: ExecutionProviderSetting,
    language: ProblemLanguage,
    lane: JudgeLane,
  ): ExecutionProvider => {
    const candidates = EXECUTION_PROVIDERS.filter((p) => providerSupportsLanguage(p, language));
    if (candidates.length === 1) return candidates[0];

    if (setting !== 'balanced') {
      // Fixed primary. If it's cooling down and the other host is healthy,
      // pre-route there — same semantics the CF Worker's fallback would apply,
      // just without burning the 12s upstream stall first.
      const other: ExecutionProvider = setting === 'wandbox' ? 'godbolt' : 'wandbox';
      if (!isHealthy(setting) && isHealthy(other)) return other;
      return setting;
    }

    const healthy = candidates.filter(isHealthy);
    const pool = healthy.length > 0 ? healthy : candidates;
    if (pool.length === 1) return pool[0];

    const [a, b] = pool;
    const loadA = laneLoad(a, lane);
    const loadB = laneLoad(b, lane);
    if (loadA !== loadB) return loadA < loadB ? a : b;
    rrToggle ^= 1;
    return pool[rrToggle];
  };

  const acquire = (provider: ExecutionProvider, lane: JudgeLane): Promise<() => void> => {
    const state = providers[provider].lanes[lane];
    const grant = (): (() => void) => {
      state.active += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        state.active -= 1;
        const next = state.queue.shift();
        if (next) next();
      };
    };

    if (state.active < laneLimits[lane]) {
      return Promise.resolve(grant());
    }
    return new Promise<() => void>((resolve) => {
      state.queue.push(() => resolve(grant()));
    });
  };

  const isLaneSaturated = (lane: JudgeLane): boolean => {
    const waiting = EXECUTION_PROVIDERS.reduce((sum, p) => sum + providers[p].lanes[lane].queue.length, 0);
    return waiting >= queueCaps[lane];
  };

  return {
    chooseProvider,
    acquire,
    isLaneSaturated,
    reportInfraFailure(provider) {
      providers[provider].cooldownUntil = now() + cooldownMs;
    },
    reportSuccess(provider) {
      providers[provider].cooldownUntil = 0;
    },
    snapshot() {
      const shape = (p: ExecutionProvider) => ({
        coolingDown: !isHealthy(p),
        lanes: {
          submit: { active: providers[p].lanes.submit.active, waiting: providers[p].lanes.submit.queue.length },
          testrun: { active: providers[p].lanes.testrun.active, waiting: providers[p].lanes.testrun.queue.length },
        },
      });
      return { providers: { wandbox: shape('wandbox'), godbolt: shape('godbolt') } };
    },
  };
}

function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Process-wide router used by the real judge path. Concurrency is PER PROVIDER,
// so the defaults keep today's per-upstream pressure (5 submit / 10 testrun)
// while balanced mode doubles the platform total.
export const executionRouter = createExecutionRouter({
  submitConcurrency: envInt('JUDGE_SUBMIT_CONCURRENCY', 5),
  testrunConcurrency: envInt('JUDGE_TESTRUN_CONCURRENCY', 10),
});

/** Fast-fail admission check for the problems submit/testrun routes. */
export function isJudgeLaneSaturated(lane: JudgeLane): boolean {
  return executionRouter.isLaneSaturated(lane);
}

// ---------------------------------------------------------------------------
// Configured provider setting (Settings.codeExecutionProvider, 5-min cache)
// ---------------------------------------------------------------------------

let providerSettingOverride: ExecutionProviderSetting | null = null;

/**
 * Test/stress-harness seam ONLY: forces the provider setting without a DB read.
 * Never call from production code paths — the admin setting is the source of truth.
 */
export function setProviderSettingOverride(value: ExecutionProviderSetting | null): void {
  providerSettingOverride = value;
}

export async function getConfiguredProviderSetting(): Promise<ExecutionProviderSetting> {
  if (providerSettingOverride) return providerSettingOverride;
  const fromSettings = (await getCachedSettings())?.codeExecutionProvider;
  return normalizeProviderSetting(fromSettings || process.env.CODE_EXECUTION_PROVIDER);
}
