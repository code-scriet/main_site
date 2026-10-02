// Bounded-concurrency limiter (a minimal p-limit).
//
// Why this exists: the app runs on a FROZEN 5-connection Neon pool (HC #1/#3).
// Firing a large `Promise.all` of independent Prisma reads is fast, but it grabs
// EVERY pooled connection until the burst drains — so a single admin page load
// can momentarily starve latency-critical work (a live-quiz persist) behind
// vanity stats. Wrapping each read in a limiter capped BELOW the pool size keeps
// most of the parallel speedup while always leaving a connection free.
//
// Usage (heterogeneous, typed queries — destructuring preserved):
//   const limit = createConcurrencyLimiter(4);
//   const [a, b] = await Promise.all([limit(() => q1()), limit(() => q2())]);

export type ConcurrencyLimiter = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Returns a function that runs at most `maxConcurrent` tasks at once; further
 * tasks queue and start as slots free. Task order is preserved for dispatch;
 * each returned promise settles with its own task's result/error (one task
 * throwing never affects the others).
 */
export function createConcurrencyLimiter(maxConcurrent: number): ConcurrencyLimiter {
  const limit = Math.max(1, Math.floor(maxConcurrent));
  let active = 0;
  const queue: Array<() => void> = [];

  const startNext = (): void => {
    if (active >= limit) return;
    const run = queue.shift();
    if (run) run();
  };

  return function schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = (): void => {
        active += 1;
        // Defer to the task; whatever it settles to is this caller's result.
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            startNext();
          });
      };
      if (active < limit) run();
      else queue.push(run);
    });
  };
}
