# qsm-openspec Specification

## Purpose

qsm-openspec drives spec-first development on top of the OpenSpec CLI.

## Requirements

### Requirement: The OpenSpec CLI is installed and its presence is checkable

The plugin SHALL install the OpenSpec CLI as a global binary reachable on
PATH, and SHALL provide a doctor check that reports the installed version.

#### Scenario: Doctor check after installation

- **WHEN** doctor runs after the CLI is installed
- **THEN** it SHALL report the installed OpenSpec version

#### Scenario: Doctor check with the binary missing

- **WHEN** doctor runs before installation or after the binary was removed
- **THEN** doctor SHALL report the binary missing and SHALL NOT report a
  version

### Requirement: spec-propose creates an apply-ready change

Triggered by a request to propose a change, write a spec for a feature, or
turn a settled brainstorm into a plan, spec-propose SHALL produce a proposal,
a design (where things go, the basic abstractions), delta specs, and tasks.md,
the developer's local breakdown of the change's one task (files, order,
proof), and SHALL run adversarial critique passes before treating the change
as apply-ready. Before the first artifact it SHALL check that the intent and
the decisions are complete, and when they are not it SHALL go back to the
grilling skill instead of guessing. spec-propose SHALL NOT edit code. It SHALL
show the person the spec and the tasks.md and SHALL name spec-apply as the next
step only after the person's yes, because the code does not start before it.

#### Scenario: Settled brainstorm becomes a proposal

- **WHEN** a user hands spec-propose a brainstorm with its open questions
  already resolved
- **THEN** spec-propose SHALL create the proposal, design, delta specs, and
  tasks.md, and SHALL NOT mark the change apply-ready until every required
  artifact and critique pass is present, and SHALL name spec-apply as the
  next step once the person has said yes

#### Scenario: Code does not start without the person's yes

- **WHEN** the change is apply-ready and the person has not yet said yes to
  the spec and the tasks.md
- **THEN** spec-propose SHALL ask for the yes and SHALL NOT hand to spec-apply

#### Scenario: An open decision sends it back to grilling

- **WHEN** the ask leaves a decision or the intent unsettled that the spec
  needs
- **THEN** spec-propose SHALL hand that question to the grilling skill and
  SHALL NOT write an artifact that guesses the answer

### Requirement: spec-apply implements only a complete change

Triggered by a request to implement, apply, or start coding an apply-ready change, spec-apply SHALL
select either inline execution proven by a real run of each scenario, or contract-bound subagent
execution, SHALL track the progress by ticking tasks.md only, and SHALL mark a line complete only
once its code and its verification evidence both exist. spec-apply SHALL NOT create or update tasks
in the task tool. When every line is ticked it SHALL name review through the review agent, then
push, as the next steps, not archive.

#### Scenario: Code without verification

- **WHEN** a line's code has been written but its verification step has not
  run
- **THEN** spec-apply SHALL NOT tick the line

#### Scenario: Every task complete

- **WHEN** the last line of tasks.md is ticked and verified
- **THEN** spec-apply SHALL name review as the next step and SHALL NOT
  archive the change itself

#### Scenario: Plan invalidated during implementation

- **WHEN** implementation shows that a decision the plan assumed no longer
  holds
- **THEN** spec-apply SHALL pause and route the change through spec-propose
  rather than deviating silently

### Requirement: spec-propose revises an existing change without touching code

Triggered by a request to revise a proposal, update a spec, or reconcile a
change whose requirements or design decisions moved, spec-propose SHALL revise
the proposal, design, delta specs, and tasks together so they stay coherent,
and SHALL reopen any tasks.md line a changed decision invalidates. spec-propose SHALL
NOT change planning artifacts and code in the same move.

#### Scenario: A changed decision reopens a task

- **WHEN** a design decision changes after a dependent tasks.md line was
  already ticked
- **THEN** spec-propose SHALL reopen that line rather than leave it ticked
  against a plan it no longer matches

### Requirement: spec-archive merges delta specs into durable specs

Triggered by a request to sync, merge, or update durable specs from a
change's delta specs, or by archiving a change, spec-archive SHALL apply each
ADDED, MODIFIED, REMOVED, and RENAMED requirement into the durable spec set,
SHALL preserve durable content the change does not touch, and SHALL require
strict validation to pass after the merge.

#### Scenario: Merge leaves unrelated requirements untouched

- **WHEN** a change's delta specs modify one requirement in a durable spec
  that holds several
- **THEN** spec-archive SHALL apply only that requirement's delta and SHALL
  leave the others unchanged

#### Scenario: Validation fails after merge

- **WHEN** the merged durable spec set fails strict validation
- **THEN** spec-archive SHALL report the failure and SHALL NOT treat the sync as
  complete

### Requirement: spec-archive gates and archives a completed change

Triggered by a request to archive, finish, or promote a completed change,
spec-archive SHALL block archiving on any unticked tasks.md line, invalid artifact,
failing test, structural-quality regression, or unsynced delta spec, and SHALL
NOT offer a bypass confirmation.
Once every gate passes, spec-archive SHALL present the integration choices:
merge into the base branch locally, open a pull request, or keep the branch,
and SHALL carry out the one the user picks rather than picking for them. After
the chosen one, spec-archive SHALL clean the worktree it worked in.

#### Scenario: An unsynced delta spec blocks archive

- **WHEN** a change has delta specs that were never merged
- **THEN** spec-archive SHALL block and SHALL NOT archive the change

#### Scenario: Every gate passes

- **WHEN** every tasks.md line is ticked, every artifact valid, tests passing,
  structure not regressed, delta specs synced
- **THEN** spec-archive SHALL archive the change

#### Scenario: The user picks merge

- **WHEN** every gate passes and the user picks merging into the base branch
  locally out of the offered integration choices
- **THEN** spec-archive SHALL merge the branch into its base and SHALL then
  clean the worktree it worked in

#### Scenario: The user picks keep

- **WHEN** every gate passes and the user picks keeping the branch out of the
  offered integration choices
- **THEN** spec-archive SHALL leave the branch unmerged and unproposed, and
  SHALL still clean the worktree it worked in

### Requirement: No skill writes without a confirmed OpenSpec root

Every skill that writes artifacts SHALL confirm that the nearest OpenSpec
root belongs to the current repository before writing, and SHALL stop and
offer to initialize one instead of writing into an ancestor repository's
root.

#### Scenario: Nested repository with no root of its own

- **WHEN** a repository nested inside another repository has no OpenSpec
  root of its own
- **THEN** the skill SHALL stop rather than write into the ancestor
  repository's artifacts

### Requirement: A change has one task in the task tool, created with its spec

A change and its task are bound by the task's external reference
`openspec:<change-id>`. The task SHALL be created under the change's epic
through the task tool when the spec is written and never before: spec-propose
SHALL look the reference up first and, finding no task, SHALL create one
carrying the reference, the change name as its title, and the proposal's why as
its description, under the epic the change belongs to. tasks.md is the
developer's local breakdown of that one task, and subtasks SHALL NOT be created
in the task tool. spec-apply SHALL claim the task when implementation starts.
spec-propose SHALL record each changed decision as a comment on it.
spec-archive SHALL close it with a reason naming what was done, SHALL close
every other task bound to the change the same way, and SHALL then check the
epic's close rule without closing the epic early. When no task tool store is
reachable from the repository, spec-propose SHALL stop before writing and
offer to initialize one, and SHALL NOT create the change unbound. The skills
SHALL say "the task tool" and "the spec tool" and never name a binary; the
plug-in that serves the task port holds the commands.

#### Scenario: A task already carries the reference

- **WHEN** a task whose external reference is `openspec:<change-id>` exists
  when spec-propose runs
- **THEN** spec-propose SHALL bind the change to that task and SHALL NOT
  create a second one

#### Scenario: No task carries the reference

- **WHEN** no task carries `openspec:<change-id>` when spec-propose runs
- **THEN** spec-propose SHALL create one with that reference under the epic
  when the spec is written

#### Scenario: tasks.md stays local

- **WHEN** spec-propose writes the breakdown of a change
- **THEN** every line SHALL live in tasks.md and none SHALL become a task in
  the task tool

#### Scenario: No task tool store is reachable

- **WHEN** the repository has no task tool store and none is found above it
- **THEN** spec-propose SHALL stop, offer to initialize one, and SHALL NOT
  write the change

#### Scenario: Archive closes the task

- **WHEN** spec-archive archives a change
- **THEN** the bound task SHALL be closed with a reason naming what was done

#### Scenario: Archive closes the other bound tasks

- **WHEN** spec-archive archives a change that has further tasks bound to it
- **THEN** each of them SHALL be closed with a reason naming what was done

### Requirement: An epic closes only when its close rule holds

After closing the change's task, spec-archive SHALL check the epic's close
rule: every task of the epic is done, every acceptance criterion holds, the
test-it task passed, and the work is pushed after review. It SHALL close the
epic only when all four hold, SHALL leave it open otherwise, and SHALL name
what is missing. A fix, which is a commit only, has no epic and is not touched
by this rule.

#### Scenario: The last task is archived but test-it is open

- **WHEN** archiving closes the last implementation task of an epic and its
  test-it task is still open
- **THEN** spec-archive SHALL leave the epic open and SHALL name the test-it
  task

#### Scenario: The close rule holds

- **WHEN** every task is done, every criterion holds, test-it passed, and the
  work is pushed after review
- **THEN** spec-archive SHALL close the epic with a reason naming what was
  verified

#### Scenario: Work not yet pushed

- **WHEN** every task is done and test-it passed but the work is not pushed
  after review
- **THEN** spec-archive SHALL leave the epic open and SHALL say the push is
  missing

### Requirement: The plugin owns the only openspec skill system

qsm-openspec SHALL be the one place the openspec workflow skills live. The
upstream CLI is the engine underneath, and the plugin SHALL initialise a
project with it so that no upstream prompt is generated (`--tools none`).
Doctor SHALL report a project that carries the upstream-generated
`openspec-*` skills or `opsx` commands, because a second copy of each verb
would sit in every session's context.

#### Scenario: A project someone initialised with upstream prompts

- **WHEN** a project holds the generated `openspec-*` skills or `opsx` commands
- **THEN** doctor SHALL name them and the command that removes them

#### Scenario: A fresh session

- **WHEN** an agent lists its skills in a project with this plugin installed
- **THEN** each openspec verb SHALL appear exactly once, under this plugin

### Requirement: Dependencies

qsm-openspec SHALL declare `qsm-essentials` and `qsm-tasks` in the `dependencies` array of its
plugin.json, each for one reason, and SHALL have no fallback for either. The plugin's skills and
agents are prompts with no code that calls a dependency, so a missing one is not a run-time
failure: Claude Code installs every listed name with the plugin.

- `qsm-essentials`: the core; spec-apply hands disjoint tasks to its subagents skill.
- `qsm-tasks`: serves the task port, where each change's one task is looked up, created, claimed
  and closed.

qsm-openspec SHALL NOT depend on `qsm-plan`: the flow calls the spec port, never the reverse, and a
hand-off to grilling or review by name is not a dependency.

#### Scenario: The plugin is installed

- **WHEN** the plugin is installed
- **THEN** `claude plugin install` installs `qsm-essentials` and `qsm-tasks` with it
