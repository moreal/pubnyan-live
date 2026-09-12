import puppeteer, { type Browser } from 'puppeteer';
import { afterEach, expect, test, vi } from 'vitest';
import { Renderer } from './renderer.ts';

afterEach(() => vi.restoreAllMocks());

test.each([false, true])('failed page initialization closes its browser and preserves the cause (cleanup fails: %s)', async cleanupFails => {
  const original = new Error('page creation failed');
  let cleanupAttempted = false;
  const browser = {
    newPage: async () => { throw original; },
    close: async () => {
      cleanupAttempted = true;
      if (cleanupFails) throw new Error('browser close failed');
    },
  } as unknown as Browser;
  vi.spyOn(puppeteer, 'launch').mockResolvedValue(browser);
  await expect(Renderer.launch()).rejects.toBe(original);
  expect(cleanupAttempted).toBe(true);
});
