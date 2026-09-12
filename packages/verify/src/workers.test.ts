import { expect, test } from 'vitest';
import { runWorkers } from './workers.ts';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

for (const concurrency of [0, -1, 1.5, NaN, Infinity]) {
  test(`rejects invalid concurrency ${concurrency} before creating resources`, async () => {
    let created = 0;
    await expect(runWorkers([], concurrency, async () => { created++; }, async () => 0, async () => {})).rejects.toThrow('positive finite integer');
    expect(created).toBe(0);
  });
}

test('empty input creates no resources', async () => {
  let created = 0;
  expect(await runWorkers([], 2, async () => { created++; }, async () => 0, async () => {})).toEqual([]);
  expect(created).toBe(0);
});

test('bounds active work and preserves input order despite reversed completion', async () => {
  const gates = Array.from({ length: 4 }, () => deferred());
  const started = Array.from({ length: 4 }, () => deferred());
  const completed: number[] = [];
  const disposed: number[] = [];
  let created = 0, active = 0, maxActive = 0;
  const result = runWorkers([0, 1, 2, 3], 2, async () => created++, async (_resource, item, index) => {
    expect(index).toBe(item);
    maxActive = Math.max(maxActive, ++active);
    started[item]!.resolve();
    await gates[item]!.promise;
    active--;
    completed.push(item);
    return item * 10;
  }, async (resource) => { disposed.push(resource); });
  await Promise.all([started[0]!.promise, started[1]!.promise]);
  gates[1]!.resolve(); await started[2]!.promise;
  gates[2]!.resolve(); await started[3]!.promise;
  gates[3]!.resolve(); gates[0]!.resolve();
  expect(await result).toEqual([0, 10, 20, 30]);
  expect(completed.slice(0, 2)).toEqual([1, 2]);
  expect(maxActive).toBe(2);
  expect(created).toBe(2);
  expect(disposed.sort()).toEqual([0, 1]);
});

test('creates no more resources than items', async () => {
  let created = 0, disposed = 0;
  expect(await runWorkers(['one'], 8, async () => created++, async (_, item) => item, async () => { disposed++; })).toEqual(['one']);
  expect(created).toBe(1);
  expect(disposed).toBe(1);
});

test('job failure stops dispatch and drains active work before rejecting and disposing', async () => {
  const failure = new Error('job failed');
  const firstStarted = deferred(), secondStarted = deferred(), releaseSecond = deferred(), failedWorkerDisposed = deferred();
  const started: number[] = [], disposed: number[] = [];
  let created = 0, secondRunning = false, settled = false;
  const result = runWorkers([0, 1, 2, 3], 2, async () => created++, async (_resource, item) => {
    started.push(item);
    if (item === 0) { firstStarted.resolve(); await secondStarted.promise; throw failure; }
    secondRunning = true; secondStarted.resolve(); await releaseSecond.promise; secondRunning = false;
    return item;
  }, async (resource) => {
    if (resource === 1) expect(secondRunning).toBe(false);
    disposed.push(resource);
    if (resource === 0) failedWorkerDisposed.resolve();
  });
  const outcome = result.then(() => { settled = true; return undefined; }, (error: unknown) => { settled = true; return error; });
  await firstStarted.promise; await failedWorkerDisposed.promise;
  expect(settled).toBe(false);
  expect(started).toEqual([0, 1]);
  releaseSecond.resolve();
  expect(await outcome).toBe(failure);
  expect(disposed.sort()).toEqual([0, 1]);
});

test('initialization failure drains pending initialization and disposes successful resources', async () => {
  const failure = new Error('initialization failed');
  const initFailed = deferred(), releaseSuccessfulInit = deferred();
  let created = 0, ran = 0, disposed = 0, settled = false;
  const result = runWorkers([0, 1], 2, async () => {
    if (created++ === 0) { initFailed.resolve(); throw failure; }
    await releaseSuccessfulInit.promise;
    return 'resource';
  }, async () => { ran++; }, async () => { disposed++; });
  const outcome = result.catch((error: unknown) => { settled = true; return error; });
  await initFailed.promise;
  await Promise.resolve();
  expect(settled).toBe(false);
  releaseSuccessfulInit.resolve();
  expect(await outcome).toBe(failure);
  expect(ran).toBe(0);
  expect(disposed).toBe(1);
});

test('preserves original job failure when cleanup also fails, including undefined throws', async () => {
  let disposed = 0;
  const outcome = runWorkers([0], 1, async () => undefined, async () => { throw undefined; }, async () => {
    disposed++; throw new Error('cleanup failed');
  }).then(() => ({ passed: true }), (error: unknown) => ({ passed: false, error }));
  expect(await outcome).toEqual({ passed: false, error: undefined });
  expect(disposed).toBe(1);
});

test('reports cleanup failure if work succeeded', async () => {
  const failure = new Error('cleanup failed');
  await expect(runWorkers([0], 1, async () => undefined, async () => 'ok', async () => { throw failure; })).rejects.toBe(failure);
});
