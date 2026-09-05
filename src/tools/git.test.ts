import { expect, test } from 'vitest';
import { summarizeCheckOutput } from './checks.ts';
import { AGENT_BRANCH, shellQuote } from './git.ts';

test('shellQuote survives single quotes', () => {
  expect(shellQuote(`feat: it's done`)).toBe(`'feat: it'\\''s done'`);
});

test('agent branch name is fixed', () => {
  expect(AGENT_BRANCH).toBe('agent/backlog');
});

test('summarizeCheckOutput keeps the lines a reader needs', () => {
  const text = ['> check', 'PASS spinner / svg: worst 0.007% at t=1s', 'noise', ' Test Files  13 passed (13)', 'src/x.ts(3,1): error TS2322: bad', 'FAIL idle / svg: worst 1.2% at t=0s'].join('\n');
  expect(summarizeCheckOutput(text)).toEqual([
    'PASS spinner / svg: worst 0.007% at t=1s',
    ' Test Files  13 passed (13)',
    'src/x.ts(3,1): error TS2322: bad',
    'FAIL idle / svg: worst 1.2% at t=0s',
  ]);
});
