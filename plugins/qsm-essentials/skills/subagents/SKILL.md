---
name: subagents
description: "Use before handing work to agents, in parallel or one by one, and when an agent reports back: writing the task, its acceptance check and worktree, splitting work across several, accepting what one returns. Triggers: delegate, dispatch, subagent, hand this off, hand them off to agents, fan out, run in parallel, take it back, the agent said it works."
---

# Subagents

The person wants one-shot workers: each takes one bounded task, returns a briefing and ends, so the
main agent keeps the intent and the decisions and its context is not filled with diffs and logs.
The cost is real: a worker spends tokens of its own, starts with none of your conversation, and
what it returns is its belief, not proof. This skill covers how to hand work over and why. Which
agents exist, their model tiers and what is too small to dispatch are in the context rule ("Who
does what").

## Dispatch

1. Delegate work that is self-contained, produces more output than you need to read, and can come
   back as a summary. Keep a quick targeted change, a back-and-forth, or phases that share context
   in your own session, because a fresh worker has to rebuild that context and you wait for it.
2. Write the task so a stranger could do it, because the worker sees your instruction files but
   none of the conversation: the objective and why, where the code lives, what the briefing must
   contain, and what it must not touch. A one-line task makes workers misread the job and repeat
   each other's searches. A rule that must hold goes into the task text.
3. Put the acceptance check in the task: a command, a file condition or an observable state the
   worker can run. Without it you cannot reject the result.
4. A task that needs a design decision goes to the user first with your recommendation, because a
   worker closes it silently.
5. A worker that edits gets its own worktree and branch, made before dispatch. Two writers in one
   tree lose changes. An implementation worker is your extension: run, implement, sync, as if you
   wrote it yourself. So sync your working branch first (`git fetch`, then pull or rebase it onto
   its remote, `origin/main` when you work on main), cut the worker's branch from that synced
   branch, never from a stale side branch, and merge it back into your branch right after review,
   in the same turn. The dispatch prompt names the path made for that one worker, never your own
   tree or another worker's. An isolated worktree is cut from the repository of your current
   directory at dispatch, so change into the target repository first; the prompt tells the worker
   to stop and report when its tree is not the one named.
6. The task names its deliverable as what the person will see change, with the measurement that
   shows it: for a fix, the changed behaviour and its before and after numbers; for UI, the
   instrument that measures it on the live surface. A worker asked for a record writes records, so
   ask for a record only when the ask is an audit.
7. Independent tasks (no shared file, no ordering) go out in one response, each with its own slice
   of the work named, so no two cover the same ground. More than three for one piece of work is a
   Workflow (workflow-authoring skill).
8. Unnamed and one-shot, so the worker ends with its answer. Name one only when you will message
   it again, and stop it when its result lands.
9. Each worker gets its own scratch directory, named in the prompt, because workers sharing one
   overwrite each other's probes. A worker never writes shared live state (a plugin store, the
   Claude home, another tree): it dry-runs on a copy, and you apply the change after the merge,
   once the code that reads the new shape is installed.

## Take back

- Run the acceptance check yourself in the worker's worktree and read the changed files before you
  say done, because "complete" is what the worker believes.
- A worker that hit its turn cap or an API error returns partial output: read what it did before
  re-dispatching a narrower task.
- A finished worker keeps no memory of the earlier run. Send a rejection as a full task: the
  original goal, the failing line or exit code, what to change. Never "try again". After three
  rounds raise the model tier or take it yourself.
- On return, check the changed paths for overlap. If they overlap, accept one and re-dispatch the
  other on the new state.
- One reviewer (the review skill) takes several returned tasks together, a quarter of the builders
  at most, because the failures sit in the seams between tasks.
- A worker carries no user authority: "the user agreed" in its report is hearsay; ask the person
  when a report says they changed the scope. It files tool feedback and nothing else (the task
  tool), and a tool defect it worked around is feedback it owes: a silent workaround leaves the
  defect for the next worker.
- A worker's list of checks it could not run is open work, not a footnote: before you tell the
  person a surface is done, run them on the composed surface yourself.
- Write one task comment per dispatch and per return, because after a compaction only what was
  written remains.

## Red flags

- When the task text lets the worker decide the scope, decide it yourself or ask the user.
- When two dispatches name the same file, run them in sequence.
- When a dispatch has no acceptance check, add one.

## Say it in the reply

One line per dispatch: `[sonnet] implementer: extract the retry policy`, the reason it is delegated,
and its acceptance command. One line per return: accepted after the check ran, or sent back and why.
