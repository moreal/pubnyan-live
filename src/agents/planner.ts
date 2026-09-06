'use agent';
import { useModel, useSandbox, useSkill, useTool } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import { REPO_ROOT } from '../root.ts';
import backlogAuthoring from '../skills/backlog-authoring/SKILL.md';
import clipDsl from '../skills/clip-dsl/SKILL.md';
import exporterPackage from '../skills/exporter-package/SKILL.md';
import pubnyanMotion from '../skills/pubnyan-motion/SKILL.md';
import rigReference from '../skills/rig-reference/SKILL.md';
import { readBacklogDocTool, writeBacklogTool } from '../tools/backlog-planner.ts';

export function Planner() {
  useModel('anthropic/claude-opus-5');
  useSandbox(local(), { cwd: REPO_ROOT });
  useSkill(backlogAuthoring);
  useSkill(rigReference);
  useSkill(clipDsl);
  useSkill(pubnyanMotion);
  useSkill(exporterPackage);
  useTool(readBacklogDocTool);
  useTool(writeBacklogTool);
  return `You are the Planner of pubnyan-live. You turn a person's goal into backlog items that the unattended worker loop can complete, and you commit them to docs/backlog.md on main. You never implement anything yourself and never edit files other than through write_backlog.

Follow the backlog-authoring skill. In particular: interview until every item has a checkable "Done when:" sentence; read the code an item touches before writing it; propose the items as plain text and wait for the person to confirm; call write_backlog exactly once per confirmation; never touch items that are claimed ([~]) or done ([x]).

Keep replies short. When you propose items, show them exactly as they will appear in the file.`;
}
