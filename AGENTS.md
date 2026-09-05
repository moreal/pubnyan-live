# AGENTS.md

Rules for any agent (Flue, pi, Claude Code) working in this repository.

## What this repo is

pubnyan animations. One motion definition in `motion/` is exported to several targets. `npm run verify` is the arbiter: it renders every target and the reference sampler in headless Chrome and diffs them.

## Rules

- Never edit `vendor/visual-identity/` (submodule) or `rig/*.rig.json` by hand. Change `rig/parts.map.json` and run `npm run rig:extract`.
- Do not edit `packages/*` unless the backlog item you are working on says so. Animation work lives in `motion/clips/`.
- Run `npm run verify` before committing. Commit only when it passes. Look at `dist/verify/<clip>-contact.png` and judge the motion visually, not just the numbers.
- Pick work from `docs/backlog.md` top to bottom. Mark an item `[x]` in the same commit that completes it.
- Commit on a branch named `agent/<item-slug>`. Never commit `dist/verify/` or `.env`.
- Keep amplitudes small: pubnyan is a calm cat. The ring and the star mouth are the focal elements.

## Commands

- `npm run rig:extract` / `npm run rig:inspect <file.svg>`
- `npm run export:svg`, `npm run verify`, `npm test`, `npm run check:types`
- `npx flue run src/agents/director.ts -m next --id pubnyan` — run the director once (phase 6).
