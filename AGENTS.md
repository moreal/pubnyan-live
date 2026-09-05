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

## The agent loop

- `npm run agent -- 1` completes one backlog item: the Director (src/agents/director.ts) delegates to the Implementer, has the Reviewer check it, commits on `agent/backlog`, and marks the item done. Needs `ANTHROPIC_API_KEY` in `.env`.
- Commits happen only through the `git_commit` tool, which runs `npm run check` first and refuses on failure.
- Merge `agent/backlog` into `main` after looking at the contact sheets. The GitHub workflow `agent` does the same on demand and opens a PR.
