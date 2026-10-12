---
name: spec-apply
description: "Use when an apply-ready change is about to become code: implementing a proposal, working through a change's tasks, or starting to code a planned change. Triggers: apply this spec, implement the proposal, work through the tasks, start coding this change, build what we specced. Writing or revising the plan is spec-propose."
---

# Spec apply

The plan is written and the person said yes to it, so the question left is whether code and
evidence both exist for each line of tasks.md. This is the build step of the qsm flow: it
implements an apply-ready change line by line, smallest change, real run, for the person who
reviews it against the spec. It stops the moment the plan stops being true. It does not rewrite the
plan (spec-propose does) and adds nothing the spec did not ask for. Hand the code to an
implementer, follow the language skill for the code, tick each line in tasks.md as it lands and
nowhere else, and finish with the review agent, then the push.

## Before the first edit

1. **Find the root.** `openspec list --json` must work from a root that belongs to this
   repository. A nested repository resolves to the ancestor's root and reads someone else's
   change. No root of its own: stop, offer `openspec init --tools none`.
2. **Name the change.** Unnamed or ambiguous: ask from the `openspec list --json` output.
   Guessing costs a whole implementation.
3. **Refuse a draft.** `openspec status --change <id> --json` must show every required artifact
   done, and the proposal's `## Critiques` fixed or waived. A draft implemented is a draft shipped.
4. **Read before coding.** `openspec instructions apply --change <id> --json` lists the files:
   tasks.md is the order, delta specs the acceptance, design the why.
5. **Claim the change's task** in the task tool, the one bound with `openspec:<change-id>`. It is
   claimed once; its lines are in tasks.md and never become tasks.

Work inline. Subagents only for disjoint, fully decided tasks (the subagents skill).

## Per line of tasks.md

1. **Smallest change that does the task.** Structure and behaviour never share a step.
2. **Run the delta spec's scenario the way the user meets it** and read the output. A test only
   for logic the real run cannot reach.
3. **Run the line's own verification, then tick it in tasks.md.** The tick is a claim the reviewer
   believes. Ticking never touches the task tool.

## When the plan stops being true

1. **Fix and record:** a bug blocking the line, a missing validation or auth check, a mechanical
   blocker (import, name). Nothing else is yours to decide.
2. **A default, threshold, ordering, conditional or schema field the spec did not name is not a
   quick fix.** Its author calibrated it; your comment is not approval.
3. **A refuted assumption stops the code.** Route the change through spec-propose, resume when
   `openspec validate <id> --strict` is green. Silent deviation hides itself from review.
4. **An out-of-scope idea becomes a task with a reason in the task tool, never code.**
5. **Record every deviation.** One that repeats is a gap in the spec.

## Finishing

Merge delegated work in dependency order, run the full suite on the union (each branch was green
alone). Done is: all lines ticked, suite green, `openspec validate <id> --strict` green,
`qsm-langdev check` shows no regression. Then hand to the review agent, not to spec-archive: the
code was written by the reader who would approve it. Push after the review and received-findings;
archive comes after the push.

## Red flags

- About to tick an unverified line: run it first.
- Changed a default and wrote a comment why: revert, route through spec-propose.
- Editing plan and code in one move: finish one, or the plan gets bent to fit the code.
- A subagent said it works: read its diff.
- Same failing check, fourth attempt, same evidence: stop and report.

## Say it in the reply

Change id and task id, one line. Per line: ticked with its proof, or open with what is missing.
One line per deviation. Last line: ready for the review agent, or the blocker.
