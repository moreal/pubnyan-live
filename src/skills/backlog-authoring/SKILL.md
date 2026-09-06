---
name: backlog-authoring
description: How to write, size, and place items in docs/backlog.md so the worker loop can complete them unattended. Use whenever you add or edit backlog items.
---
# Backlog authoring

`docs/backlog.md` is a queue shared by humans, the Planner, and the worker loop. One item = one unattended Director run (an Implementer session plus a Reviewer session, at most three review rounds). Write items the Implementer can finish and the Reviewer can judge without asking anyone.

## Item format

One line per item, under a `## Section` heading:

    - [ ] **<title>.** <what to build, where, and how>. <constraints>. Done when: <an executable check>.

- Title: short, unique among non-done items, ends with a period, names the area (`export-rive: state machine.`, `motion/clips: blink-v2.`).
- Body: name the files and functions to touch, the pattern to mirror (`mirror packages/export-svg`), and anything the Implementer would otherwise have to guess.
- `Done when:` is mandatory and must be checkable by running something: a command and its expected output, a parity target passing in `npm run verify`, a test file that must exist and pass. "Works well" is not a check.

## Sizing

- If you cannot name the files to change, the item is not ready; investigate first.
- One item touches one area (one clip, one exporter feature, one tool). Split anything with an "and" that crosses areas.
- Put prerequisites first; the loop takes items top to bottom within the whole file.

## States (read-only for you unless stated)

- `[ ]` open: yours to add, edit, reorder, remove.
- `[~]` claimed: the worker is on it now. Never edit, move, or remove. `read_backlog_doc` lists these under `claimed`.
- `[x]` done: history. Never edit.
- `[!]` failed: the reason is in the bullet under it. Fix the item text with `replace`, then `reopen` it.

## Process

1. Ask what the user wants and why, until you can write the `Done when` sentence.
2. Read the code the item touches (`read_backlog_doc`, `grep`, `read`); check AGENTS.md rules.
3. Propose the items as text in your reply and wait for an explicit "yes".
4. Only then call `write_backlog` once with all ops and a summary under 72 characters.
5. Reply with one line per title and the commit sha.
