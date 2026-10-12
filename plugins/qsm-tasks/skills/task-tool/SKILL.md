---
name: task-tool
description: "Use at the start and end of every session, whenever work will not finish in this turn, when a finding is not the ask, when an epic or its tasks are created, closed or checked, or when a subagent reports a tool problem. Triggers: what next, what is open, track this, follow-up, later, TODO, epic, acceptance criteria, test-it, blocked by, depends on, claim this, close this, file feedback, co dal, zaloz task."
---

# Task tool

Unfinished work gets lost between sessions, files and agents unless one place holds it. The task
tool is that place: it outlives the session and the agent that found the work. This skill holds the
model of what an epic and a task are and the commands of the one binary that serves it, `br`. It
does not decide what to build (that is the plan), only that nothing falls out and that nothing is
called finished that is not.

## The model

1. An epic holds the intent of one piece of work and its acceptance criteria: who it is for, what
   they do with it, what is out, and the checks that prove it. Its description is the one place
   that text lives, because a reviewer reads the work against it.
2. One task per spec change, created together with the spec and never before, because a task
   without a spec is a wish and a spec without a task is invisible to the ready list. Its title
   names the change and it carries the change id as external reference.
3. No subtasks in the tracker. The change's `tasks.md` holds the breakdown (files, order, proof),
   because steps that live in two places drift.
4. Every epic has a final test-it task that runs the real path end to end, the way the person
   will meet it. It is created with the epic and blocked by the others, so it is the last thing on
   the ready list.
5. A follow-up, a side finding, a decision to make and tool feedback are each a task, never a TODO
   in prose, a "later" in a comment or a list in a chat reply, because the ready list is searched
   every session and prose is not. A finding made while working on X records X as where it was
   discovered.
6. A fix gets no task and no epic: a commit with its why in the message. A task for a fix is
   bookkeeping nobody reads.
7. A task closes with a reason a reader in a month understands ("done" tells them nothing). Work
   done with its task open is a failure, because the next session would redo it or trust a lie.
8. An epic closes only when every task is done, every acceptance criterion holds, the test-it task
   passed, and the work is pushed after review. After each task closes, check the epic; closing it
   with a criterion unshown, or leaving it open when all of this holds, are both failures, and the
   reply says which criterion stands in the way.

## Working rules

1. A session starts with the ready list. After each finished piece of work or settled decision,
   before you report it, update the tasks: close, comment the decision on the task it belongs to,
   and flush the store so the commit carries it.
2. Starting a task claims it, assignee and status in one step; progress worth keeping goes into its
   comments, not the chat, so a second agent reads the state instead of asking.
3. One tracker per repository. A worktree points at the main checkout's store, so the ready list is
   the same everywhere and nothing is merged back.
4. The main agent creates tasks. A subagent creates one kind: feedback into the marketplace
   tracker, where and how the instructions say. Two writers with different views of the work make
   duplicates.
5. Real work that is not now is deferred with a date or condition, never silently closed (hides it)
   or left open (the ready list lies). Before creating, search the title words and comment on an
   existing task instead; priority is a number the ready list sorts by, raised only for work that
   blocks other work.

## The binary: `br`

`br` is the Rust beads tracker (`beads_rust`), not `bd`, the Go tool of the same family. This is
the only place that names it. The store is `.beads/` at the repository root: `issues.jsonl` is the
tracked source of truth and `beads.db` is a cache `br` rebuilds. Commit `.beads/`, never the
cache. Add `--json` when a program reads the result.

| Step | Command |
| --- | --- |
| start | `br ready --json` |
| epic | `br create "<goal>" -t epic -d "<intent and acceptance criteria>"` |
| spec change | `br create "<change>" -t task --parent <epic> --external-ref openspec:<change-id> -d "<why>"`; find it with `br list --json` on `external_ref` |
| test-it | `br create "Test it" -t task --parent <epic> -d "<the real path to run>"`, then `br dep add <test-it> <task>` for each task |
| other task | `br create "<title>" -t task -d "<why and what done looks like>"` |
| order | `br create ... --deps blocks:<id>` or `br dep add <task> <blocker>` |
| finding | `br create ... --deps discovered-from:<id>` |
| claim | `br update <id> --claim` |
| progress | `br comments add <id> "<what changed>"` |
| who | `br coordination status --json` |
| close a task | `br close <id> --reason "<what was done>"`, then `br sync --flush-only`, then `git add .beads/` |
| epic check | `br epic status`; when the criteria also hold, test-it passed and the push is done, `br close <epic> --reason "<what it delivered>"`, then flush |
| defer | `br update <id> --status deferred --defer <date>` |
| hygiene | `br stale --days 30`, `br list -s open --json`, `br show <id> --json` |
| worktree | write the main checkout's `.beads` path, absolute, as the single line of `<worktree>/.beads/redirect` |

`br epic status` reports an epic eligible when its children are closed; that is the task part of
rule 8 only, so read the criteria yourself. With a redirect, `br sync` in the worktree only
exports; the main checkout owns the commit. A fresh repository gets `br init` once, then
`br config set issue_prefix=<short>`. `br` also ships an MCP server; the CLI is the surface these
rules assume, because it works from a shell with no harness.

## Red flags

- When you are about to write "TODO" or "later" anywhere, create the task, because prose is not
  searched.
- When you are about to create a subtask, put the step in the change's `tasks.md`, because the
  tracker holds one task per change.
- When the last task of an epic closes and you want to close the epic too, name each acceptance
  criterion and what showed it, because eligible by children is not done.
- When the stale list is long, act, defer or close with a reason, because a tracker nobody reads is
  a text file.

## Say it in the reply

At the start of a session: how many tasks are ready and the one you take. After work: ids closed
with reasons, the epic when it closed or the criterion that keeps it open, and ids created, one
line each. For "what next": the ready list's top three with their blockers, not the whole tracker.
