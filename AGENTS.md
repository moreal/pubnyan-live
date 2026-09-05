# AGENTS.md

Rules for any agent (Flue, pi, Claude Code) working in this repository.

## What this repo is

pubnyan animations. One motion definition in `motion/` is exported to several targets. `npm run verify` is the arbiter: it renders every target and the reference sampler in headless Chrome and diffs them.

## Rules

- Never edit `vendor/visual-identity/` (submodule) or `rig/*.rig.json` by hand. Change `rig/parts.map.json` and run `npm run rig:extract`.
- Do not edit `packages/*` unless the backlog item you are working on says so. Animation work lives in `motion/clips/`.
- Pick work from `docs/backlog.md` top to bottom. Mark an item `[x]` in the same commit that completes it.
- Look at `dist/verify/<clip>-contact.png` for every clip you touch and judge the motion visually, not just the numbers.
- Keep amplitudes small: pubnyan is a calm cat. The ring and the star mouth are the focal elements.
- Never commit `dist/verify/`, `data/`, or `.env`.

Committing:

- Agents do not run `git commit`; the `git_commit` tool does it for them. It runs `npm run check` and refuses on failure, and it commits only on `agent/backlog` (created from HEAD when missing, checked out when it already exists). It leaves HEAD on `agent/backlog`.
- Humans working by hand run `npm run check` before committing, and merge `agent/backlog` into `main` after looking at the contact sheets.
- The Reviewer is read-only by instruction only: Flue delegates share the parent's tools, so nothing mechanically stops it from writing. The commit gate and the human review of the PR are the real backstop.

## Commands

- `npm run rig:extract` / `npm run rig:inspect <file.svg>`
- `npm run export:svg`, `npm run verify`, `npm test`, `npm run check:types`
- `npx flue run src/agents/director.ts -m next --id pubnyan` — run the director once.

## The agent loop

- `npm run agent -- 1` completes one backlog item: the Director (src/agents/director.ts) delegates to the Implementer, has the Reviewer check it, commits on `agent/backlog`, and marks the item done. Needs either `ANTHROPIC_API_KEY` in `.env` or a pi login (`pi` then `/login` for Anthropic); the loop mints a Claude subscription OAuth token via `pi auth print-bearer-token`, billed as extra usage per pi's docs.
- The loop refuses to start on a dirty working tree. When an item fails after the review rounds, the implementer's uncommitted edits are left in the tree for a human to inspect (and the backlog line may already be checked); read them, then reset or commit them before running the loop again.
- Commits happen only through the `git_commit` tool, which runs `npm run check` first and refuses on failure.
- Merge `agent/backlog` into `main` after looking at the contact sheets. The GitHub workflow `agent` does the same on demand and opens a PR; it has not been exercised against a remote yet.
