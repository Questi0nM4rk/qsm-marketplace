---
name: spec-archive
description: "Use when a change is finished and should leave the active set, or its delta specs have to become the durable spec set: archiving a change, merging or syncing deltas, finishing the spec workflow, promoting a completed proposal. Triggers: archive this change, sync the specs, merge these spec deltas, fold the deltas in, finish this change, we are done with this change, close this out. Revising an unfinished plan is spec-propose."
---

# Spec archive

Archiving is the moment a change stops being reviewable against its intention, so every gate is
checked first and none can be clicked through. No "continue anyway", no skip flag: a confirmable
warning is not a gate. This skill merges the deltas into the durable specs, archives the change,
then lets the user pick the integration route. It is the last step of the qsm flow, after review
and received-findings: it also closes the tasks in the task tool that are bound to the change,
then checks whether the epic may close, and never closes it early.

## Before the first check

1. **Find the root.** `openspec list --json` must work from a root that belongs to this
   repository, or a nested repository archives the ancestor's change. No root of its own: stop,
   offer `openspec init --tools none`.
2. **Name the change.** Unnamed or ambiguous: ask from the list. An archive is slow to undo.

## Merge the deltas

A merge is reading, not copying: pasting a delta onto a durable spec describes a system nobody
built. Delta paths come from `openspec status --change <id> --json`. No deltas: say so, merge
nothing. Per requirement:

1. **Read the whole durable spec first.** It holds requirements this change never mentions.
2. **ADDED** puts it in; if it already exists it is a MODIFIED.
3. **MODIFIED** replaces the whole requirement, scenarios included.
4. **REMOVED** deletes the match; no match: say so, delete nothing near it.
5. **RENAMED** is a rename (from, to), not a delete plus an add, so scenarios and history survive.
6. **Untouched stays untouched:** other requirements, scenarios, order, reasoning. Scenario titles
   travel unchanged unless the delta retitles them.

## Gates, all blocking

1. Every line of tasks.md ticked. One open line blocks: send it back to spec-apply. A plan that no
   longer matches what was built is not archived either: send it to spec-propose.
2. `openspec validate <id> --strict` and `openspec validate --all --strict` pass, merge included.
3. The project's tests pass, and you hold this session's output. "They passed earlier" is no proof.
4. `qsm-langdev check` shows no regression. No baseline: skip loudly. Re-baselining is the
   user's call, never yours.
5. Deltas are merged (above), then validate again.

A red gate stops the archive: name the exact failure and what clears it. Never ask "archive
anyway?". Never pass `--no-validate` or `--skip-specs` (the second is for a change that has no
deltas, and only then).

## Archive

1. `openspec archive <id> --yes` only with every gate green, because it is slow to undo.
   Confirm the change sits under the archive directory and is gone from `openspec list`.
2. `openspec validate --all --strict` again, because the move rewrites paths.
3. Close every task in the task tool bound with `openspec:<change-id>`, each with a reason naming
   the work done. Look for more than one: a change often carries a follow-up or
   a feedback task. An unclosed task makes the tracker say work is open that is finished.
4. Check the epic's close rule, listing its tasks and its acceptance criteria first, never from
   memory. The epic closes only when all four hold: every task of it is done; every acceptance
   criterion holds, each shown by a run you have in this session or by the test-it task's result;
   the test-it task passed; and the work is pushed after review. Any one missing leaves the epic
   open, and you name which. Archiving a change that is not the last one never closes the epic.

## Integration, the user picks

1. **Offer all three, carry out one:** merge into the base branch locally, open a pull request,
   keep the branch. A recommendation with two alternatives is a default dressed as a choice.
2. **Keep means keep:** nothing merged, nothing opened.
3. **Clean the worktree** whichever was chosen.

## Red flags

- About to ask "archive anyway?": report the failing gate.
- A gate reported green that you did not run this session: run it.
- A requirement vanished and no delta said REMOVED: restore it.
- A delta body pasted into a durable spec: redo it by the rules above.
- Picked the integration route yourself: ask.

## Say it in the reply

Per durable spec: path and actions applied. Each gate with its result and the evidence line. The
archived path. Each task id closed with its reason, and the epic closed with its evidence or, per
rule, what it still waits for. The route the user picked and what you did. Last line: worktree
cleaned, or why not.
