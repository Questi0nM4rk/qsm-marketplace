# qsm-plan Specification

## Purpose

qsm-plan is the single entry point for planning work of any size, from a one-commit fix to an
epic that spans sessions. It carries one flow: a business request, grilling into an epic, a plan
that splits the epic into tasks with their specs, and a final test-it task.

## Requirements

### Requirement: The flow runs from business request to a closed epic

The flow SHALL have these steps, each handed on by name: the business request, grilling, plan,
the spec change per task, apply, review, push, archive. The business request is the first
messages of a conversation, before an intent exists, and SHALL NOT be stored apart; the session
archive holds it. Grilling works at the product owner's level (what the work does, how it
behaves, how it looks) and ends in an epic whose description holds the intent of the work and its
acceptance criteria, behind the person's yes. Plan works at the tech lead's level: it splits the
epic into pieces and hands each piece to the spec tool as one spec change with one task, behind
the person's yes to the spec. Developer-level steps (the breakdown in a change's tasks.md, code)
belong to the spec tool's skills and are gated there. "Intent" SHALL mean only the intent of a
piece of work, held by its epic.

#### Scenario: A business request becomes an epic

- **WHEN** a person describes work in the first messages of a conversation and it is larger than a
  fix
- **THEN** the flow SHALL go through grilling to an epic holding the intent and the acceptance
  criteria, and SHALL write the epic only after the person's yes

#### Scenario: The epic is split only after it exists

- **WHEN** an epic with its intent and acceptance criteria exists and the person asks to plan it
- **THEN** the plan skill SHALL split it into pieces and hand each piece to the spec tool, and
  SHALL NOT create a task before the spec for it is written

### Requirement: The plan skill takes the ask in before it sizes it

The plan skill SHALL, before sizing, answer four questions: why we do it,
whether something already covers it, where it is and what it touches, and
whether information is missing that only the user has. It SHALL answer each
from the ask when the ask does, and otherwise search only the source that
answers the open question: memory, the task tool and spec set, the code tree,
or one question to the user. It SHALL NOT probe every source on every ask. It
SHALL hand the questions only the user can answer to the grilling skill, in one
batch. It SHALL NOT run external research, meaning library documentation, the
web, and open source projects, for a fix; for an epic it SHALL record the
research as a decision task under the epic. It SHALL treat a small ask, one
whose text answers all four questions, as understood: restate it in one line
and start.

#### Scenario: An open task carries the same words

- **WHEN** a task tool search finds an open task describing the same
  work
- **THEN** the plan skill SHALL name that task and ask whether this is that
  task before anything else

#### Scenario: A spec requirement already covers the ask

- **WHEN** a spec set search finds a requirement that already covers
  the ask
- **THEN** the plan skill SHALL say so and route to a revision of that spec or to no work
  at all, rather than sizing a new epic

#### Scenario: The ask needs external research

- **WHEN** answering a question needs library documentation, the web, or an
  open source project
- **THEN** the plan skill SHALL raise it as a decision task under the epic and
  SHALL NOT run the research itself for a fix

#### Scenario: Every question is answered and the size is a fix

- **WHEN** the ask answers all four questions and the work is a direct fix
- **THEN** the plan skill SHALL ask no question, SHALL restate the ask with
  its size, and SHALL start the work

#### Scenario: One answer is missing

- **WHEN** one question remains that only the user can answer
- **THEN** the plan skill SHALL hand that question, and only that one, to the
  grilling skill

### Requirement: The plan skill sizes an ask as a fix or an epic

The plan skill SHALL determine, for any planning request, whether the work is a fix or an epic,
and SHALL hand off to the surface that owns that size instead of producing a spec, epic, or note
itself, and SHALL end its reply by naming the next step of the flow for the size it found. A fix
is a commit only, with its why in the message, and SHALL NOT get an epic, a task, or a spec. An
epic is everything else, a one-piece feature included.

#### Scenario: A five-line fix

- **WHEN** the settled decision needs no further design
- **THEN** the plan skill SHALL hand off directly to implementation and
  produce no epic, task, spec, or note

#### Scenario: An epic with settled decisions

- **WHEN** the ask is larger than a fix and its decisions are settled
- **THEN** the plan skill SHALL hand off to grilling to write the epic with its intent and
  acceptance criteria, unless the epic already exists, in which case it SHALL split it

#### Scenario: Open decisions remain

- **WHEN** sizing surfaces a decision the user has not yet settled
- **THEN** the plan skill SHALL hand off to the grilling skill before routing
  further

### Requirement: Open decisions of large work are decision tasks of the epic

The flow SHALL hold the open decisions of work too large to settle in one session as child tasks
of the epic, of kind decision, each settled by grilling and closed with a line recording the
decision. A decision task SHALL NOT carry a spec change. Resolving one SHALL NOT edit the epic's
intent: a decision that contradicts the intent goes back to the person.

#### Scenario: A decision too big for this session

- **WHEN** the destination cannot be fully decided in one round
- **THEN** the plan skill SHALL record each open decision as a decision task under the epic and
  grilling SHALL settle one per session

#### Scenario: A decision contradicts the intent

- **WHEN** settling a decision task contradicts the epic's intent
- **THEN** the skill SHALL return the conflict to the person and SHALL NOT edit the intent

### Requirement: The grilling skill resolves open decisions through the user

The grilling skill SHALL, when a plan or design carries unresolved decisions,
ask the user every currently answerable question in one batch, each carrying
a recommended answer, and SHALL NOT proceed past an unresolved decision that
blocks later questions. When the frontier is empty it SHALL show the settled decisions, the
intent of the work, and its acceptance criteria, and after the person's yes it SHALL write the
intent and the acceptance criteria into the epic. Every round SHALL go through the ask tool with
two to four named options per question, the recommended one first, and an explanation the user
needs before answering SHALL be one short simple reply ending with "Understand?" in the chat
language, after which the next round goes through the ask tool again.

#### Scenario: Several independent decisions are open

- **WHEN** more than one decision has no unmet prerequisite
- **THEN** the grilling skill SHALL present all of them together in one
  round, each with a recommendation, rather than one at a time

#### Scenario: A later decision depends on an earlier one

- **WHEN** a decision cannot be asked before an earlier one is settled
- **THEN** the grilling skill SHALL withhold that question until the round
  that settles its prerequisite

#### Scenario: The frontier is empty

- **WHEN** no open decision is left
- **THEN** the grilling skill SHALL ask for the person's yes to the intent and the acceptance
  criteria, and SHALL write the epic only after it

### Requirement: Every epic has acceptance criteria and a test-it task

The plan skill SHALL ensure an epic carries acceptance criteria written by grilling, and SHALL
add a final task to the epic, test-it, that runs the real path end to end and checks every
criterion. The epic SHALL close only when all its tasks are done, every acceptance criterion
holds, the test-it task passed, and the work is pushed after review; the spec tool's archive
skill checks this rule.

#### Scenario: An epic is split

- **WHEN** the plan skill splits an epic into tasks
- **THEN** the set SHALL include a test-it task that depends on the others

#### Scenario: An epic has no acceptance criteria

- **WHEN** the plan skill is asked to split an epic whose description holds no acceptance criteria
- **THEN** it SHALL hand back to grilling and SHALL NOT split the epic

### Requirement: Plan names ports, never tools

The skills of this plugin SHALL name the roles "the task tool" and "the spec tool", and SHALL NOT
name the binary or the product that serves a role. The commands belong to the plug-in that serves
the role.

#### Scenario: A skill refers to the tracker

- **WHEN** a qsm-plan skill needs to create, find or close a task
- **THEN** it SHALL say so in terms of the task tool and SHALL NOT name a command or a binary

### Requirement: Dependencies

qsm-plan SHALL declare `qsm-tasks` and `qsm-openspec` in the `dependencies` array of its
plugin.json, each for one reason, and SHALL have no fallback for either port:

- `qsm-tasks`: serves the task port, where an epic and its tasks live.
- `qsm-openspec`: serves the spec port, where each piece of an epic gets its spec change.

qsm-plan SHALL NOT depend on `qsm-essentials` or `qsm-knowledge`: it never calls them, and a
hand-off by name is not a dependency.

#### Scenario: The plugin is installed

- **WHEN** qsm-plan is installed
- **THEN** `claude plugin install` installs `qsm-tasks` and `qsm-openspec` with it

### Requirement: Architectural work compares approaches before it is split

The plan skill SHALL, when an epic restructures how parts fit together, put two or three
distinct approaches in front of the user, each with its trade-offs and one of
them recommended, and SHALL NOT split the epic until the user has picked one. It SHALL NOT
compare approaches for a fix or for an epic that adds a bounded feature.

#### Scenario: An architectural ask

- **WHEN** the epic restructures how parts fit together
- **THEN** the plan skill SHALL present two or three distinct approaches with
  their trade-offs and one recommendation, and SHALL record the picked approach
  as a settled decision handed on

#### Scenario: A bounded feature

- **WHEN** the epic adds a bounded feature
- **THEN** the plan skill SHALL skip the approaches step and split the epic

#### Scenario: The user rejects every approach

- **WHEN** the user picks none of the presented approaches
- **THEN** the plan skill SHALL return to the grilling skill and SHALL NOT
  invent a further approach on its own
