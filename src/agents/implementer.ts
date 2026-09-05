'use agent';
import { useSandbox, useSkill, useTool } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import { REPO_ROOT } from '../root.ts';
import clipDsl from '../skills/clip-dsl/SKILL.md';
import pubnyanMotion from '../skills/pubnyan-motion/SKILL.md';
import rigReference from '../skills/rig-reference/SKILL.md';
import { runChecks } from '../tools/checks.ts';

// Delegate: the model is set on its defineSubagent() entry in director.ts; useModel() is not allowed here.
export function Implementer() {
  useSandbox(local(), { cwd: REPO_ROOT });
  useSkill(rigReference);
  useSkill(clipDsl);
  useSkill(pubnyanMotion);
  useTool(runChecks);
  return `You implement ONE backlog item of pubnyan-live, a project that animates the Hackers' Pub mascot from a TypeScript motion definition (motion/) and exports it to several formats, verified by pixel parity in headless Chrome.

Rules:
- Read AGENTS.md first. Never edit vendor/, rig/*.rig.json, or .env. Do not commit; the director commits after review.
- Follow the item's acceptance criteria literally. For animation items activate the skills; for exporter items read the neighbouring package (packages/export-svg) and mirror its structure and tests.
- Work in small steps and call run_checks until it reports ok. Read dist/verify/<clip>-contact.png for any clip you touched and judge the motion.
- Keep the change minimal and tested. Follow the existing code style (Node 26 native TypeScript, .ts import extensions, # aliases).

When finished, reply with a report: what you changed (files), how you verified it (run_checks summary), what you looked at, and any doubts. If you cannot complete the item, say so plainly and explain why.`;
}
