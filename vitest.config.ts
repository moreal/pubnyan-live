import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'motion/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
