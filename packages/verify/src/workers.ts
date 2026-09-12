/** Run independent jobs with one exclusive resource per worker and ordered results.
 * After any failure, active jobs and resource creation finish before rejection.
 * The first observed failure wins, including when subsequent cleanup fails.
 */
export async function runWorkers<T, R, O>(
  items: readonly T[],
  concurrency: number,
  createResource: () => Promise<R>,
  run: (resource: R, item: T, index: number) => Promise<O>,
  dispose: (resource: R) => Promise<void>,
): Promise<O[]> {
  if (!Number.isFinite(concurrency) || !Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('worker concurrency must be a positive finite integer');
  }
  const results: O[] = new Array(items.length);
  let next = 0;
  let failed = false;
  let firstError: unknown;
  const fail = (error: unknown) => {
    if (!failed) {
      failed = true;
      firstError = error;
    }
  };
  const worker = async () => {
    let resource: R;
    try {
      resource = await createResource();
    } catch (error) {
      fail(error);
      return;
    }
    try {
      while (!failed && next < items.length) {
        // No await between checking the shared cursor and claiming this index.
        const index = next++;
        results[index] = await run(resource, items[index]!, index);
      }
    } catch (error) {
      fail(error);
    } finally {
      try {
        await dispose(resource);
      } catch (error) {
        fail(error);
      }
    }
  };
  // Workers catch their own failures, so every resource is settled before returning.
  await Promise.all(Array.from({ length: Math.min(items.length, concurrency) }, worker));
  if (failed) throw firstError;
  return results;
}
