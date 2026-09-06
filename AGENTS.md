# AGENTS.md

Rules for any agent (Flue, pi, Claude Code) working in this repository.

## What this repo is

pubnyan animations. One motion definition in `motion/` is exported to several targets. `npm run verify` is the arbiter: it renders every target and the reference sampler in headless Chrome and diffs them.

## Rules

- Never edit `vendor/visual-identity/` (submodule) or `rig/*.rig.json` by hand. Change `rig/parts.map.json` and run `npm run rig:extract`.
- Do not edit `packages/*` unless the backlog item you are working on says so. Animation work lives in `motion/clips/`.
- `docs/backlog.md` states: `[ ]` open, `[~]` claimed, `[x]` done, `[!]` failed. The worker loop claims (`[~]`) before starting and the Director marks `[x]` in the commit that completes the item. Nobody but the loop edits a `[~]` item. The Planner edits open items only through `write_backlog`, on `main`.
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
- `npm run agent` — worker loop, forever, in `.worktrees/agent` on `agent/backlog`; `npm run agent -- --max 1` for one item; `--no-worktree` to run in this checkout (CI).
- `npm run plan -- <topic> "<message>"` — talk to the Planner; reuse the topic to continue the conversation.

## The agent loop

- Humans and the Planner work in this checkout on `main`. The worker loop (`npm run agent`) works in `.worktrees/agent` on `agent/backlog`, merges `main` before every item, and needs credentials: `ANTHROPIC_API_KEY` in `.env` or a pi login (`pi` then `/login`), from which it mints a Claude subscription OAuth token via `pi auth print-bearer-token`.
- Per item the loop: merges `main`, unclaims stale `[~]` items, claims the first `[ ]` (commit `chore(backlog): claim ...`), runs the Director (Implementer, Reviewer, `git_commit`, `mark_done`), and on `FAILED:`, a crash, or a timeout stashes the tree as `failed: <title>`, marks the item `[!]` with the reason, and moves on. Three consecutive failures stop the loop. An empty backlog is polled every 5 minutes (`--poll`, `AGENT_POLL_MS`).
- A merge conflict with `main` stops the loop with the paths printed; resolve it in `.worktrees/agent` and start the loop again. The loop refuses to start on a dirty work tree.
- Commits happen only through the `git_commit` tool (Director), the loop's claim/fail/unclaim commits, and the Planner's `write_backlog` (docs/backlog.md on `main` only).
- Merge `agent/backlog` into `main` after looking at the contact sheets. The GitHub workflow `agent` runs `npm run agent -- --max 1` in its own checkout and opens a PR.
