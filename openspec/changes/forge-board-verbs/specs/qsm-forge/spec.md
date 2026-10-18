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

### Requirement: Add an issue to the board

The GitHub bin SHALL add an issue to the named board, and SHALL set its Status in the same call
when a status is given.

#### Scenario: Issue added with a status

- **WHEN** the caller adds an issue with the status Todo
- **THEN** the issue SHALL be on the board with Status Todo, as the board's own item list then
  shows

#### Scenario: Issue already on the board

- **WHEN** the caller adds an issue that is already an item of the board
- **THEN** the CLI SHALL leave one item, not a second, and apply the status when one is given

### Requirement: Set an issue's board status

The GitHub bin SHALL set the Status of an issue on the board to exactly one of Todo, In Progress
or Done.

#### Scenario: Status moved

- **WHEN** the caller sets an issue's status to In Progress
- **THEN** a read of that issue's board status SHALL answer In Progress

#### Scenario: Unknown status name

- **WHEN** the caller gives a status other than Todo, In Progress or Done
- **THEN** the CLI SHALL fail with a usage error, exit 2, listing the three names, and call
  nothing

#### Scenario: Issue not on the board

- **WHEN** the caller sets the status of an issue that is not on the board
- **THEN** the CLI SHALL fail naming the issue and the board and SHALL NOT add it

### Requirement: Read an issue's board status

The GitHub bin SHALL print an issue's Status on the named board, whatever the board's size.

#### Scenario: Issue on the board

- **WHEN** the caller reads the status of an issue on the board
- **THEN** the CLI SHALL print the issue number and its Status

#### Scenario: Reading an issue that is not on the board

- **WHEN** the caller reads the status of an issue that is not on the board
- **THEN** the CLI SHALL print that it is not on the board, exit 0, rather than an empty status

#### Scenario: Board with more than one page of items

- **WHEN** the board holds more than thirty items and the issue is not among the first thirty
- **THEN** the CLI SHALL still print its Status

### Requirement: Claiming a task is the assignee and In Progress

The GitHub bin SHALL claim an issue by adding it to the board when absent, setting its Status to
In Progress, and assigning it to the caller's own login, and SHALL refuse a claim that would take
an issue another login holds.

#### Scenario: Open unassigned issue claimed

- **WHEN** the caller claims an open issue with no assignee
- **THEN** the issue SHALL show the caller as assignee and Status In Progress

#### Scenario: Issue held by another login

- **WHEN** the caller claims an issue assigned to a different login
- **THEN** the CLI SHALL fail `blocked` naming that login and change nothing

#### Scenario: Claim repeated

- **WHEN** the caller claims an issue already assigned to the caller and In Progress
- **THEN** the CLI SHALL succeed and change nothing

#### Scenario: Closed issue

- **WHEN** the caller claims a closed issue
- **THEN** the CLI SHALL fail `blocked` naming the closed state and change nothing

#### Scenario: Assignment refused after the board changed

- **WHEN** the board update succeeded and the assignment is then refused
- **THEN** the CLI SHALL fail, exit 1, naming the board change as done and the refusal, so a
  second run completes the claim

### Requirement: Done comes from GitHub's built-in project workflows

A merged pull request whose body carries `Closes #N` SHALL show its issue as Done on the board by
GitHub's built-in "Item closed" workflow, not by a qsm-forge verb. The board SHALL have the
workflows "Item closed" and "Pull request merged" enabled, and the CLI SHALL NOT ship a verb
whose only job is to mark a merged issue Done.

#### Scenario: Pull request merged into a protected main

- **WHEN** a pull request with `Closes #N` is merged into the default branch and issue N is on
  the board
- **THEN** issue N SHALL be closed and a read of its board status SHALL answer Done

#### Scenario: Board without the workflow

- **WHEN** the board has "Item closed" switched off
- **THEN** the merged issue SHALL stay at its earlier Status, and `board-set` to Done is the hand
  correction

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
