// scripts/agent-loop.mjs
// Runs the Director once per backlog item until the backlog is empty, an item fails, or `max` items are done.
// Usage: npm run agent [-- <max>]   (default max: AGENT_MAX_ITEMS or 3)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../src/root.ts';
import { resolveAnthropicEnv, piBearerToken } from '../src/tools/anthropic-auth.ts';

// `flue run` loads .env itself, but the credential resolution below runs in THIS process.
const envFile = join(REPO_ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const max = Number(process.argv[2] ?? process.env.AGENT_MAX_ITEMS ?? 3);
if (!Number.isInteger(max) || max < 1) {
  console.error('usage: npm run agent -- <max items>');
  process.exit(2);
}

for (let i = 1; i <= max; i++) {
  // A dirty tree is almost always a failed earlier run: git_commit would sweep those edits into the
  // next item's commit with `git add -A`, and the Reviewer would read them as this item's diff.
  const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  if (dirty.status !== 0) {
    console.error(`[agent-loop] git status failed: ${dirty.error?.message ?? `exit ${dirty.status}`}`);
    process.exit(2);
  }
  if ((dirty.stdout ?? '').trim() !== '') {
    console.error('[agent-loop] working tree is dirty; commit, stash, or reset before running:');
    console.error(dirty.stdout.trimEnd());
    process.exit(2);
  }
  const auth = resolveAnthropicEnv(process.env, piBearerToken);
  if (auth.source === 'none') {
    console.error(
      '[agent-loop] no Anthropic credentials: set ANTHROPIC_API_KEY in .env or log in with `pi` (/login) so pi auth can mint a token',
    );
    process.exit(2);
  }
  console.log(`[agent-loop] credentials: ${auth.source}`);
  const id = `pubnyan-${Date.now()}`;
  console.log(`[agent-loop] item ${i}/${max}, conversation ${id}`);
  const r = spawnSync('npx', ['flue', 'run', 'src/agents/director.ts', '-m', 'next', '--id', id], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, ...auth.env },
    timeout: 45 * 60_000,
    killSignal: 'SIGTERM',
  });
  if (r.error || r.signal) {
    console.error(`[agent-loop] flue run failed: ${r.error?.message ?? r.signal}`);
    process.exit(1);
  }
  const reply = (r.stdout ?? '').trim();
  const last = reply.split('\n').filter(Boolean).pop() ?? '';
  console.log(`[agent-loop] director: ${last}`);
  if (r.status !== 0) {
    console.error(`[agent-loop] flue run exited ${r.status}; stopping`);
    process.exit(1);
  }
  if (/^BACKLOG EMPTY/m.test(reply)) process.exit(0);
  if (/^FAILED:/m.test(reply)) {
    console.error('[agent-loop] item failed; stopping so a human can look');
    process.exit(1);
  }
  if (!/^DONE:/m.test(reply)) {
    console.error('[agent-loop] director did not follow the reply contract; stopping');
    process.exit(1);
  }
}
console.log(`[agent-loop] reached max ${max} items`);
