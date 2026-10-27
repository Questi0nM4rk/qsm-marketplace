## MODIFIED Requirements

### Requirement: Epics hold the intent of a piece of work, tasks hold one spec change

The `task-tool` skill SHALL state the task model in the terms of the main task tool, GitHub Issues.
An epic SHALL be an issue of the organization issue type `Epic` that holds the intent of one piece
of work and its acceptance criteria. Each spec change SHALL have exactly one task, an issue of type
`Task` and a sub-issue of the epic, created together with the spec and never before, whose body
starts with the line `openspec: <change-id>`. Subtasks SHALL NOT be created as issues: the change's
`tasks.md` holds that breakdown. An epic SHALL NOT have a test-it sub-issue: its final proof is the
QA stage. A follow-up, a side finding, a decision to make and tool feedback SHALL each be an issue,
never prose. A fix, a change that needs no spec, SHALL get no epic and no task.

#### Scenario: A spec change is planned

- **WHEN** a spec change is created under an epic
- **THEN** one sub-issue of type Task is created under that epic with it, its body starts with
  `openspec: <change-id>`, and no issue for the change's steps is created

#### Scenario: An epic is split into tasks

- **WHEN** an epic is split into its tasks
- **THEN** no test-it issue is among them, and the epic's Epic stage is Planning until its first
  task is claimed

#### Scenario: A change is looked up before it is bound

- **WHEN** spec-propose looks for the task of change `add-x` with `qsm-tasks find-spec add-x` and an
  issue `add-x-more` exists whose first line is `openspec: add-x-more`
- **THEN** only an issue whose first body line is exactly `openspec: add-x` is the change's task,
  and the task is created with `add --spec` only when `find-spec` printed none

#### Scenario: A fix

- **WHEN** the work is a fix
- **THEN** the agent creates neither an epic nor a task, and the commit message carries the why

#### Scenario: A finding that is not the ask

- **WHEN** the agent finds work while doing another task
- **THEN** it creates an issue that names the task it was working on as where it was discovered

## ADDED Requirements

### Requirement: GitHub Issues is the main task tool, reached through the qsm-tasks verbs

The `task-tool` skill SHALL state that GitHub Issues is the main task tool and SHALL map each step
of working with tasks to a verb of the `qsm-tasks` binary: the ready list, an epic, a task under an
epic, an order between tasks, a claim, a comment, a close, a Status or Epic stage move, the epic
check, a deferral and a feedback task. The skill SHALL tell the agent to create, nest, order,
comment, close and move issues only through those verbs, never through raw `gh`, `jq` or `gh api`
calls, and when a step has no verb to report the gap instead of composing a call. A verb that
fails SHALL be reported with its cause and nothing else done in its place. The skill SHALL name the
`br` tracker and the `.beads` store nowhere.

#### Scenario: A session starts

- **WHEN** a session starts and the agent loads the skill
- **THEN** the first steps it runs are `qsm-tasks ready` and `qsm-tasks list --mine`, and the reply
  names the count and the task it takes

#### Scenario: A verb fails

- **WHEN** a verb exits `failed` because the token lacks the `project` scope
- **THEN** the agent reports the cause and the fix the verb printed, and does not create the issue
  another way

#### Scenario: A step has no verb

- **WHEN** a step of the flow has no `qsm-tasks` verb
- **THEN** the agent says so and does not compose a `gh` call

#### Scenario: A file names the old tracker

- **WHEN** a review finds `br`, `beads` or `.beads` named in a skill, an agent, an instruction file
  or a plugin's code
- **THEN** the mention is removed or replaced with "the task tool" and a pointer to the `task-tool`
  skill

### Requirement: Work not done now is deferred or filed, and feedback has one epic

A task whose work is real but not now SHALL be deferred with `qsm-tasks defer`, never closed
silently and never left open in the ready list. Before creating an issue the agent SHALL search the
title words with `qsm-tasks search` and comment on an existing one instead. Feedback about the
marketplace SHALL be filed with `qsm-tasks feedback`, which finds the issue titled
`Feedback on agents and tools` of type `Epic` in the marketplace repository by title and never by
number, with a title that names the plugin or `marketplace` and a body of what, how and why. A
subagent SHALL create only this kind of issue.

#### Scenario: Real work that is not now

- **WHEN** the agent finds work the person postponed to next month
- **THEN** `qsm-tasks defer` is run with the date, and the task is not in the ready list

#### Scenario: Feedback that already exists

- **WHEN** a subagent meets a tool defect and an open feedback issue already holds its title words
- **THEN** it comments on that issue and creates no second one

#### Scenario: A subagent files feedback from another project

- **WHEN** a subagent runs in a checkout that is not the marketplace
- **THEN** `qsm-tasks feedback` files it in the marketplace repository, not in the checkout's own
  repository

### Requirement: A task closes by merge and an epic closes by the owner's acceptance of QA

The skill SHALL state the close rules. A task SHALL be closed by the merge of a pull request whose
body says `Closes #<n>`, which the board shows as Done; a task with no pull request SHALL be closed
with `qsm-tasks close --reason` and a reason a reader in a month understands. An epic SHALL be
closed only by `qsm-tasks accept`, when every task is done, the QA agent has shown every acceptance
criterion on the real path with no open finding, and the owner has accepted that result. The agent
SHALL NOT close an epic on its own judgement. Finished work with its task left open SHALL be a
failure.

#### Scenario: A task merges

- **WHEN** a pull request with `Closes #N` is merged
- **THEN** task N is closed and the board shows it as Done, and the agent does not close it again

#### Scenario: The last task closes

- **WHEN** the last open sub-issue of an epic closes
- **THEN** the epic's Epic stage becomes Ready For Test by the Action, the agent does not close the
  epic, and its reply says the epic waits for the QA agent

#### Scenario: A decision with no pull request

- **WHEN** a task is a decision settled in conversation and no code changes
- **THEN** it is closed with `qsm-tasks close --reason`, and no pull request is opened for it

#### Scenario: The owner has not accepted

- **WHEN** QA found nothing but the owner has not said the result is accepted
- **THEN** the epic stays open and its stage stays In Test

### Requirement: A task moves by Status, an epic by Epic stage, and the skill says who moves what

The skill SHALL state the flow of each field, the verb that moves each step and who may make the
move, and SHALL NOT make the agent move a step GitHub makes itself. It SHALL NOT copy the option
names or their definitions: it SHALL tell the agent to run `qsm-tasks flow`, which prints them from
the binary. A task SHALL move Todo, In Progress by `claim`, In Review by `review` when its pull
request is open, Ready For Human Review by `human` when CI is green and every finding is fixed, Done
when merged. An epic SHALL move Planning, Building when its first task is claimed, Ready For Test by
the Action when its last sub-issue closes, In Test by `qa` when the QA agent takes it, Blocked by
`finding` when QA files a fix task, back to Ready For Test by the Action when that task closes, and
Done by `accept` on the owner's acceptance. The QA agent SHALL be the only one to run `qa` and
`finding`, and it SHALL test the whole epic against the business request and the acceptance criteria
on the real path. The owner SHALL approve every pull request and accept every epic; the agent SHALL
run `accept`, `reject` or a task's approval only on the owner's explicit word in the conversation.
Pull requests are opened by a bot of the organization, and everything the skill posts SHALL be
written in the owner's name with no mention of an AI or an agent.

#### Scenario: A pull request is opened

- **WHEN** the agent has opened a pull request for a task
- **THEN** it runs `review` on the task, and `human` only when CI is green and every review finding
  is fixed

#### Scenario: QA finds a defect

- **WHEN** the QA agent finds that an acceptance criterion does not hold
- **THEN** it runs `finding` with the defect as title, and when the fix task closes the Action sets
  Ready For Test and QA runs again

#### Scenario: QA finds nothing

- **WHEN** the QA agent has shown every criterion on the real path with no open finding
- **THEN** it reports that to the owner, and the epic stays In Test until the owner says to accept

#### Scenario: The agent is asked what a stage means

- **WHEN** the agent needs the definition of a stage or of done
- **THEN** it runs `qsm-tasks flow` and does not answer from the skill's text

#### Scenario: Something is posted to GitHub

- **WHEN** the skill's steps write a comment, an issue or a field
- **THEN** the text is in the owner's name and names no agent or AI

## REMOVED Requirements

### Requirement: An epic closes only when the work is proven and pushed

**Reason**: The close rule changed: there is no test-it sub-issue and the agent no longer closes an
epic. It is replaced by "A task closes by merge and an epic closes by the owner's acceptance of QA".

**Migration**: The skill and spec-archive state the new rule; an epic at Ready For Test waits for
the QA agent.

### Requirement: One skill names br

**Reason**: The skill still owns every command name, but the tool is GitHub Issues; the ownership
sentence is now part of "GitHub Issues is the main task tool, reached through the qsm-tasks verbs",
and the rule that only the main agent creates tasks, except feedback, is in "Work not done now is
deferred or filed, and feedback has one epic".

**Migration**: Other files keep saying "the task tool" and pointing at the `task-tool` skill.
