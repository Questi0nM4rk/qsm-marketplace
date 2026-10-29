## ADDED Requirements

### Requirement: One binary, qsm-tasks, serves the task port

The plugin SHALL ship one binary `qsm-tasks`, named after the plugin, whose verbs are described in
`qsm.json` and whose noun is `$.tasks`, so a person, a script and a hook reach the same logic: a
hook calls `$.tasks.<verb>()` where a person runs `qsm-tasks <verb>`. The binary SHALL cover every
step of the task flow, from the ready list to the acceptance of an epic, so that no step needs a
raw `gh`, `jq` or GraphQL call. The binary SHALL NOT touch pull requests, review threads or git
state. Its verbs SHALL be: `ready`, `list`, `show`, `tree`, `search`, `notes`, `board`, `epic`,
`add`, `feedback`, `finding`, `edit`, `move`, `after`, `unblock`, `assign`, `spec`, `find-spec`,
`note`, `claim`, `release`, `review`, `human`, `reopen`, `close`, `drop`, `defer`, `plan`, `qa`,
`accept`, `reject`, `doctor`, `setup` and `flow`.

#### Scenario: A step of the flow needs a task operation

- **WHEN** an agent has to create a sub-issue, order two tasks, claim a task or move an epic to a
  stage
- **THEN** one `qsm-tasks` verb does it, and the agent composes no backend call

#### Scenario: A gap is found

- **WHEN** a step of the flow has no verb
- **THEN** the binary gains the verb and its scenario in `qsm.json` and this spec, and no skill
  tells the agent to call a raw API

#### Scenario: A hook calls the same logic

- **WHEN** a hook calls `$.tasks.ready({ epic: 12 })`
- **THEN** it gets the `data` the shell's `qsm-tasks ready --epic 12 --json` prints

### Requirement: Every verb prints deterministic text and the standard envelope

Every verb SHALL print text an agent reads without parsing and, with `--json`, the envelope of
`lib/cli-base.ts` whose `data` carries the same facts. A list row SHALL be
`#<n> [<Status or Epic stage>] <title>` followed by `@<login>` when assigned and by the text
`blocked by` and the open blockers' numbers when any exist, and an epic row SHALL add its done and
total sub-issue counts as `done/total`. A list SHALL be in
ascending issue number unless the verb says otherwise, and an empty list SHALL print `none`. A
write verb SHALL print one line per write, `#<n> <from> -> <to>`, so a side effect on an epic is its
own line. The `data` of an item SHALL be `{ number, url, title, kind, state, status, stage,
assignee, parent, blockedBy, labels, subIssues: { total, completed } }`, and a write verb's `data`
SHALL add `changes: [{ number, field, from, to }]`. No output SHALL carry a node id, a field id, an
option id or a backend's own shape. Output SHALL carry no colour, no relative time and no emoji.

#### Scenario: The same call twice

- **WHEN** a list verb runs twice and nothing changed
- **THEN** both outputs are byte-identical

#### Scenario: A write that touches two issues

- **WHEN** `claim` moves a task to In Progress and its epic from Planning to Building
- **THEN** two lines print, `#12 Todo -> In Progress` and `#3 Planning -> Building`, and `changes`
  holds both

#### Scenario: Nothing matches

- **WHEN** `ready` finds no task
- **THEN** it prints `none`, exits `ok` and `data.items` is empty

### Requirement: A failure is a typed outcome with a reason, and nothing else runs

Every verb SHALL fail with one of the marketplace's outcome codes and a stable `data.reason`, naming
the cause and, when there is one, the single fix as `next`. A wrong call SHALL exit `usage` (2)
before any backend call. An absent prerequisite SHALL exit `missing` (4) with reason `no-gh`,
`no-login`, `no-repo`, `no-board`, `no-feedback-epic` or `no-file`. A flow rule refusing the move
SHALL exit `blocked` (5) with reason `wrong-stage`, `held`, `epic-done`, `open-children` or
`wrong-kind`, naming the rule and the current value. A refusal by the backend or an issue that does
not exist SHALL exit `failed` (1) with reason `refused` carrying the backend's words, or
`not-found`. A verb SHALL NOT retry, take a second route, roll back or continue after a refusal, and
SHALL introduce no outcome code beyond the marketplace's. A verb of several writes SHALL order them
so the likeliest refusal is first and an epic's write last, SHALL make each write idempotent, and a
failure SHALL name the writes already done so a repeat finishes the work.

#### Scenario: A wrong call runs nothing

- **WHEN** a verb is called with an unknown flag, a missing required argument or a value outside its
  choices
- **THEN** it exits `usage` and the recorded backend calls are empty

#### Scenario: The token lacks the project scope

- **WHEN** the login has no `project` scope
- **THEN** the verb exits `failed` with reason `refused`, the backend's words in the message and
  `next` set to `gh auth refresh -s project`, and nothing is created another way

#### Scenario: No repository

- **WHEN** a verb runs with no `--repo` outside a git checkout
- **THEN** it exits `missing` with reason `no-repo` and does not guess one

#### Scenario: A second write is refused

- **WHEN** the board write of `claim` succeeded and the assignment is then refused
- **THEN** the verb exits `failed` naming the write done and the refusal, and running it again
  completes the claim

### Requirement: The repository and the board are resolved, not configured

A verb SHALL act on the repository named by `--repo owner/name`, else on the origin remote of the
working directory. It SHALL act on the board named by `--project owner/number`, else on the one
Projects v2 board linked to the repository; no linked board SHALL exit `missing` with reason
`no-board` and several SHALL exit `usage` naming `--project`. The binary SHALL store no default for
either. `feedback` SHALL always act on the marketplace repository, taken from the checkout that
`QSM_MARKETPLACE` names, whatever the working directory.

#### Scenario: Inside the repository

- **WHEN** a verb runs in a checkout whose origin is `qsmark-labs/qsm-marketplace`
- **THEN** it acts on that repository and on Project #1, the one board linked to it

#### Scenario: The board moves

- **WHEN** the repository is linked to a different board
- **THEN** the verbs act on that board with no file edited

#### Scenario: Feedback from another project

- **WHEN** a subagent runs `feedback` in a checkout that is not the marketplace
- **THEN** the issue is made in the marketplace repository

### Requirement: Read verbs

`ready` SHALL list open tasks whose Status is Todo, that no open issue blocks, that are not of kind
Epic and do not carry the label `deferred`, optionally under `--epic <n>`. `list` SHALL list issues
by `--epic`, `--status` (a Status), `--stage` (an Epic stage, which lists epics), `--mine` (assigned
to the caller), `--blocked`, `--label` and `--state` (open by default), up to `--limit`. `show <n>`
SHALL print an item's facts, blockers, sub-issue counts and body. `tree <epic>` SHALL print the epic
and its sub-issues one level below with Status, assignee and blockers. `search "<words>"` SHALL
search title and body in any state and print each row with its kind and state. `notes <n>` SHALL
print the comments oldest first as `<date> <login>: <text>`, at most `--limit`. `board` SHALL print
the count of tasks per Status and of epics per Epic stage, zero included, in flow order. A list that
reaches its limit SHALL say it is cut, as a warning, and still exit `ok`.

#### Scenario: A blocked task is not ready

- **WHEN** task 2 is blocked by open task 1 and `ready` runs
- **THEN** task 1 is listed and task 2 is not

#### Scenario: A closed blocker no longer blocks

- **WHEN** task 2 was blocked by task 1 and task 1 is closed
- **THEN** task 2 is listed

#### Scenario: An epic, a claimed task and a deferred task are not ready

- **WHEN** an open epic with no blocker, a task In Progress and a task labelled `deferred` exist
- **THEN** none of them is listed by `ready`, and the open Todo tasks of the epic are

#### Scenario: The epic at a glance

- **WHEN** `tree` runs on an epic with three tasks, one done
- **THEN** it prints the epic's stage and `1/3`, then each task with Status, assignee and blockers

#### Scenario: Counts per stage

- **WHEN** `board` runs
- **THEN** every Status and every Epic stage is listed with its count, including zero

#### Scenario: A bigger list than the limit

- **WHEN** more issues match than `--limit`
- **THEN** `limit` rows print, a warning says the list is cut, and the exit is `ok`

### Requirement: Create verbs

`epic "<goal>" --intent <file or ->` SHALL create an issue of kind Epic whose body is the intent and
SHALL set its Epic stage to Planning. `add "<title>"` SHALL create a Task, optionally a sub-issue of
`--epic`, blocked by `--after`, bound to a change by `--spec`, with `--body` or `--body-file` and
`--label`; it SHALL leave an epic at Ready For Test or In Test at Building and SHALL refuse an epic
at Done with reason `epic-done`. `feedback "<title>"` SHALL find the open issue of
kind Epic titled exactly `Feedback on agents and tools` in the marketplace repository and, when an
open issue under it already has the same title, comment the body there; otherwise create a Task
under it. `finding <epic>
"<title>"` SHALL create a Task under an epic In Test and set the epic to Blocked. Body text SHALL
reach the backend as a file or stdin, never as an argument. Every create SHALL print the new
number and URL.

#### Scenario: An epic is created

- **WHEN** `epic "Report export" --intent intent.md` runs
- **THEN** an issue of kind Epic exists with the file's text as body and Epic stage Planning

#### Scenario: A task under an epic, after another

- **WHEN** `add "Write the writer" --epic 3 --after 5 --spec add-writer` runs
- **THEN** a Task exists as a sub-issue of 3, blocked by 5, whose body starts with
  `openspec: add-writer`

#### Scenario: A body with backticks

- **WHEN** a body holds backticks, quotes and a dollar sign
- **THEN** the issue body is that text unchanged

#### Scenario: Feedback already filed

- **WHEN** `feedback` runs with a title an open feedback issue already has
- **THEN** the body is added as a comment on it, no issue is created and `data.created` is false

#### Scenario: Feedback epic missing

- **WHEN** no open issue titled `Feedback on agents and tools` of kind Epic exists
- **THEN** `feedback` exits `missing` with reason `no-feedback-epic` and `next` set to
  `qsm-tasks setup`

#### Scenario: A task added to an epic that was ready for test

- **WHEN** `add --epic` names an epic at Ready For Test
- **THEN** the task is created and the epic's stage becomes Building, as two lines of output

#### Scenario: Both body sources or none of a title

- **WHEN** a create verb gets both `--body` and `--body-file`, or no title
- **THEN** it exits `usage` and creates nothing

### Requirement: Edit verbs

`edit <n>` SHALL change `--title` and `--body` or `--body-file` and keep an existing
`openspec: <change-id>` first body line when the new body has none. `move <n> --epic <m>` SHALL make
the task a sub-issue of epic m, leaving an earlier parent. `after <n> <blocker>` SHALL record that n
is blocked by the blocker and `unblock <n> <blocker>` SHALL lift it. `assign <n>` SHALL assign the
caller, or `--login`, without changing Status. `spec <n> <change-id>` SHALL write the first body
line `openspec: <change-id>`, replacing an earlier one. `find-spec <change-id>` SHALL print the one
issue, in any state, whose first body line is exactly `openspec: <change-id>`, or `none`, and SHALL
never match a longer id that begins with it. `note <n> "<text>"` SHALL add one comment with the text
unchanged. A relation the backend refuses (a cycle, a missing issue, a parent in another
repository) SHALL exit `failed` carrying its cause and change nothing; `unblock` of a blocker the
task does not have SHALL exit `failed` naming both numbers.

#### Scenario: The binding is exact

- **WHEN** issues bound to `add-x` and `add-x-more` exist and `find-spec add-x` runs
- **THEN** only the issue bound to `add-x` is printed

#### Scenario: An unbound change

- **WHEN** no issue carries the line
- **THEN** `find-spec` prints `none`, exits `ok` and `data.task` is null

#### Scenario: A body edit keeps the binding

- **WHEN** `edit --body` replaces the body of a task bound to `add-x` with text that does not start
  with the binding
- **THEN** the body starts with `openspec: add-x` followed by the new text

#### Scenario: Order added then lifted

- **WHEN** `after 2 1` then `unblock 2 1` run
- **THEN** after the first 2 is not listed by `ready` and after the second it is

#### Scenario: A dependency cycle

- **WHEN** `after 1 2` runs while 2 is blocked by 1
- **THEN** it exits `failed` carrying the backend's cause and changes nothing

#### Scenario: Removing a dependency that is not there

- **WHEN** `unblock 2 9` runs and 2 is not blocked by 9
- **THEN** it exits `failed` naming 2 and 9 rather than report a removal

#### Scenario: A comment is posted

- **WHEN** `note 12 "measured: 40 ms"` runs
- **THEN** that text is the issue's last comment, unchanged, with no footer

### Requirement: Task flow verbs

A task SHALL move by Status in this order: Todo, In Progress, In Review, Ready For Human Review,
Done. `claim <n>` SHALL need Status Todo and an unassigned task or one the caller holds, assign the
caller, set In Progress, add the task to the board when it is not there, and move its epic from
Planning to Building; a repeat by the holder SHALL change nothing. `release <n>` SHALL need In
Progress, unassign and set Todo, and SHALL remove the label `deferred`. `review <n>` SHALL need In
Progress or Ready For Human Review and set In Review. `human <n>` SHALL need In Review and set Ready
For Human Review. `reopen <n>` SHALL need a closed task, open it and set Todo, and SHALL set an epic
at Ready For Test or In Test to Building. `close <n> --reason "<what was done>"` SHALL close an open
task as completed with the reason as a comment, for work no merge closes. `drop <n> --reason` SHALL
close an open task as not planned with the reason as a comment. `defer <n> --until <date or
condition>` SHALL unassign, set Todo, add the label `deferred` and comment `Deferred until <value>`.
No verb SHALL mark a merged task Done. A verb SHALL refuse an epic where it needs a task, with
reason `wrong-kind`, and a move its guard does not allow, with reason `wrong-stage`, naming the
current value and changing nothing.

#### Scenario: A task is claimed

- **WHEN** `claim` runs on an open unassigned Todo task whose epic is Planning
- **THEN** the task has the caller as assignee and Status In Progress, and its epic is Building

#### Scenario: A later task of a building epic

- **WHEN** `claim` runs on a task whose epic is already Building
- **THEN** the epic is unchanged

#### Scenario: Held by someone else

- **WHEN** `claim` runs on a task assigned to another login
- **THEN** it exits `blocked` with reason `held` naming that login and changes nothing

#### Scenario: The claim is repeated

- **WHEN** the holder claims a task that is already In Progress
- **THEN** it exits `ok` and nothing changes

#### Scenario: A skipped step

- **WHEN** `human` runs on a task In Progress
- **THEN** it exits `blocked` with reason `wrong-stage` naming In Progress and In Review

#### Scenario: A claim on an epic or a closed issue

- **WHEN** `claim` runs on an Epic or on a closed task
- **THEN** it exits `blocked` with reason `wrong-kind` or `wrong-stage` and changes nothing

#### Scenario: A finding on a task in review

- **WHEN** a review finding appears while the task is Ready For Human Review and `review` runs
- **THEN** the task is In Review

#### Scenario: A task is deferred and comes back

- **WHEN** `defer 14 --until 2026-12-01` runs, then later `release 14`
- **THEN** after the first `ready` does not list 14 and its last comment says `Deferred until
  2026-12-01`, and after the second the label is gone and `ready` lists it

#### Scenario: Close without a pull request

- **WHEN** `close 9 --reason "decided: keep the existing table"` runs on an open task
- **THEN** the task is closed as completed with that comment, and `close` without `--reason` exits
  `usage`

#### Scenario: Not planned

- **WHEN** `drop 9 --reason "superseded by 12"` runs
- **THEN** the task is closed as not planned with that comment

### Requirement: Epic flow verbs

An epic SHALL move by Epic stage in this order: Planning, Building, Ready For Test, In Test,
Blocked, Done. `plan <epic>` SHALL need Planning, Building or Blocked and set Planning. `qa <epic>`
SHALL need Ready For Test and no open sub-issue, and set In Test. `finding <epic> "<title>"` SHALL
need In Test, create a Task under the epic and set Blocked. `accept <epic>` SHALL need In Test and
no open sub-issue, set Done and close the epic as completed. `reject <epic> --reason "<text>"` SHALL
need In Test, create a Task under the epic whose title is the reason, and set Building. A verb SHALL
refuse a task where it needs an epic, with reason `wrong-kind`, and a refused guard SHALL change
nothing. The binary SHALL close an epic only through `accept`.

#### Scenario: QA takes an epic

- **WHEN** every sub-issue of an epic is closed, its stage is Ready For Test and `qa` runs
- **THEN** its stage is In Test

#### Scenario: QA before the work is done

- **WHEN** `qa` runs on an epic at Building
- **THEN** it exits `blocked` with reason `wrong-stage`, and when the stage is right but a
  sub-issue is open, with reason `open-children`

#### Scenario: QA finds a defect

- **WHEN** `finding 3 "export drops the last row"` runs on an epic In Test
- **THEN** a Task exists under epic 3 and the epic is Blocked, and when that task closes the Action
  sets Ready For Test

#### Scenario: The owner accepts

- **WHEN** `accept 3` runs on an epic In Test with no open sub-issue
- **THEN** the epic's stage is Done and the issue is closed as completed

#### Scenario: Accept before QA

- **WHEN** `accept 3` runs on an epic at Ready For Test
- **THEN** it exits `blocked` with reason `wrong-stage` and the epic stays open

#### Scenario: The owner rejects

- **WHEN** `reject 3 --reason "numbers disagree with the invoice"` runs on an epic In Test
- **THEN** a Task with that title exists under the epic and the epic is Building, so the Action
  moves it to Ready For Test when that task closes

#### Scenario: Re-planning

- **WHEN** `plan 3` runs on an epic at Building
- **THEN** its stage is Planning

### Requirement: The two flows and their definitions are one table the verbs read

The plugin SHALL hold both flows in `lib/flow.ts` as data: the Status options Todo, In Progress, In
Review, Ready For Human Review and Done, the Epic stage options Planning, Building, Ready For Test,
In Test, Blocked and Done, each with the definition the board shows, and for each verb its guard and
its effect. The verbs, `flow`, `doctor` and `setup` SHALL read that table and no other copy of a
name or a definition SHALL exist in the binary. The definitions SHALL be these, and the verbs
and the board SHALL use the option names exactly:

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

`flow` SHALL print both flows, both definitions of done and, per verb, its guard and effect, from
that table. A value that is not an option SHALL exit `usage` listing the options of its field before
any backend call. The field SHALL match the kind: Epic stage only on an Epic and Status only on a
Task, because the board's views filter on it and an issue with the wrong field vanishes from its
view.

#### Scenario: The flow is printed

- **WHEN** `qsm-tasks flow` runs
- **THEN** it prints the Status order, the Epic stage order, both definitions of done and each
  verb's guard and effect, byte-identical to the table in `lib/flow.ts`

#### Scenario: A value that is not an option

- **WHEN** `list --status Blocked` or `list --stage "In Review"` runs
- **THEN** it exits `usage` listing the names of that field and calls nothing

#### Scenario: A name drifts on the board

- **WHEN** the board's option is renamed and a verb writes it
- **THEN** the verb exits `failed` with the backend's words, and `doctor` names the option that
  differs from the table

### Requirement: Done for a task and Ready For Test for an epic are GitHub's

A merged pull request whose body says `Closes #N` SHALL close task N and the board's built-in
workflow "Item closed" SHALL set its Status Done, not a verb. The board SHALL have the workflows
"Auto-add to project", "Auto-add sub-issues to project", "Item added to project" and "Item closed"
switched on. A workflow file in this repository, `.github/workflows/epic-stage.yml`, SHALL run when
an issue closes and SHALL set the Epic stage of the issue's parent to Ready For Test when the parent
is an Epic, no sub-issue of it is open and its stage is Building or Blocked. It SHALL use `gh` only,
SHALL authenticate to the project with the repository secret `PROJECT_TOKEN`, SHALL change no other
field, SHALL post nothing and SHALL serialise two closes under one parent.

#### Scenario: A pull request is merged into a protected main

- **WHEN** a pull request with `Closes #N` merges into the default branch and N is a task on the
  board
- **THEN** N is closed and `show N` prints Status Done

#### Scenario: The last task closes

- **WHEN** the last open sub-issue of an epic at Building closes
- **THEN** the epic's stage becomes Ready For Test within a minute

#### Scenario: A task closes while others are open

- **WHEN** a sub-issue closes and another is still open
- **THEN** the epic's stage is unchanged

#### Scenario: A fix task closes under a blocked epic

- **WHEN** the only open sub-issue of an epic at Blocked closes
- **THEN** the epic's stage becomes Ready For Test

#### Scenario: Any other stage

- **WHEN** a sub-issue closes under an epic at Planning, Ready For Test, In Test or Done
- **THEN** the epic's stage is unchanged

#### Scenario: An issue with no epic

- **WHEN** an issue with no parent, or whose parent is not an Epic, closes
- **THEN** the workflow changes nothing

#### Scenario: The project refuses the token

- **WHEN** the secret is missing or lacks the project scope
- **THEN** the run fails visibly in the Actions tab and the stage stays as it was

### Requirement: The backend is behind one interface

The binary SHALL reach the backend only through the `Backend` type of `lib/backend.ts`, stated in
backend-neutral words, and the GitHub implementation under `lib/github/` SHALL be the only code that
names `gh`, an issue type, a project field, a node id or a GraphQL query. The verbs and the flow
table SHALL import the type only. One place SHALL choose the implementation. Calls to the backend
SHALL go through one `Run` function so a test hands it a recorded answer. A second backend SHALL be
another implementation of the type in this plugin, and a plugin that serves the same verbs under its
own binary SHALL replace this plugin for a user without any consumer changing the verb it calls.

#### Scenario: A verb is tested without GitHub

- **WHEN** a flow test runs a verb against a recording backend
- **THEN** it asserts the writes the backend received and needs no `gh`

#### Scenario: The backend leaks nothing

- **WHEN** any verb prints text or `--json`
- **THEN** no node id, field id, option id or GraphQL shape appears in it

### Requirement: doctor checks every part of the task tool and names each fix

`qsm-tasks doctor` SHALL print one line per check with `ok`, `failed` or `manual`, and exit `ok`
when every check is `ok`, `partial` when only `manual` ones remain, and `missing` or `failed` with
the cause otherwise. It SHALL check: `gh` on PATH, its login and the `project` scope; the
repository and the one linked board; the issue types Epic and Task; the two fields with exactly the
option names and definitions of the flow table; the label `deferred`; the feedback
epic; the built-in workflows that must be on; the views Tasks and Epics; the file
`.github/workflows/epic-stage.yml` with names that are options of the board; and the secret
`PROJECT_TOKEN`. Each failing line SHALL name its fix: a `qsm-tasks setup` or the one place in the
web UI. A check the backend cannot read SHALL be `manual` and SHALL NOT be reported `ok`.

#### Scenario: Everything is set

- **WHEN** the board, fields, labels, workflows, views, Action and secret are in place
- **THEN** every line is `ok` and the exit is `ok`

#### Scenario: A field option is missing

- **WHEN** the board has no Epic stage option In Test
- **THEN** that line is `failed`, names `qsm-tasks setup` as the fix, and the exit is `failed`

#### Scenario: A built-in workflow is off

- **WHEN** "Item closed" is off
- **THEN** that line is `failed` and names the project's Workflows page in the web UI

#### Scenario: gh is missing

- **WHEN** `gh` is not on PATH
- **THEN** `doctor` exits `missing` naming `gh` and no other check runs

### Requirement: setup creates what the API allows and names the rest

`qsm-tasks setup` SHALL, for a repository and its board, create what the API allows and nothing
else: the two single-select fields with every option and its definition from the flow table, the
missing issue types Epic and Task, the label `deferred`, and the issue titled
`Feedback on agents and tools` of kind Epic. It SHALL change nothing that exists, so a second run
does nothing and says so, and SHALL print what it cannot create (the views, the built-in workflows,
the secret, the Action file) as the lines `doctor` prints for them.

#### Scenario: A new board

- **WHEN** `setup` runs against a board with no fields
- **THEN** both fields exist with all options and their definitions, and the lines for the views,
  the workflows and the secret are printed as `manual`

#### Scenario: Run twice

- **WHEN** `setup` runs a second time
- **THEN** it creates nothing, changes nothing and says everything is in place

### Requirement: The tool posts what it is given and nothing of its own

A verb SHALL write to an issue only the text its caller passed and SHALL add no footer, marker,
trailer, signature or label that names an agent or an AI. The labels the binary writes SHALL be
`deferred` and, if the binding falls back to a label, `change:<id>`.

#### Scenario: A comment

- **WHEN** `note 12 "measured: 40 ms"` runs
- **THEN** the posted comment is exactly that text

### Requirement: Install compiles and links the binary

`scripts/install.ts` SHALL be one `installScript(import.meta)` call of `lib/install-base.ts`: it
compiles `qsm-tasks`, links it onto the user's PATH and writes its completions, and a second run
SHALL change nothing. `gh` SHALL be a prerequisite reported by `qsm-tasks doctor`, never installed
by the plugin.

#### Scenario: Installed on a clean machine

- **WHEN** `qsm-setup install qsm-tasks` runs
- **THEN** `qsm-tasks --help` lists the verbs of this spec and a second install changes nothing

## MODIFIED Requirements

### Requirement: Dependencies

The plugin SHALL declare no plug-in in `dependencies`: the binary imports root `lib/` and itself
only, reads no other plugin's file and calls no other plugin's verb, and the core works alone. Its
one prerequisite is the `gh` command on PATH with a login that has the `project` scope, checked by
`qsm-tasks doctor`; without it every verb exits `missing` naming `gh` and has no second route.

#### Scenario: Installed alone

- **WHEN** only qsm-tasks is installed in a session
- **THEN** the `task-tool` skill loads and every verb it names runs with `gh` logged in, and the
  session needs no other plugin

#### Scenario: gh is missing for doctor

- **WHEN** a verb runs with `gh` not on PATH
- **THEN** it exits `missing` naming `gh` and does nothing else

## REMOVED Requirements

### Requirement: Install puts br on the machine or says how

**Reason**: The install now compiles and links `qsm-tasks`; there is no `br` to probe.

**Migration**: `scripts/install.ts` becomes one `installScript(import.meta)` call and the `br` probe
and its test are deleted.

### Requirement: No binary, the install is the doctor

**Reason**: The plugin now ships a binary and a `doctor` verb that checks the whole task tool.

**Migration**: "One binary, qsm-tasks, serves the task port" and "doctor checks every part of the
task tool and names each fix".
