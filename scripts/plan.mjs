// scripts/plan.mjs
// Talk to the Planner. Usage: npm run plan -- <topic> "<message>"
// The topic names the conversation; reuse it to continue.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../src/root.ts';
import { piBearerToken, resolveAnthropicEnv } from '../src/tools/anthropic-auth.ts';

const envFile = join(REPO_ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const [topic, ...rest] = process.argv.slice(2);
const message = rest.join(' ').trim();
if (!topic || !message) {
  console.error('usage: npm run plan -- <topic> "<message>"');
  process.exit(2);
}
const auth = resolveAnthropicEnv(process.env, piBearerToken);
if (auth.source === 'none') {
  console.error('[plan] no Anthropic credentials: set ANTHROPIC_API_KEY in .env or log in with `pi`');
  process.exit(2);
}
const r = spawnSync('npx', ['flue', 'run', 'src/agents/planner.ts', '--id', `plan-${topic}`, '-m', message], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  env: { ...process.env, ...auth.env },
});
process.exit(r.status ?? 1);
