# qsm-tasks Specification

## Purpose

qsm-tasks is the plug-in that serves the task port: the role every plan, spec and review flow names
when it says "the task", answered here by `br` (beads_rust). It holds the task model (what an epic
and a task are, when each is created and when each closes), the install that puts `br` on the
machine, and the one skill that names `br` and its commands. A different tracker would replace this
plug-in and leave its users untouched.

## Requirements

### Requirement: Epics hold the intent of a piece of work, tasks hold one spec change

The `task-tool` skill SHALL state the task model. An epic SHALL hold the intent of one piece of
work and its acceptance criteria. Each spec change SHALL have exactly one task under the epic,
created together with the spec and never before. Subtasks SHALL NOT be created in the tracker: the
change's `tasks.md` holds that breakdown. Every epic SHALL have a final test-it task that runs the
real path end to end. A follow-up, a side finding, a decision to make and tool feedback SHALL each
be a task, never prose. A fix, a change that needs no spec, SHALL get no epic and no task.

#### Scenario: A spec change is planned

- **WHEN** a spec change is created under an epic
- **THEN** one task under that epic is created with it, naming the change, and no task for the
  change's steps is created

#### Scenario: A fix

- **WHEN** the work is a fix
- **THEN** the agent creates neither an epic nor a task, and the commit message carries the why

#### Scenario: A finding that is not the ask

- **WHEN** the agent finds work while doing another task
- **THEN** it creates a task that records the task it was working on as where it was discovered

### Requirement: An epic closes only when the work is proven and pushed

The skill SHALL state the close rule of an epic: every task done, every acceptance criterion
holding, the test-it task passed, and the work pushed after review. After each task closes the
agent SHALL check whether the epic is eligible. A task closes with a reason a reader in a month
understands, and finished work with its task left open, or an epic left open with all its tasks
closed, SHALL be a failure.

#### Scenario: The last task closes, a criterion does not hold

- **WHEN** the last open task of an epic closes but an acceptance criterion has not been shown to
  hold
- **THEN** the epic stays open and the reply names the criterion

#### Scenario: Everything holds

- **WHEN** all tasks are done, all criteria hold, test-it passed and the work is pushed after review
- **THEN** the agent closes the epic with what it delivered and the reply says so

### Requirement: One skill names br

The `task-tool` skill SHALL be the one place in the marketplace that names `br` and its commands,
and every other file SHALL say "the task tool" and point at that skill. A task SHALL be created only
by the main agent, except feedback, which a subagent files into the marketplace tracker.

#### Scenario: Another file names the tracker binary

- **WHEN** a review finds a skill, an agent or an instruction file outside this plugin naming the
  tracker binary
- **THEN** the mention is replaced with "the task tool" and a pointer to the `task-tool` skill

### Requirement: Install puts br on the machine or says how

`scripts/install.ts` SHALL probe for `br` and, when it is missing, report it as a missing
prerequisite with the upstream install line, because no command can install it unattended without
piping a downloaded script into a shell. It SHALL write no file and change nothing when `br` is
present, and a second run SHALL report `already`.

#### Scenario: br is missing

- **WHEN** `br` is not on PATH
- **THEN** the install reports `missing-prereq` naming `br` and the upstream install command, and
  exits non-zero

#### Scenario: br is present

- **WHEN** `br` is on PATH
- **THEN** the install reports `already` and changes nothing

### Requirement: No binary, the install is the doctor

The plugin SHALL ship no binary and no `qsm.json`. A `doctor` verb would report whether `br` is on
PATH, which the install probe already reports with the line to fix it, and everything else the
skill does is a `br` call. The `br` CLI is the contract the skill's callers use.

#### Scenario: A session asks whether the task tool is ready

- **WHEN** the person or an agent needs to know whether the task port is served
- **THEN** running `bun plugins/qsm-tasks/scripts/install.ts` answers it, and `br` itself answers
  everything else

### Requirement: Dependencies

The plugin SHALL declare no plug-in in `dependencies`: the skill reads no other skill, agent or
file, and the core works alone. Its one prerequisite is the `br` binary, checked by the install
probe.

#### Scenario: Installed alone

- **WHEN** only qsm-tasks is installed in a session
- **THEN** the `task-tool` skill loads and every command it names runs with `br` on PATH, and the
  session needs no other plugin
