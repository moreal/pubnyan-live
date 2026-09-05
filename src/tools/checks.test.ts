import { expect, test } from 'vitest';
import { summarizeCheckOutput } from './checks.ts';

test('summarizeCheckOutput keeps the lines a reader needs, failures first', () => {
  const text = ['> check', 'PASS spinner / svg: worst 0.007% at t=1s', 'noise', ' Test Files  13 passed (13)', 'src/x.ts(3,1): error TS2322: bad', 'FAIL idle / svg: worst 1.2% at t=0s'].join('\n');
  expect(summarizeCheckOutput(text)).toEqual([
    'src/x.ts(3,1): error TS2322: bad',
    'FAIL idle / svg: worst 1.2% at t=0s',
    'PASS spinner / svg: worst 0.007% at t=1s',
    ' Test Files  13 passed (13)',
  ]);
});

test('a single FAIL after 90 green lines is still the first line reported', () => {
  const lines = Array.from({ length: 90 }, (_, i) => `PASS clip${i} / svg: worst 0.001% at t=0s`);
  lines.push('FAIL idle / svg: worst 1.2% at t=0s');
  const summary = summarizeCheckOutput(lines.join('\n'));
  expect(summary[0]).toBe('FAIL idle / svg: worst 1.2% at t=0s');
  expect(summary).toHaveLength(41);
});
