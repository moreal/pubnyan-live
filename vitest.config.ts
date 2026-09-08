import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'motion/**/*.test.ts', 'src/**/*.test.ts'],
    // The SVG integration test renders every key and midpoint across all clips.
    // Overlapping head/ear acting adds samples; preserve full visual coverage.
    testTimeout: 180_000,
    hookTimeout: 30_000,
  },
});
