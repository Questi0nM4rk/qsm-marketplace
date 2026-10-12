---
name: spec-propose
description: "Use when a change should start as a spec instead of as code, or when an existing change's plan no longer matches reality: proposing a change, writing the spec for a feature, turning a settled brainstorm into a plan, revising a proposal, or reconciling a decision that no longer holds. Triggers: propose this change, write a spec for this feature, spec this out, make it apply-ready, update the spec, the requirements changed, the implementation deviated from the plan. Code that implements an apply-ready change is spec-apply."
---

# Spec propose

A change that starts in code ends in code nobody can review against an intention. This skill writes
the intention first, for the person who will review the result and the agent who will implement it:
a proposal (why), a design (where things go and the basic abstractions), delta specs (what the
system will do), and tasks.md (the developer's own breakdown of this one change: files, order,
proof). The spec is the prompt for the implementation, so what is not in it does not get built. It
comes after grilling and plan in the qsm flow, one change per piece of an epic: first check that the
intent and the decisions are all in hand, and if not, go back to grilling instead of guessing.
Running it on a change that already exists is how a plan is revised: the four artifacts move
together, so a deviation becomes a visible decision instead of a rewrite nobody reviewed.

It writes planning artifacts only. It never edits code, not one line, because a plan that follows
the code is not a plan: when implementation uncovered the problem, the code stops, this runs, and
spec-apply resumes after.

## Before the first artifact

0. **Check that the intent and the decisions are all in hand.** Can you say, from the ask alone,
   what the system does afterwards and what proves it? Is every decision the artifacts need made
   (a limit, an owner, a storage, a failure behaviour)? Whatever is not goes to the grilling skill
   as one batch, each question with your recommendation, and no artifact is written until it
   returns, because a spec that guesses a decision ships the guess as the plan. Writing around fog
   is the failure this check prevents.
1. **Confirm the OpenSpec root belongs to this repository.** Ask the CLI for its context and
   compare the root with the repository you stand in. Root resolution walks up the tree, so a
   nested repository silently resolves to the ancestor's root and writes the change there. No root
   of its own means stop and offer `openspec init --tools none`; a deliberately shared planning
   home is the one exception, and the user says so before you write.
2. **Bind the change to one task in the task tool, created with the spec.** Look up the external
   reference `openspec:<change-id>`: a task carrying it is the task. Otherwise, once the spec is
   written and not before, create one under the epic the piece belongs to, with that reference,
   the change name as title and the proposal's why as description. A task never exists without
   its spec. The reference keeps change and task together when the branch and the session are
   gone. No task store reachable, here or above, means stop and offer to initialize one; a change
   nobody can find later is worse than one nobody started. Say "the task tool", never its
   binary; the plug-in that serves it holds the commands.
3. **Pick a short kebab-case change id and check it is free.** An id in use is a question for the
   user (continue that change or rename), because the task reference, the branch and the archive
   all carry it. Continuing an existing change is a revision, see below.

## Writing the artifacts

1. **Take the order from the CLI's status.** Write what is ready, skip what is blocked, loop until
   everything required for apply is done, because a hardcoded order breaks on a project with its
   own schema.
2. **Fill each artifact from its own instructions** (template, dependencies, path), after reading
   the completed dependencies. Writer constraints in the instructions are for you, never copied
   in.
3. **Delta specs carry real requirements and scenarios.** An empty change validates and proves
   nothing. A scenario title describes the behaviour a user or caller sees.
4. **tasks.md is the breakdown of the one task, and stays in the file.** Lines are in dependency
   order: each can be shown working alone, fits one context window, names the files it owns,
   the proof that shows it, and what blocks it, because a line that proves nothing until the
   others land cannot be ticked. No line becomes a task or subtask in the task tool.

## Revising an existing change

1. **Write down what changed, why, and which decisions it invalidates, then read every artifact,
   before editing.** That sentence is the input; without it the edits drift into a rewrite of
   whatever you opened first.
2. **Revise proposal, design, delta specs and tasks as one move**, because touching one leaves a
   change with several opinions. Check coherence in this order: tasks implement the design, the
   design satisfies the proposal, the delta specs match the design.
3. **Reopen every tasks.md line a changed decision invalidated, ticked ones included.** A line
   ticked against a plan that no longer exists is a lie with a checkmark.
4. **Comment each changed decision on the bound task**: what changed, why, what it invalidated.
   The task is the one place a change's history outlives the branch.
5. **Say what the revision cost**: lines reopened, work discarded, what the user gets instead, so
   scope never grows by being called a small edit.

## The critique passes

Three passes before the change is apply-ready, findings written under `## Critiques` in the
proposal, each fixed or waived with its reason (a waiver with a reason is a decision, a dropped
finding returns as a bug):

- devil's advocate: why is this wrong, what assumption is hidden;
- future archaeologist: what will a maintainer not understand in six months;
- scope sniper: what is the minimum, where is the yak shaving.

Apply-ready is a state the artifacts prove: every required artifact done, strict validation green,
every critique addressed. Until then the change is a draft and spec-apply refuses it.

## The gate before code

Show the person the spec (proposal, design, delta specs) and tasks.md, and ask for the yes through
the ask tool. Code does not start before it: the spec is the contract the review reads against, and
a yes to a plan he has not seen is no yes. Hand to spec-apply only after it.

## Boundaries

- A settled brainstorm's decisions are inputs; what is still open is the grilling skill's, not an
  interview of your own.
- A question you cannot yet state means the change is not ready to be one change: say so and map
  the area instead of writing a spec around fog.

## Red flags

- When you are about to write and have not confirmed which repository owns the root, confirm it,
  because the change would land in an ancestor's tree.
- When no task lookup preceded the change directory, look up first, because a second task splits
  the change's history.
- When you opened a source file to check something and are editing it, stop, because this skill
  plans and the code belongs to spec-apply.
- When a revision touched the proposal and you have not opened the design, open it, because the
  design may now contradict it.
- When a line stayed ticked because reopening looked like going backwards, reopen it, because
  the progress line is not worth a false checkmark.
- When you are about to create a task for a tasks.md line, stop, because the breakdown is local
  and the task tool holds one task per change.
- When a critique reads as praise, rewrite it as the strongest objection, because praise finds
  nothing.

## Say it in the reply

One line for the binding: task id, found or created. One line per artifact written or revised,
with its path. For a revision: what changed and why, lines reopened and what invalidated them. The
critique findings, one line each, fixed or waived. Last line: apply-ready and waiting for the
person's yes, then whether spec-apply may start or resume, or the open decisions handed to
grilling.
