# Async backlog loop: planner, worker worktree, claim states

Date: 2026-09-06. Status: approved design, pending implementation plan.

## Goal

Let a human (through a Planner agent) add, edit, and reorder backlog items at any time while a Worker loop keeps completing items, without the two ever editing the same working tree, and without the loop stopping on an empty queue or a single failed item.

Keep `docs/backlog.md` as the queue and Flue `flue run` as the executor. No HTTP server, no new runtime dependency. The loop body is written so a later Flue app server (`app.ts` + croner) can call the same functions.

## Non-goals

- Multiple concurrent workers.
- GitHub Issues as the queue.
- A browser UI for the planner.
- Changing how the Director, Implementer, and Reviewer collaborate inside one item.

## 1. Branches and worktrees

- Humans and the Planner work in the main checkout (`REPO_ROOT`) on `main`.
- One-time setup: `git branch -f main agent/backlog && git checkout main`. `main` is strictly behind `agent/backlog` today (27 commits, no divergence), so this is a fast-forward.
- The Worker runs in a dedicated worktree at `.worktrees/agent` (gitignored) with `agent/backlog` checked out. The loop creates it when missing: `git worktree add .worktrees/agent agent/backlog`, then `git submodule update --init` and `npm ci` inside it. It re-runs `npm ci` whenever `package-lock.json` changes between items.
- Before each item the Worker runs `git merge --no-edit main` on `agent/backlog` to pick up Planner commits. Merge, not rebase: `agent/backlog` is pushed and PR'd. A merge conflict stops the loop with the conflicting paths printed; a human resolves it.
- The reverse direction is unchanged: a human merges `agent/backlog` into `main` after looking at the contact sheets (locally or via the PR opened by `agent.yml`).
- Every tool that reads or writes the repository resolves its root from `PUBNYAN_ROOT` (falling back to `REPO_ROOT`). The loop sets `PUBNYAN_ROOT` to the worktree path for the `flue run` child. `data/flue.db` and `dist/` therefore live per worktree.

## 2. Backlog item states and actor rules

States, by checkbox marker:

| Marker   | Meaning   | Who sets it                              |
| -------- | --------- | ---------------------------------------- |
| `- [ ]`  | open      | Planner, human, or Worker (orphan reset) |
| `- [~]`  | claimed   | Worker loop, before starting the item    |
| `- [x]`  | done      | Director via `mark_done`                 |
| `- [!]`  | failed    | Worker loop, after `FAILED:` or a crash  |

A failed item carries its reason as an indented bullet directly under it: `  - failed 2026-09-06: <reason>`. Reopening (`[!]` -> `[ ]`) removes the reason bullet.

Identity: an item is identified by its bold title (`**...**`). Line numbers are no longer used by any tool. Titles must be unique among non-done items; the Planner's write tool enforces this.

Item format: the item text ends with a sentence beginning `Done when:` that states an executable check (a command and its expected result, or a named parity target passing). The Planner's write tool refuses items without it. The Reviewer uses it as the PASS criterion.

Worker rules:

- The loop (not the model) claims: flips the first `[ ]` to `[~]` and commits `chore(backlog): claim <title>` on `agent/backlog`, then spawns the Director.
- On `DONE:` the Director's `mark_done` has already flipped `[~]` to `[x]` inside the item's own commit (unchanged behavior).
- On `FAILED:`, a non-zero exit, a timeout, or a reply that breaks the contract: the loop stashes any dirty tree as `failed: <title>`, flips `[~]` to `[!]` with the reason, commits `chore(backlog): fail <title>`, and continues.
- At the start of every iteration with a clean tree, any `[~]` is an orphan (a dead run, or a stale claim merged in from `main`): flip it back to `[ ]`, commit `chore(backlog): unclaim <title>`, continue. With a dirty tree the loop refuses to continue, as today. (Implemented per iteration rather than only at start-up; the per-iteration form also catches stale claims that arrive through the merge from `main`.)

Planner rules:

- May insert, replace, remove, and reorder `[ ]` items, and reopen `[!]` items.
- Must not touch `[~]` or `[x]` lines. The write tool reads `git show agent/backlog:docs/backlog.md` to learn the claimed titles and refuses any operation that changes or moves them.
- Writes only `docs/backlog.md`, only on `main`, only when that file is clean before the write, and commits it as `docs(backlog): <summary>`.

## 3. Worker loop

Files: `src/loop/worker.ts` (the steps), `scripts/agent-loop.mjs` (thin CLI).

Steps, each a function taking a `sh(cmd, {cwd})` runner so tests can point them at a temporary repository:

- `ensureWorktree(repoRoot, path)`: create the worktree, init submodules, `npm ci`; return the path. Re-run `npm ci` when the lock hash differs from the last one recorded in `.worktrees/agent/.lock-hash`.
- `syncFromMain(workRoot)`: `git merge --no-edit main`; throw with conflicting paths on failure.
- `recoverOrphans(workRoot)`: unclaim every `[~]` and commit.
- `claimNext(workRoot)`: find the first `[ ]`, flip to `[~]`, commit; return the item or `null`.
- `runDirector(workRoot, env)`: spawn `npx flue run src/agents/director.ts -m next --id pubnyan-<ts>` with cwd `workRoot`, `PUBNYAN_ROOT=workRoot`, 45-minute timeout; return `{kind: 'done'|'failed'|'crash', title, sha?, reason?}` parsed from the last stdout line.
- `markFailed(workRoot, title, reason)`: stash a dirty tree, flip to `[!]`, add the reason, commit.

CLI:

- `npm run agent` runs forever. `--max N` stops after N completed items (the current behavior; `agent.yml` uses `--max 1`). `--poll <duration>` or `AGENT_POLL_MS` sets the empty-queue wait, default 5 minutes. `--no-worktree` uses the current checkout as the work root (default in CI; the loop chooses it automatically when `CI` is set).
- One iteration: dirty check -> `syncFromMain` -> `recoverOrphans` -> `claimNext`; if `null`, sleep and retry; else `runDirector`; on failure `markFailed`; then loop.
- Safety: three consecutive failures stop the loop. SIGINT kills the child and exits; the claim stays and the next start recovers it. Credentials are resolved once per iteration as today.

Director changes (minimal):

- `read_backlog` returns the single `[~]` item (title, text, section) or `null`.
- `mark_done` takes `{title}` and flips `[~]` (or `[ ]`) to `[x]`; idempotent when already `[x]`.
- Prompt: "If read_backlog returns null, reply `FAILED: no claimed item`." The `BACKLOG EMPTY` reply is removed; the loop decides emptiness.
- Reviewer prompt: verify the item's `Done when` sentence directly and state the result on the first line of PASS or FINDINGS.

## 4. Planner agent

- `src/agents/planner.ts`: `anthropic/claude-opus-5`, `local()` sandbox with cwd `REPO_ROOT`, all four existing skills plus `src/skills/backlog-authoring/SKILL.md`.
- The skill covers: item format and the `Done when` rule, sizing (one Implementer session, at least one verification command), section placement, the four states and which are read-only to the Planner.
- Tools:
  - `read_backlog_doc`: the full document plus a parsed list `{title, state, section}`; claimed titles are taken from `git show agent/backlog:docs/backlog.md` so the Planner sees claims that `main` does not have yet.
  - `write_backlog`: `{ops: Op[]}` where `Op` is `insert {title, text, section, after?}`, `replace {title, text}`, `remove {title}`, `reopen {title}`. Applies all ops to an in-memory copy, validates (no claimed or done title touched, unique titles, every inserted or replaced item has `Done when:`), and only then writes the file, stages only `docs/backlog.md`, and commits on `main`. Refuses when the branch is not `main`, when `docs/backlog.md` is dirty, or when validation fails; a refusal writes nothing.
- Prompt: interview the user on the goal, inspect the repository, propose items as text, and call `write_backlog` only after the user explicitly confirms. After the commit, reply with one line per title and the short SHA.
- Invocation: `npm run plan -- <topic> "<message>"` runs `npx flue run src/agents/planner.ts --id plan-<topic> -m "<message>"` with credentials from `resolveAnthropicEnv`. Reusing a topic continues the conversation.

## 5. Documents and CI

- `docs/backlog.md` header and `AGENTS.md` describe the four states, what each actor may do, and the two commands.
- `.github/workflows/agent.yml` runs `npm run agent -- --max 1`; no worktree in CI.
- `.gitignore` adds `.worktrees/`.

## 6. Testing

- `src/tools/backlog-file.test.ts`: parsing all four states, lookup by title, claim/done/fail/reopen transforms, duplicate-title detection, `Done when` detection, reason-bullet handling.
- `src/loop/worker.test.ts`: builds a temporary repository with `main` and `agent/backlog`, then exercises `ensureWorktree` (without `npm ci`, injected), `syncFromMain` (clean merge and conflict), `recoverOrphans`, `claimNext`, and `markFailed` (including the stash) against real git. `runDirector` is tested with an injected fake spawn for the done, failed, crash, and timeout shapes.
- Planner `write_backlog` tests: each refusal reason, and one successful commit, in a temporary repository.
- Manual acceptance: add a dummy item, run `npm run agent -- --max 1`, and confirm two commits appear on `agent/backlog` (the claim and the item) and the item is `[x]`.
