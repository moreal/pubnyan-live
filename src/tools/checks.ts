import { defineTool } from '@flue/runtime';
import { REPO_ROOT } from '../root.ts';
import { computeTreeHash, writeCachedTreeHash } from './tree-hash.ts';

const INTERESTING = /^(PASS|FAIL|\s*(Test Files|Tests)|.*error TS\d+|\s*(✓|×|✗|FAIL) |Error:)/;
/** The subset that says something went wrong. */
const FAILURE = /^(FAIL|.*error TS\d+|\s*(×|✗|FAIL) |Error:)/;

/**
 * The lines a reader needs from a `npm run check` transcript, failures first: parity prints one line
 * per clip per target, so a single FAIL at the end of a long green run must not be cut off.
 */
export function summarizeCheckOutput(text: string): string[] {
  const lines = text.split('\n').map((l) => l.trimEnd()).filter((l) => INTERESTING.test(l));
  const failures = lines.filter((l) => FAILURE.test(l));
  const rest = lines.filter((l) => !FAILURE.test(l));
  return [...failures.slice(0, 40), ...rest.slice(0, 40)];
}

export const runChecks = defineTool({
  name: 'run_checks',
  description: 'Run the full check suite (npm run check: type check, unit tests, pixel parity for every clip). Returns ok, the exit code, the PASS/FAIL summary lines (failures first), and the last lines of output. Contact sheets are written to dist/verify/<clip>-contact.png for you to look at.',
  harness: true,
  async run({ harness }) {
    const sh = (cmd: string, timeoutMs = 60_000) => harness.sandbox.exec(cmd, { cwd: REPO_ROOT, timeoutMs });
    const r = await sh('npm run check', 900_000);
    const text = `${r.stdout}\n${r.stderr}`;
    if (r.exitCode === 0) {
      // Record the tree this run verified so git_commit can skip a redundant re-run.
      await writeCachedTreeHash(await computeTreeHash(sh));
    }
    return { output: { ok: r.exitCode === 0, exitCode: r.exitCode, summary: summarizeCheckOutput(text), tail: text.split('\n').slice(-40) } };
  },
});
