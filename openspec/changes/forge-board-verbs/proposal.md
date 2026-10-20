## Why

Epic #3 moves every task into a GitHub issue. An issue alone is a list entry; what makes it a
task tracker is the board: a column that says Todo, In Progress or Done, and a claim that says
who has it. Today an agent reaches a Projects v2 board only through raw `gh project` calls that
need the project's node ids, name a field by id, and cannot add an item and set its field in one
call. This change gives qsm-forge four verbs for that, so the agent adds an issue to the board,
moves it, reads where it is, and claims it, one call per step.

## What Changes

- **`qsm-forge gh board-add <issue> --owner --project [--status]`** adds an issue to the
  repository's board; with `--status` it also sets the column.
- **`qsm-forge gh board-set <issue> --owner --project --status`** sets the Status of an issue
  already on the board (Todo, In Progress, Done).
- **`qsm-forge gh board-status <issue> --owner --project`** prints the issue's board Status.
- **`qsm-forge gh claim <issue> --owner --project`** assigns the issue to the caller and moves it
  to In Progress, adding it to the board first when it is not there.
- **Done is GitHub's built-in project workflow, not a verb.** A merged pull request with
  `Closes #N` closes the issue, and the board's "Item closed" workflow sets Done. The spec states
  this and what the board must have switched on.
- The verbs take the project owner and number as arguments, because the board moves from a
  personal account to an organization.

Depends on the change `forge-issue-verbs` (piece 1: create, close, comment, sub-issue,
blocked-by, and the issue number and `--repo` conventions). It is not repeated here: this change
only reads an issue by number and never creates or edits its text.

Not in this change: creating the board or its Status field (the maintainer does it once, in the
organization), a board across repositories, GitLab, a board-wide listing (`gh project item-list`
already does it), and a hook that forces the verbs (the review-state guard stays as it is).

## Capabilities

### New Capabilities

None. Every requirement lands in the existing `qsm-forge` capability.

### Modified Capabilities

- `qsm-forge`: board membership and Status of a GitHub issue, and the claim of a task.

## Impact

- `plugins/qsm-forge/` (`lib/github-board.ts` new, `scripts/cli.ts`, `qsm.json`, the generated
  noun, `USAGE.md`, `README.md`, and the Why it exists sentence about review threads only).
- Token scope: `project` on the caller's `gh` login (granted on this machine).
- Proof runs on this repository against a board named in the run, with an issue titled
  `test: board ...` that is closed afterwards.

## Critiques

Devil's advocate:

- "Done is a board setting, so a board created without the workflow never shows Done and the epic's
  done-when silently fails." Fixed: the spec names the two workflows the board needs ("Item
  closed", "Pull request merged"), and the design records that they are readable through GraphQL
  (`projectV2.workflows`), measured on a board of this account: both existed and were enabled by
  default. The maintainer's board-creation checklist gets one line; no verb reads it.
- "Claim is two writes and cannot be atomic: a failure between them leaves a half-claim."
  Fixed: board first (the call most likely to be refused, by scope or a wrong project), assignee
  second, and a failure of the second names the first as done (exit 1, outcome `failed`), so the
  re-run is the repair. Claiming twice is a no-op.
- "Two agents claim the same issue." Fixed: a claim on an issue another login holds is
  `blocked`; the caller's own claim is idempotent. Without this the claim would mean nothing.

Future archaeologist:

- Why `--owner` and `--project` on every call instead of a default? Fixed: the design says the
  board changes owner tomorrow and a stored default is a second source of truth that would name
  the old one. A single `QSM_FORGE_BOARD` env was rejected for the same reason.
- Why does the read use GraphQL and the writes `gh project`? Fixed: the design states that
  `item-list` returns 30 items by default and the issue's own `projectItems` answers for one issue
  in one call regardless of board size.

Scope sniper:

- A verb that checks the workflows are on. Waived with reason: the board is created once, and a
  verb for a one-time check is code that runs once; the check is a line in the maintainer's
  checklist and `board-status` after a real merge is the proof.
- `unclaim` and `board-remove`. Cut: nothing in the epic needs them; `board-set --status Todo`
  and the issue UI cover the rare case.
- A fifth status or custom column names. Cut: the three names are the epic's.
