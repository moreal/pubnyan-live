// scripts/agent-loop.mjs
// Runs the Director once per backlog item until the backlog is empty, an item fails, or `max` items are done.
// Usage: npm run agent [-- <max>]   (default max: AGENT_MAX_ITEMS or 3)
import { spawnSync } from 'node:child_process';

const max = Number(process.argv[2] ?? process.env.AGENT_MAX_ITEMS ?? 3);
if (!Number.isInteger(max) || max < 1) {
  console.error('usage: npm run agent -- <max items>');
  process.exit(2);
}

for (let i = 1; i <= max; i++) {
  const id = `pubnyan-${Date.now()}`;
  console.log(`[agent-loop] item ${i}/${max}, conversation ${id}`);
  const r = spawnSync('npx', ['flue', 'run', 'src/agents/director.ts', '-m', 'next', '--id', id], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
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
