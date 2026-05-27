/**
 * lib/asyncBatch.ts
 *
 * Bounded-concurrency worker pool for cron fan-out. Cron jobs iterate every
 * user/connection/battle and make per-item network calls (web-push, Google
 * Fit, DB). Doing that sequentially creeps toward the 300s function timeout as
 * the user base grows; doing it with a naive Promise.all over everyone would
 * blow Google Fit quota, the web-push services, and Prisma's small connection
 * pool. This runs at most `concurrency` workers at once.
 *
 * Never rejects: a worker throw is captured as a `rejected` settled result so
 * one bad item can't abort the whole run (callers tally failures themselves).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;

  const runner = async (): Promise<void> => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = { status: 'fulfilled', value: await worker(items[i], i) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  };

  const poolSize = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: poolSize }, runner));
  return results;
}
