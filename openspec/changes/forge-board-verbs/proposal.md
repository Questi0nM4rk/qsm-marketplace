## Why

Epic #3 moves every task into a GitHub issue. An issue alone is a list entry; what makes it a
task tracker is the board, and the board has two single-select fields: Status for a task and
Epic stage for an epic. Today an agent reaches them only through raw `gh project` calls that need
the project's node ids, a field id and an option id per write. This change gives qsm-forge three
verbs for the board, so the agent moves a task or an epic, reads where it is, and claims a task,
one call per step. A fourth piece is not a verb: a GitHub Action moves an epic to Ready For Test
when its last sub-issue closes, so that step does not depend on an agent remembering it.

## What Changes

- **`qsm-forge gh board-set <issue> --owner --project (--status <name> | --stage <name>)`** sets
  the Status of a task or the Epic stage of an epic, on a board the issue is already on.
- **`qsm-forge gh board-status <issue> --owner --project`** prints the issue's type and its
  Status (task) or Epic stage (epic).
- **`qsm-forge gh claim <issue> --owner --project`** assigns a task to the caller and sets its
  Status to In Progress, adding it to the board first when it is not there, and moves the task's
  epic from Planning to Building.
- **A workflow file `.github/workflows/epic-stage.yml`** runs when an issue closes. When the
  issue is a sub-issue of an epic and no sub-issue of that epic is left open, it sets the epic's
  Epic stage to Ready For Test, from Building or Blocked only. It uses `gh` and nothing else.
- **There is no `board-add` verb.** The board's "Auto-add to project" and "Auto-add sub-issues to
  project" workflows put every issue of the repository on the board with Status Todo, measured
  within 10 seconds. `claim` still adds an item itself, because it may run inside that gap.
- **Done is GitHub's, not a verb.** A merged pull request with `Closes #N` closes the issue and
  "Item closed" sets the Status Done, measured within 5 seconds. The Epic stage Done is set by
  `board-set --stage Done` when the owner accepts the QA result.
- **The two fields and their options are the contract.** Status: Todo, In Progress, In Review,
  Ready For Human Review, Done. Epic stage: Planning, Building, Ready For Test, In Test, Blocked,
  Done. The spec holds each name and the definition the board shows.
- The verbs take the project owner and number as arguments, never a default.

Depends on `forge-issue-verbs` (create, close, comment, sub-issue, blocked-by, ready, and the
issue number and `--repo` conventions). This change only reads an issue by number and never
creates or edits its text.

Not in this change: creating the board, its fields, its four views and its built-in workflows (the
owner does it once in the web UI, because the API cannot set a view's column field or a workflow),
the GitHub App bot that opens pull requests (a later piece), the QA agent itself, a board-wide
listing (`gh project item-list` does it), GitLab, and a hook that forces the verbs.

## Capabilities

### New Capabilities

None. Every requirement lands in the existing `qsm-forge` capability.

### Modified Capabilities

- `qsm-forge`: the Status and Epic stage of an issue on the board, the claim of a task, and the
  Action that moves an epic to Ready For Test.

## Impact

- `plugins/qsm-forge/` (`lib/github-board.ts` new, `scripts/cli.ts`, `qsm.json`, the generated
  noun, `USAGE.md`, `README.md`, and the Why it exists sentence about review threads only).
- `.github/workflows/epic-stage.yml` in this repository, and one repository secret `PROJECT_TOKEN`
  that the owner sets (see the design).
- Token scope: `project` on the caller's `gh` login (granted on this machine).
- Proof runs on this repository against org Project #1 with issues titled `test: board ...` and an
  epic titled `test: board epic`, all closed afterwards.

## Critiques

Devil's advocate:

- "The Action cannot write an organization project with the workflow's own token." Fixed: the design
  says `GITHUB_TOKEN` has no project permission, so the workflow reads the secret `PROJECT_TOKEN`
  (a token of the owner with the `project` scope today, the App bot's token later, only the secret
  changes). This is not measured yet; task 4.2 proves it on a real close before anything relies on
  it, and a failed run is red in the Actions tab and leaves the stage as it was.
- "The last-open check reads `subIssuesSummary`, which may lag the close event." Fixed as a proof:
  task 4.2 closes a last sub-issue and reads the stage. If the summary lags, the workflow counts
  open sub-issues with a search instead, which is still `gh` only.
- "A fix task closing moves the epic to Ready For Test while another fix task is open." Not
  possible: the check is that no sub-issue is open, so one open fix task keeps the epic Blocked.
- "A sub-issue that is reopened leaves the epic at Ready For Test." Waived with reason: the owner
  and the QA agent see the open sub-issue on the epic, and `board-set --stage Building` is the one
  hand correction. A reopen is rare in this flow, and a second rule in the Action would be code for
  a case that has not happened.
- "Claim is several writes and cannot be atomic." Fixed: board first, then the assignee, then the
  epic, each idempotent, and a failure names what is done, so the re-run is the repair.
- "Two agents claim the same task." Fixed: a claim on an issue another login holds is `blocked`.
- "`board-set --status` on an epic or `--stage` on a task puts an item in the wrong view." Fixed:
  the verb reads the issue type first and refuses the field that is not the type's. Without it a
  task with an Epic stage leaves the Tasks board (`-has:epic-stage`) and nobody sees why.

Future archaeologist:

- Why `--owner` and `--project` on every call? Fixed: the board moved from a personal account to
  an organization once, and a stored default is a second source of truth that would name the old
  one.
- Why does the read use GraphQL and the writes `gh project`? Fixed: `item-list` returns 30 items by
  default, while the issue's own `projectItems` answers for one issue regardless of board size.
- Why is `claim` the only verb that touches an epic? Fixed: the design says the epic's step to
  Building is a consequence of the first claim, and a separate step is one an agent forgets.
- Why a workflow file for Ready For Test and not a verb? Fixed: the design says the trigger is
  the close of an issue, which a verb of ours would not see when the owner closes it in the browser.

Scope sniper:

- A `board-add` verb. Cut: the two auto-add workflows do it, and `claim` covers the gap.
- A verb that checks the workflows are on. Waived: the owner switches them on once, and a
  `board-status` after a real merge is the proof.
- `unclaim`, `board-remove`, and a claim for the QA agent (`board-set --stage "In Test"` does it).
  Cut: nothing in the epic needs a separate verb for them.
- The Action also handling a reopen, Planning, or In Test. Cut: see the reopen finding above.
