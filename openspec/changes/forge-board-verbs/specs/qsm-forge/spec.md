## ADDED Requirements

### Requirement: A board is named by owner and project number

Every board verb SHALL take the project owner and the project number as arguments, SHALL NOT
default either, and SHALL take the issue as a number in the repository named by the repository
option or the checkout's origin. It SHALL depend on the issue verbs of `forge-issue-verbs` only
for that number convention and SHALL NOT create or edit an issue's text.

#### Scenario: Board not named

- **WHEN** a board verb runs without the owner or without the project number
- **THEN** the CLI SHALL fail with a usage error, exit 2, naming the missing argument, and call
  nothing

#### Scenario: Board owned by an organization

- **WHEN** the owner is an organization login
- **THEN** the verb SHALL act on that organization's board exactly as on a user's

### Requirement: The board has two fields with fixed options

The board SHALL carry the single-select field Status, for tasks and pull requests, and the
single-select field Epic stage, for epics. The verbs SHALL accept exactly these option names, and
the board SHALL show each one's definition.

| Field | Option | Definition |
| --- | --- | --- |
| Status | Todo | Not started |
| Status | In Progress | Claimed and being built |
| Status | In Review | PR open: CI, the gates and the review bots run; every finding is fixed |
| Status | Ready For Human Review | CI green and no open finding: the owner tests it and approves |
| Status | Done | Definition of done: merged into main with Closes #N, CI green, every review finding fixed, approved by the owner |
| Epic stage | Planning | Intent and acceptance criteria settled in grilling, tasks and specs written |
| Epic stage | Building | Its tasks are being built |
| Epic stage | Ready For Test | Every task is done: waiting for the QA agent |
| Epic stage | In Test | The QA agent tests the whole against the business request on the real path |
| Epic stage | Blocked | QA found a finding: a fix task is open under the epic |
| Epic stage | Done | Definition of done: every task done, every acceptance criterion shown on the real path by the QA agent with no open finding, accepted by the owner |

#### Scenario: A value that is not an option

- **WHEN** a caller passes `--status Blocked` or `--stage "In Review"`
- **THEN** the CLI SHALL fail with a usage error, exit 2, listing the names of that field, and
  call nothing

### Requirement: Set a task's Status or an epic's Epic stage

The GitHub bin SHALL set, with `qsm-forge gh board-set`, exactly one of the Status of a task
(`--status`) or the Epic stage of an epic (`--stage`) on the board. It SHALL read the issue's
type first and SHALL refuse the field that does not belong to the type.

#### Scenario: Task status moved

- **WHEN** the caller sets a task's status to In Review
- **THEN** a read of that task's board status SHALL answer In Review

#### Scenario: Epic stage moved

- **WHEN** the caller sets an epic's stage to In Test
- **THEN** a read of that epic SHALL answer Epic stage In Test and leave its Status as it was

#### Scenario: The field does not match the type

- **WHEN** the caller sets `--stage` on a task, or `--status` on an epic
- **THEN** the CLI SHALL fail, exit 1, naming the issue, its type and the field, and change
  nothing

#### Scenario: Both fields or none

- **WHEN** the caller passes both `--status` and `--stage`, or neither
- **THEN** the CLI SHALL fail with a usage error, exit 2, and call nothing

#### Scenario: Issue not on the board

- **WHEN** the caller sets a field of an issue that is not on the board
- **THEN** the CLI SHALL fail naming the issue and the board and SHALL NOT add it

### Requirement: Read an issue's board status or stage

The GitHub bin SHALL print, with `qsm-forge gh board-status`, an issue's type and its Status (a
task) or its Epic stage (an epic) on the named board, whatever the board's size, and SHALL carry
both in the envelope data as `type`, `status` and `stage`, the one that does not apply null.

#### Scenario: Task on the board

- **WHEN** the caller reads a task that is on the board
- **THEN** the CLI SHALL print the issue number, type Task and its Status

#### Scenario: Epic on the board

- **WHEN** the caller reads an epic that is on the board
- **THEN** the CLI SHALL print the issue number, type Epic and its Epic stage

#### Scenario: Reading an issue that is not on the board

- **WHEN** the caller reads an issue that is not on the board
- **THEN** the CLI SHALL print that it is not on the board, exit 0, rather than an empty status

#### Scenario: Board with more than one page of items

- **WHEN** the board holds more than thirty items and the issue is not among the first thirty
- **THEN** the CLI SHALL still print its Status or Epic stage

### Requirement: Claiming a task is the assignee, In Progress, and its epic Building

The GitHub bin SHALL claim a task, with `qsm-forge gh claim`, by adding it to the board when
absent, setting its Status to In Progress, assigning it to the caller's own login, and moving its
epic from Planning to Building. It SHALL refuse a claim that would take an issue another login
holds, a closed issue, and an epic.

#### Scenario: Open unassigned task claimed

- **WHEN** the caller claims an open task with no assignee whose epic is in Planning
- **THEN** the task SHALL show the caller as assignee and Status In Progress, and its epic SHALL
  show Epic stage Building

#### Scenario: Later task of an epic already Building

- **WHEN** the caller claims a task whose epic is already Building
- **THEN** the epic SHALL stay as it is

#### Scenario: Issue held by another login

- **WHEN** the caller claims an issue assigned to a different login
- **THEN** the CLI SHALL fail `blocked` naming that login and change nothing

#### Scenario: Claim repeated

- **WHEN** the caller claims a task already assigned to the caller and In Progress
- **THEN** the CLI SHALL succeed and change nothing

#### Scenario: Closed issue or an epic

- **WHEN** the caller claims a closed issue, or an issue of type Epic
- **THEN** the CLI SHALL fail `blocked` naming the closed state or the type and change nothing

#### Scenario: A write refused after an earlier one

- **WHEN** the board update succeeded and the assignment or the epic update is then refused
- **THEN** the CLI SHALL fail, exit 1, naming the writes done and the refusal, so a second run
  completes the claim

### Requirement: Done for a task comes from GitHub's built-in project workflows

A merged pull request whose body carries `Closes #N` SHALL show its task as Done on the board by
the built-in workflow "Item closed", not by a qsm-forge verb. The board SHALL have the workflows
"Item closed", "Auto-add to project", "Auto-add sub-issues to project" and "Item added to project"
switched on, and the CLI SHALL NOT ship a verb whose only job is to mark a merged task Done or to
add an issue to the board.

#### Scenario: Pull request merged into a protected main

- **WHEN** a pull request with `Closes #N` is merged into the default branch and issue N is a task
  on the board
- **THEN** issue N SHALL be closed and a read of its board status SHALL answer Done

#### Scenario: A new issue

- **WHEN** an issue is created in the repository
- **THEN** it SHALL be on the board with Status Todo within seconds, with no verb call

#### Scenario: Board without the workflow

- **WHEN** the board has "Item closed" switched off
- **THEN** the merged task SHALL stay at its earlier Status, and `board-set --status Done` is
  the hand correction

### Requirement: An epic reaches Ready For Test when its last sub-issue closes

A workflow file in this repository, `.github/workflows/epic-stage.yml`, SHALL run when an issue
closes and SHALL set the Epic stage of the issue's parent to Ready For Test when the parent is an
epic, no sub-issue of it is open, and its stage is Building or Blocked. It SHALL use `gh` only,
SHALL authenticate to the project with a repository secret, SHALL change no other field, and SHALL
post nothing.

#### Scenario: The last task closes

- **WHEN** the last open sub-issue of an epic in stage Building closes
- **THEN** the epic's Epic stage SHALL become Ready For Test within a minute

#### Scenario: A task closes while others are open

- **WHEN** a sub-issue closes and another sub-issue of the epic is still open
- **THEN** the epic's Epic stage SHALL stay as it is

#### Scenario: A fix task closes under a blocked epic

- **WHEN** the only open sub-issue of an epic in stage Blocked, a fix task, closes
- **THEN** the epic's Epic stage SHALL become Ready For Test

#### Scenario: An epic under test

- **WHEN** a sub-issue closes under an epic whose stage is In Test, Ready For Test, Planning or
  Done
- **THEN** the epic's Epic stage SHALL stay as it is

#### Scenario: An issue with no epic

- **WHEN** an issue with no parent, or with a parent that is not an Epic, closes
- **THEN** the workflow SHALL change nothing

#### Scenario: The project refuses the token

- **WHEN** the secret is missing or lacks the project scope
- **THEN** the run SHALL fail visibly in the Actions tab and the stage SHALL stay as it was

### Requirement: A refused board call fails loud and does nothing else

A board verb SHALL fail with the cause GitHub or `gh` gave, naming the issue and the board, when
GitHub refuses the call, and SHALL NOT retry or take another route.

#### Scenario: Token without the project scope

- **WHEN** the login lacks the `project` scope
- **THEN** the CLI SHALL fail, exit 1, with the refusal and the one command that grants the
  scope, and change nothing

#### Scenario: No such project

- **WHEN** the owner has no project with that number
- **THEN** the CLI SHALL fail, exit 1, naming owner and number, and not create one
