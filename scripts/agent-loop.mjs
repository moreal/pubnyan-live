// scripts/agent-loop.mjs
// Worker loop: claims the first open backlog item, runs the Director on it, marks it done or failed,
// and repeats. Runs forever unless --max is given.
// Usage: npm run agent [-- --max N] [--poll 5m] [--no-worktree]
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { runLoop } from '../src/loop/run.ts';
import { REPO_ROOT } from '../src/root.ts';

const envFile = join(REPO_ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { values, positionals } = parseArgs({
  options: {
    max: { type: 'string' },
    poll: { type: 'string' },
    'no-worktree': { type: 'boolean', default: false },
  },
  allowPositionals: true,
});

// Legacy form: `npm run agent -- 3`
const maxRaw = values.max ?? positionals[0] ?? process.env.AGENT_MAX_ITEMS ?? null;
const max = maxRaw === null ? null : Number(maxRaw);
if (max !== null && (!Number.isInteger(max) || max < 0)) {
  console.error('usage: npm run agent [-- --max N] [--poll 5m] [--no-worktree]');
  process.exit(2);
}

function parseDuration(s) {
  const m = /^(\d+)(ms|s|m|h)?$/.exec(s);
  if (!m) throw new Error(`bad duration: ${s}`);
  return Number(m[1]) * ({ ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[m[2] ?? 'ms']);
}
let pollMs;
try {
  pollMs = values.poll ? parseDuration(values.poll) : Number(process.env.AGENT_POLL_MS ?? 5 * 60_000);
} catch (err) {
  console.error(`usage: npm run agent [-- --max N] [--poll 5m] [--no-worktree]\n${err.message}`);
  process.exit(2);
}
const useWorktree = !values['no-worktree'] && !process.env.CI;

const ac = new AbortController();
process.on('SIGINT', () => {
  console.error('[agent-loop] stopping after the current step');
  ac.abort();
});

try {
  const r = await runLoop({
    repoRoot: REPO_ROOT,
    useWorktree,
    max,
    pollMs,
    directorTimeoutMs: 45 * 60_000,
    maxConsecutiveFailures: 3,
    signal: ac.signal,
  });
  console.log(`[agent-loop] ${r.reason}; completed ${r.completed}, failed ${r.failed}`);
  process.exit(r.reason.startsWith('reached max') || r.reason === 'stopped' ? 0 : 1);
} catch (err) {
  console.error(`[agent-loop] error: ${err.message}`);
  process.exit(1);
}
