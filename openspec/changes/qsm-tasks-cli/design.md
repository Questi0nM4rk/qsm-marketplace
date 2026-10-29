## Context

The marketplace is a microkernel: a role such as "task" is served by one plugin and used through
its contract, a CLI verb or the noun. `qsm-tasks` serves "task" today with a skill over `br`.
Epic #3 moves the store to GitHub issues and an org board (qsmark-labs, Project #1). Measured on
this repository: issue types Epic, Task, Bug, Feature; Status options Todo, In Progress, In Review,
Ready For Human Review, Done; Epic stage options Planning, Building, Ready For Test, In Test,
Blocked, Done; views Tasks (`-type:Epic -has:epic-stage`) and Epics (`type:Epic`); eight built-in
workflows on (auto-add, auto-add sub-issues, item added to Todo, item closed to Done, auto-close,
PR linked, PR merged, auto-archive). `gh` 2.102.1 JSON carries `parent`, `subIssues`, `blockedBy`,
`blocking`, `issueType`, `subIssuesSummary`; `gh issue list --search "-is:blocked"` gives the
unblocked set in one query; a field is written by `gh project item-edit` with ids. Those are the
backend's business, inside `lib/github/` only.

## Goals / Non-Goals

**Goals:** every step of the task flow is one verb; the agent never composes `gh`, `jq` or GraphQL
for a task; the flow's rules are enforced by the binary, not remembered by the agent; the backend
can be replaced by another plugin serving the same verbs, or extended in this one place.

**Non-Goals:** pull requests, review threads and git (qsm-forge); a second backend; creating views
or built-in workflows (the API cannot); the QA agent; the App bot; migration of `br` tasks;
a hook that forces the verbs (see Open decisions).

## Decisions

### 1. One plugin, one binary, the verbs are the contract

`plugins/qsm-tasks/qsm.json` declares `qsm.bin` `qsm-tasks`, `qsm.noun` `tasks` and one command per
verb; help, completions and `$.tasks.<verb>()` are generated from it (`find-spec` is `findSpec`).
Logic is in `lib/`; `scripts/cli.ts` only maps `runCli` handlers to it. Install is
`installScript(import.meta)`: compile, link the bin, completions. The plugin imports root `lib/` and
itself only, declares no plug-in dependency, and its one prerequisite is `gh` on PATH with a login
(`missing` otherwise). Reason for a binary rather than a skill over `gh`: the agent's raw route is
the failure this removes, and hooks need `$.tasks`.

### 2. The verbs

| Group | Verbs | Positional and flags |
| --- | --- | --- |
| read | `ready` | `--epic <n>`, `--limit` |
| | `list` | `--epic <n>`, `--status <Status>`, `--stage <Epic stage>`, `--mine`, `--blocked`, `--state open\|closed\|all` (open), `--label`, `--limit` (50) |
| | `show <n>` | |
| | `tree <epic>` | |
| | `search "<words>"` | `--state` (all), `--limit` |
| | `notes <n>` | `--limit` (the last 20) |
| | `board` | |
| create | `epic "<goal>"` | `--intent <file or ->` required: the epic body |
| | `add "<title>"` | `--epic <n>`, `--after <n>`, `--spec <change-id>`, `--body`/`--body-file`, `--label` |
| | `feedback "<title>"` | `--body`/`--body-file` |
| | `finding <epic> "<title>"` | `--body`/`--body-file` |
| edit | `edit <n>` | `--title`, `--body`/`--body-file` |
| | `move <n>` | `--epic <n>` required |
| | `after <n> <blocker>`, `unblock <n> <blocker>` | |
| | `assign <n>` | `--login` (the caller) |
| | `spec <n> <change-id>`, `find-spec <change-id>` | |
| | `note <n> "<text>"` | text or `--body-file` |
| task flow | `claim <n>`, `release <n>`, `review <n>`, `human <n>`, `reopen <n>` | |
| | `close <n>` | `--reason "<what was done>"` required |
| | `drop <n>` | `--reason` required |
| | `defer <n>` | `--until <YYYY-MM-DD or a condition>` required |
| epic flow | `plan <epic>`, `qa <epic>`, `accept <epic>` | |
| | `reject <epic>` | `--reason` required |
| admin | `doctor`, `setup`, `flow` | `setup`: `--project owner/number` |

Every verb takes `--repo owner/name` and `--project owner/number` (decision 3) and the harness's
`--json`. Names are the flow's words; the person's proposed set is kept whole, with these
refinements and the reason for each:

- `list` has `--status` beside `--stage` because the two fields share the option name Done, so one
  flag cannot say which field is meant.
- `add --epic` is optional: a loose task (a follow-up, a pen edit from the lens) has no epic and is
  never an epic's child; a spec change always passes it.
- `close` is added (decision of 2026-10-29); `reopen` covers a task; an accepted epic is not
  reopened (`wrong-kind`), new work is a new epic.
- `plan` is the way back to Planning when an epic is re-planned; `epic` already creates at Planning.
- `human` and `review` are the two ends of CI: `review` also takes a task back from Ready For Human
  Review when a finding appears.

### 3. The repository and the board are resolved, not configured

The repository is `--repo`, else the origin remote of the working directory, else `missing`
(`no-repo`). The board is `--project owner/number`, else the one Projects v2 board linked to the
repository; none or several is `missing`/`usage` naming `--project`. Nothing is stored: a default in
a file is a second source of truth that goes stale when the board moves (it moved once, from a
personal account to the organization). `feedback` is the exception: it always targets the
marketplace repository, taken from the checkout `QSM_MARKETPLACE` points at, because a subagent
runs in other projects; its issue is the open one of type Epic titled exactly
`Feedback on agents and tools`, found by title, never by number.

### 4. Reads

`ready` is open, Status Todo, not blocked, not deferred, not an Epic, in ascending number; one
`gh issue list --search "-is:blocked -type:Epic -label:deferred"` call, filtered to Status Todo by
the backend. `--mine` on `list` is assigned to the caller's login. `tree` prints the epic, then its
sub-issues indented one level with Status, assignee and blockers, so the QA agent and the owner read
one screen. `board` counts tasks per Status and epics per Epic stage, zero included, in flow order.
`search` is `gh`'s issue search over title and body, any state, each row with its kind and state.
`notes` prints the comments oldest first, each as `<date> <login>: <text>`. All output is
deterministic: ascending number unless the verb says otherwise, no relative times, no colour.
Output shape in decision 10.

### 5. The flow is a table in `lib/flow.ts`

One module holds: the Status options and the Epic stage options with their definitions (the text
the board shows and `setup` writes), and for each verb its guard (the field value it needs) and its
effect (the value it writes, the assignee, the side effect on the epic). `claim` needs Todo, and an
unassigned task or one the caller holds; sets In Progress, assigns the caller, and moves a Planning
epic to Building. `release` needs In Progress; unassigns, Todo. `review` needs In Progress or Ready
For Human Review; In Review. `human` needs In Review; Ready For Human Review. `reopen` needs a
closed task; opens it, Todo. `close` and `drop` need an open task, close it completed or not
planned and leave the board to GitHub (Done on close). `defer` unassigns, Todo, adds the label
`deferred` and a comment `Deferred until <value>`; `release` on a deferred task removes the label.
`qa` needs Ready For Test and no open sub-issue; In Test. `finding` needs In Test; creates the fix
task, Blocked. `accept` needs In Test and no open sub-issue; Done, closed completed. `reject` needs
In Test; creates the fix task carrying the reason, Building. `plan` needs Planning, Building or
Blocked; Planning. A verb whose guard fails exits `blocked`, names the rule and the current value,
and changes nothing. One more rule across verbs: when an open sub-issue appears under an epic at
Ready For Test or In Test (`add`, `reopen`, `move`), the epic goes back to Building; under a Done
epic it is refused. The table is data the verbs, `flow`, `doctor`, `setup` and the tests read, so
the names exist once in Typescript (and once in the Action, decision 9).

### 6. Binding a change: the first body line

An issue has no external reference, so the task of a spec change starts its body with
`openspec: <change-id>`. `spec <n> <id>` writes it (replacing an earlier one), `add --spec` writes
it at creation, `find-spec <id>` lists issues in any state whose body starts with that exact line
and keeps only exact matches (`add-x` never matches `add-x-more`) and prints the issue or `none`
(exit `ok`, `data.task` null). `edit --body` keeps an existing binding line when the new body has
none. The search is `gh`'s body search followed by an exact first-line filter; task 0 proves it on
real issues, and if the search misses, the binding becomes the label `change:<id>` inside the same
verbs, with no change to their contract.

### 7. Creates, and the fix task of a finding

`epic` creates an issue of type Epic with the intent file as body and sets Epic stage Planning;
`add` creates a Task, optionally a sub-issue of `--epic` and blocked by `--after`; `feedback` finds
the marketplace feedback epic, and when an open issue with the same title already exists comments
the body on it instead (`data.created` false), else creates a sub-issue;
`finding` creates a Task under the epic and sets Blocked. `reject` is a finding the
owner makes and leaves the epic at Building. Why `reject` creates a task: the Action fires on a
close, so an epic returned to Building with every task closed would wait forever; the fix task is
what closes next and carries the owner's reason. Body text goes to `gh` on stdin (`--body-file -`),
never as argv, because a body holds backticks and quotes.

### 8. Done for a task is GitHub's

A merged pull request with `Closes #N` closes the task (a GitHub rule for the default branch,
protected or not) and the board's "Item closed" workflow sets Done; "Pull request merged" does the
pull request's own item. No verb marks a merged task Done and none adds an issue to the board (the
two auto-add workflows do, within seconds; `claim` adds the item itself when it is not there yet,
because it may run inside that gap). Reason: GitHub does it on the server for every merge, including
one made in the browser, which no verb of ours would see.

### 9. The Action moves an epic to Ready For Test

`.github/workflows/epic-stage.yml`, trigger `issues: closed`, one job with `gh` only (no install on
the runner): read the closed issue's parent and type; stop unless the parent is an Epic; read its
`subIssuesSummary`; when completed equals total and its stage is Building or Blocked, set Ready For
Test through `gh project item-edit`. A concurrency group per parent keeps two closes from racing.
The token is the repository secret `PROJECT_TOKEN` (a `project`-scope token of the owner now, the
App bot's later), because the workflow's own token cannot write an organization project. Reasons for
the place: GitHub runs only `.github/`, and the trigger is a close the owner or a merge can make in
the browser where no verb runs. Cost: the field and option names appear in the YAML as well as in
`lib/flow.ts`; `doctor` reads the workflow file and reports a name that is not an option of the
board. Whether `subIssuesSummary` is current at the close event is unmeasured; task 0 and the Action
proof measure it, and if it lags the workflow counts open sub-issues by search, still `gh`.

### 10. Output and errors

Text first, one shape each: a list row is `#<n> [<Status or Epic stage>] <title>` followed by
`@<login>` when assigned and `blocked by #<a>,#<b>` when open blockers exist; an epic row adds
`<done>/<total>`; a mutation prints one line per write, `#<n> <from> -> <to>`, so a side effect on
the epic is its own line; an empty list prints `none`. `show` prints the same fields as labelled
lines then the body. `--json` carries the envelope of `lib/cli-base.ts` with `data` holding the
same facts: one `Item` shape `{ number, url, title, kind, state, status, stage, assignee, parent,
blockedBy, labels, subIssues: { total, completed } }`, never a node or field id, plus for a mutation
`changes: [{ number, field, from, to }]`.

Errors are the marketplace's outcome codes with a stable `data.reason`: `usage` (2) before any
backend call for a wrong call; `missing` (4) for `no-gh`, `no-login`, `no-repo`, `no-board`,
`no-feedback-epic`, `no-file`; `blocked` (5) for a flow guard (`wrong-stage`, `held`, `epic-done`,
`open-children`, `wrong-kind`); `failed` (1) for a refusal by the backend (`refused`, with its
words) or an issue that does not exist (`not-found`). Every failure names the cause and, when there
is one, the one fix as `next` (`gh auth refresh -s project`, `qsm-tasks setup`). No retry, no second
route, no rollback; a multi-write verb (`claim`, `finding`, `reject`, `accept`) orders its writes
so the most likely refusal comes first and the epic last, and a failure names the writes already
done, so the repeat finishes it: each write is idempotent.

### 11. `doctor`, `setup`, `flow`

`doctor` checks, one line each with `ok`, `failed` or `manual`: `gh` and its login and the
`project` scope; the repository and the one linked board; the issue types Epic and Task; the two
fields with exactly the option names of `lib/flow.ts` and their definitions; the label `deferred`;
the feedback epic; the built-in workflows that must be on (auto-add, auto-add
sub-issues, item added, item closed, pull request merged); the views Tasks and Epics; the file
`.github/workflows/epic-stage.yml` with its names and the secret `PROJECT_TOKEN`. Each failing line
names its fix: a `qsm-tasks setup` or the web-UI page. A check the API cannot read is `manual`, and
`doctor` then exits `partial`. `setup` creates what the API allows and nothing else: the fields,
their options with definitions, the missing issue types, the labels, the feedback epic; it changes
nothing that exists, so a second run does nothing and names nothing. It prints the manual
remainder (views, workflows, secret) as the same lines `doctor` would. `flow` prints both flows,
the two definitions of done and, per verb, its guard and effect, from `lib/flow.ts`.

### 12. The backend boundary

`lib/backend.ts` is a type, `Backend`, in backend-neutral words: read an item, list items by a
filter, create an item, set a field, assign, relate (parent, blocker), comment, close, search,
resolve the board, check the setup. `lib/github/` implements it by `gh` through one `Run` function
(a test hands it a recorded answer), is the only code that names `gh`, a node id, an issue type or
a project field, and is chosen in one place, `lib/backend-for.ts`. Verbs and `lib/flow.ts` import
the type only. Another backend is another implementation of the type, in this plugin; a plugin
that serves the same verbs under its own binary replaces this one for a user, and the skill, which
names the verbs, is what it also replaces.

### 13. Ghost mode

The binary adds nothing of its own to a body, comment, title or label: no footer, no marker, no
`Co-Authored-By`. The only labels it writes are `deferred` and
`change:<id>` if decision 6 falls back. Commit messages and pull requests are not its business.

## Data

None stored. The envelope's `data` is the `Item` shape and `changes` of decision 10.

## Failure behaviour

Decision 10. A repeat of any write verb finds the work done and changes nothing; a `blocked` or
`usage` failure runs no write.

## Proof

Task 0 measures the unknowns on this repository. Each group of verbs then has a real run through
the built binary with `--json` on `qsmark-labs/qsm-marketplace` against Project #1, with issues
titled `test: ...` closed afterwards. One `bun test` through `runBin` with `isolatedEnv` and a
recording fake `gh` proves what a real run cannot: a usage error runs no call, a guard refusal runs
no write, a refused second write of `claim` names the first. The last task runs the whole epic loop,
claim to accept, with the Action.

## Risks / Trade-offs

- `gh` flags change (`--blocked-by`, `--parent` are new): a missing flag fails with `gh`'s message,
  loud; `doctor` names the minimum behaviour, not a version.
- Several writes are not a transaction; repeatability is the repair.
- Offline, nothing works: one path, no cache, no fallback.
- The owner's approval is not machine-checkable (decision in the proposal's critique); stage
  guards stop a skipped stage, the skill and the reply carry the yes.

## Open decisions

1. **Should a guard hook refuse raw `gh issue`, `gh project` and `gh api` task calls?** The skill
   forbids them. A hook forces it, as forge-guard does for review threads. Recommended yes, in a
   later change once the verbs have run live: a guard before the verbs are proven blocks the only
   way to file an issue. Not done here.
