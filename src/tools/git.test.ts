import { expect, test } from 'vitest';
import { AGENT_BRANCH, shellQuote } from './git.ts';

test('shellQuote survives single quotes', () => {
  expect(shellQuote(`feat: it's done`)).toBe(`'feat: it'\\''s done'`);
});

test('agent branch name is fixed', () => {
  expect(AGENT_BRANCH).toBe('agent/backlog');
});
