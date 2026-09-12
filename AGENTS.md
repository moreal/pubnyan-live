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
- Commit messages get a `Co-Authored-By:` trailer for the authoring agent, but never a `Claude-Session:` (or similar session-URL) trailer — session links are ephemeral and don't belong in permanent history.

## Performance tooling

- CodSpeed-related skills are disabled for this repository. Do not invoke `codspeed-optimize` or `codspeed-setup-harness`, or use CodSpeed CLI/MCP tools for this project.
- Investigate performance with local wall-clock timings, local profilers, and repeatable local benchmarks. Do not require CodSpeed authentication, uploads, or integration to optimize the check suite.

## Commands

- `npm run rig:extract` / `npm run rig:inspect <file.svg>`
- `npm run export:svg`, `npm run verify`, `npm test`, `npm run check:types`
- `npx flue run src/agents/director.ts -m next --id pubnyan` — run the director once.
- `npm run agent` — worker loop, forever, in `.worktrees/agent` on `agent/backlog`; `npm run agent -- --max 1` for one item; `--no-worktree` to run in this checkout (CI).
- `npm run plan -- <topic> "<message>"` — talk to the Planner; reuse the topic to continue the conversation.
- `npm run backlog:add` — add backlog items without a Planner conversation. Reads `{"summary": ..., "ops": [...]}` (the exact `write_backlog` input shape) as JSON from a file argument or stdin, runs it through the same `writeBacklog` checks (branch, dirty file, duplicate titles, `Done when:`, ...), and prints the resulting sha or the rejection errors: `echo '{"summary":"...","ops":[...]}' | npm run -s backlog:add`.

## The agent loop

- Humans and the Planner work in this checkout on `main`. The worker loop (`npm run agent`) works in `.worktrees/agent` on `agent/backlog`, merges `main` before every item, and needs credentials: `ANTHROPIC_API_KEY` in `.env` or a pi login (`pi` then `/login`), from which it mints a Claude subscription OAuth token via `pi auth print-bearer-token`.
- Per item the loop: merges `main`, unclaims stale `[~]` items, claims the first `[ ]` (commit `chore(backlog): claim ...`), runs the Director (Implementer, Reviewer, `git_commit`, `mark_done`), and on `FAILED:`, a crash, or a timeout stashes the tree as `failed: <title>`, marks the item `[!]` with the reason, and moves on. Three consecutive failures stop the loop. In forever mode an empty backlog is polled every 5 minutes (`--poll`, `AGENT_POLL_MS`); with `--max` set the loop exits 0 with `backlog empty` instead of waiting.
- A merge conflict with `main` stops the loop with the paths printed; resolve it in `.worktrees/agent` and start the loop again. The loop refuses to start on a dirty work tree.
- Commits happen only through the `git_commit` tool (Director), the loop's claim/fail/unclaim commits, and the Planner's `write_backlog` (docs/backlog.md on `main` only).
- Merge `agent/backlog` into `main` after looking at the contact sheets. The GitHub workflow `agent` runs `npm run agent -- --max 1` in its own checkout and opens a PR.
- The loop's stash entries (`failed: <title>`) live in the repository's shared stash list: a linked worktree shares `refs/stash` with the main checkout, so a human working in this checkout on `main` sees them too in `git stash list`. Inspect one with `git stash show -p`, then `git stash drop` it; never `git stash pop` one onto `main`.
- With `--no-worktree` the loop checks out `agent/backlog` in place, in this checkout, instead of in `.worktrees/agent` — the operator's own checkout ends up on `agent/backlog` when the run finishes.
- The Planner's "only edit through `write_backlog`" rule is prompt-enforced, not mechanical — same caveat as the Reviewer's read-only line above: nothing stops the Planner agent from writing docs/backlog.md directly. The branch/claim/dirty guards inside `write_backlog` and `git_commit` themselves, by contrast, are mechanical: they run regardless of what the calling agent intends.
- To clear an orphan `[~]` left by a loop that is no longer running (a crash, a killed process): start the loop once with `npm run agent -- --max 0` — it unclaims stale claims on startup and exits immediately without claiming anything new — or edit the marker back to `[ ]` on `agent/backlog` by hand.
