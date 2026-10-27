---
name: plan
description: "Use when an ask needs sizing before anything is built: a fix, a feature, a plugin change, a restructure, or a project that will span sessions; and when an epic exists and must be split into tasks. Triggers: plan this, naplanuj, spec this out, break this down, split this epic, help me design this, how big is this, what do we build first, chci udelat projekt, /plan. Takes the ask in, sizes it as a fix or an epic, routes a fix to a commit and an epic through grilling, then splits the epic into tasks that each get a spec. Writes no code and no note. Settling open decisions is grilling."
---

# Plan

Most asks arrive at the wrong size: a five-line fix dressed as a project, or a project dressed as a
question. This skill serves the person who is product owner, tech lead and reviewer of a one-person
shop and wants the work to start at its right depth and no deeper. It is the tech lead's step of the
qsm flow: it takes the ask in, sizes it, and either sends a fix straight to a commit or carries an
epic from the person's yes to a set of tasks, each with its own spec. The scope is smaller than it
looks, so the most minimal route that does the job is the right one.

The flow, so each step knows its neighbours:

1. **Business request**: the first messages of a conversation, before an intent exists. It is not
   stored; the session archive holds it.
2. **Grilling** (product owner: what it does, how it behaves, how it looks) first reads the ask as
   a top professional would (what they would ask, the raw material, the methods, the outside judge),
   then writes the epic with the intent and the acceptance criteria. Gate: the person's yes.
3. **Plan** (this skill, tech lead): splits the epic into pieces; each piece gets a spec change
   and its task, together. Gate: the person's yes to the spec.
4. **Spec change**: spec-propose writes it and tasks.md, the developer's breakdown. Gate: the
   person's yes before code.
5. **Apply, review, push, archive**: the review agent reads the work, the work is pushed, archive
   closes the task.

Work is named in roles: "the task tool" holds epics and tasks, "the spec tool" holds the specs.
Never name a command or a product here; the plug-in that serves the role has the commands. If a
role has no plug-in installed, stop with `missing` and name what to install: qsm-tasks for the
task tool, qsm-openspec for the spec tool.

## Take the ask in

Four questions, each answered by the ask when it can be and by the one source that fits when it
cannot:

| Question | When the ask answers it | When not, where to look |
| --- | --- | --- |
| Why are we doing it? | go on | memory (was it decided before?) |
| Does something already cover it? | go on | the task tool, the spec tool |
| Where is it, what does it touch? | go on | code |
| How is this kind of thing built here? | go on | the project's `AGENTS.md` or `CLAUDE.md` and the builder skill it names |
| Is information missing that only the user has? | go on | one question to the user |

A small ask is one where the text answers all four: restate it in one line with its size and
start. Otherwise search only the source that answers the open question, because a search the ask
did not need costs more than the ask.

What a hit means: a decision already in memory is settled, so carry it and do not reopen it; an
open task with the same words is named to the user before anything else; a spec requirement that
covers the ask routes to a revision of that spec, or to no work. What only the user has goes to
grilling in one batch, and one missing answer is one question.

Library documentation, the web, or an open source project is external research. For a fix it does
not run, because the ask is smaller than the research. For an epic it becomes a decision task
under the epic; say which question it settles.

## Size the ask

Say the destination in one sentence, then pick the smaller size that holds it.

| Size | The test | Route |
| --- | --- | --- |
| fix | the decision is settled and needs no design | implement and commit, the why in the message; no epic, no task, no spec |
| epic | anything larger, a one-piece feature included | grilling writes the epic, then this skill splits it |

A restructure of how parts fit together is an epic even when it sounds small, because its cost is
the decisions, not the lines. Decisions too big for one session become decision tasks under the
epic, settled one per session by grilling. A second sizing round with no new facts is fog: name
the decisions and go to grilling.

## Approaches, for a restructuring epic only

Give two or three approaches of a different shape, each with its trade-offs and one with your
recommendation, then wait for the user's pick; it travels as settled. If he picks none, the
constraints are wrong: go back to grilling instead of inventing a fourth.

## Split an epic

Needs an epic with its intent and acceptance criteria. If the criteria are missing, go back to
grilling; splitting guesses what done means.

1. **Cut pieces that are demoable alone**, in dependency order, each small enough for one spec
   change. Name each piece with the criteria it serves.
2. **Add the last piece, test-it**: it runs the real path end to end, a fresh session using the
   result as its user would, and checks every acceptance criterion. It depends on all others.
3. **Hand each piece to spec-propose**, which writes the spec change and creates its task under
   the epic in the same move. A task is never created before its spec, so none sits in the tool
   with nothing behind it.
4. **Show the person the pieces and their specs** and wait for the yes before any code, because
   the split is the tech lead's decision and the person holds it.

The epic closes only when all its tasks are done, every criterion holds, test-it passed, and the
work is pushed after review; spec-archive checks it.

## Hand off once

| Surface | Owns |
| --- | --- |
| grilling | the questions only the user can answer, and writing the epic |
| spec-propose | one piece: its spec change, tasks.md and its task |
| spec-apply | the code of an apply-ready change |
| implementation | a fix |

The surface that owns an artifact owns its whole choreography, so repeating any of it here gives
two versions of one decision.

## Red flags

- When you are about to search before checking what the ask already says, stop and fill the table
  from the ask first, because most small asks answer all four.
- When you are writing a spec, an epic or a note here, hand off instead, because the owning
  surface holds the artifact.
- When you are about to create a task, check its spec exists, because a task comes with its spec.
- When a fix is growing an epic or a spec, stop: either it is a fix or it needs grilling first.
- When a relayed claim from a meeting or a colleague is load-bearing, mark it unverified in the
  handoff, because it is a claim until a repository, document or owner confirms it.

## Say it in the reply

One line naming the size and the route: "epic, going to grilling for the intent and the criteria".
Before it, the one line a search produced if there was one (the open task, the requirement that
already covers the ask). For a restructuring epic, the picked approach in one sentence. After a
split, the pieces as a list, one line each, test-it last. No plan document in chat.
