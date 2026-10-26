## Context

Today `qsm-tasks` serves the task port with `br` (beads_rust): one skill holds the model and a table
of `br` commands, an install script probes `br`, and the tracker is `.beads/issues.jsonl` in git.
Five other plugins touch it directly: worktrunk writes `.beads/redirect` into each new workspace,
memory's `orient` runs `br show` and `br list`, cockpit runs `br list` for a card, builder's lens
runs `br list` and `br create`, and toolbox lists `br` as a tool. The skills of plan, openspec,
essentials and review already say "the task tool" and name no binary, which is the one thing that
makes this change small for them.

Epic #3 settles the direction: GitHub Issues is the main task tool, reached through qsm-forge verbs
(sibling changes `forge-issue-verbs` and `forge-board-verbs`), `tasks.md` holds the steps of one
change, `br` goes, one board per repository, an epic is an issue of the issue type `Epic` whose
tasks (type `Task`) are
sub-issues. A verb GitHub refuses fails loud and does nothing else. The board is org Project #1 of
`qsmark-labs` with a Status field for tasks and an Epic stage field for epics, set up by the owner
(see `forge-board-verbs` for the options and their definitions).

## Goals / Non-Goals

**Goals:**

- One answer to "which tool is the main task tool", written in one skill, with the verb for every
  step the old table covered.
- No file in the marketplace reads or writes `.beads`, or names `br`, when this is applied.
- The skills keep working in the roles they already use ("the task tool"), unchanged.

**Non-Goals:**

- The forge verbs, the board, the organization: other changes and the maintainer.
- Triage of the open `br` tasks and untracking `.beads/`: the migration piece, run after this.
- A replacement for the removed readers (orient lines, cockpit card, lens task list).
- Removing GitLab (`qsm-forge gl`): untouched.

## Decisions

### 1. qsm-tasks is a model plus a verb map, with no code

The `task-tool` skill keeps its model rules (the fourth, the test-it task, becomes the QA stage;
see decision 3) and the working rules, and its table becomes a
map from each step to a qsm-forge verb. The plugin has no binary, no `qsm.json`, no install script,
and one dependency, qsm-forge. The contract other plugins use is unchanged: they say "the task
tool" and the skill is the one place that names verbs. The old requirement "One skill names br"
becomes "One skill names the verbs", the same ownership with the new tool.

| Step | Verb (`forge-issue-verbs`, `forge-board-verbs`; `list` and `view` are working names) |
| --- | --- |
| ready list | `qsm-forge gh issue ready --parent <epic>`: open, unblocked, not an epic |
| epic | `qsm-forge gh issue create --type Epic`, then `qsm-forge gh board-set --stage Planning` |
| task under an epic | `qsm-forge gh issue create --type Task --parent <epic>`; Status Todo comes from the board |
| order | `qsm-forge gh issue blocked-by <task> --add <blocker>` |
| claim | `qsm-forge gh claim <task>`: In Progress, assignee, and the epic to Building |
| pull request open, CI and bots | `board-set <task> --status "In Review"` |
| CI green, every finding fixed | `board-set <task> --status "Ready For Human Review"` |
| merge | nothing: `Closes #N` closes the task and the board sets Done |
| epic ready for QA | nothing: the Action sets Ready For Test when the last sub-issue closes |
| QA takes the epic | `board-set <epic> --stage "In Test"` |
| QA finds something | `create --type Task --parent <epic>` for the fix, then `board-set <epic> --stage Blocked` |
| owner accepts QA | `board-set <epic> --stage Done`, then `qsm-forge gh issue close <epic>` |
| progress | `qsm-forge gh issue comment` |
| close without a pull request | `qsm-forge gh issue close --reason` |
| epic check | `qsm-forge gh board-status <epic>` and a view of its sub-issues |
| defer | label `deferred` plus a comment with the date or condition |
| feedback | `qsm-forge gh issue create --type Task --parent <feedback epic> --label source:<who>` |

Alternative rejected: keep `task-tool` free of verb names and point at qsm-forge's own skill. The
agent would learn the flow from two skills; one skill that names its verbs is one place to read.

### 2. Binding a change to its task: a first line in the body

`br` had an external-reference field; an issue does not. The task for a change carries the first
body line `openspec: <change-id>`. spec-propose looks the line up by a search over issue bodies and
then keeps only an issue whose first line is exactly that. Alternative: a label `change:<id>`, exact
but needing the label created first and cluttering the label list; kept as the fallback if the first
`test:` run in tasks.md 1.2 shows the search is unreliable. This is a proof before the skill
relies on it, not a guess in the spec.

### 3. Two flows: a task by Status, an epic by Epic stage, and QA instead of test-it

A task's flow is Todo, In Progress, In Review, Ready For Human Review, Done. The owner tests tasks
himself, with automatic tests and the review bots, so no agent sits between a task and him. A task
closes by the merge of a pull request with `Closes #N`, and the board's "Item closed" sets Done; a
task whose work has no pull request (a decision, a deferred item closed as won't-do) is closed with
the explicit `close` verb and a reason a reader in a month understands.

An epic's flow is Planning, Building, Ready For Test, In Test, Blocked, Done. Its first claimed task
makes it Building (`claim` does it), the last closing sub-issue makes it Ready For Test (an Action,
not a step), the QA agent makes it In Test, a finding makes it Blocked with a fix task under the
epic, and the fix task closing sends it back to Ready For Test by the same Action. The owner
accepts the QA result, and only then is the epic Done and its issue closed. The agent never closes
an epic on its own word.

This replaces the final test-it sub-issue. Reason: test-it was a task made to look like a stage, it
had to be blocked by every other task by hand, and it could be ticked by the same agent that built
the epic. A stage with its own agent, one that did not build the work and tests against the business
request and the acceptance criteria on the real path, is a stronger proof and costs no per-epic
issue. The QA agent runs in a Claude Code session on the owner's machine for now and on a
dedicated machine later; it is not built here, this change only states what the skills say about it.
Everything the skills post to GitHub is written in the owner's name and names no agent.

### 4. Deferred work is a label and a comment, not a status

GitHub issues have open and closed only; a board column could say `Deferred`, but the board is a
view the maintainer owns. The rule is one label `deferred` and a comment that holds the date or
condition, and the ready list excludes the label. A task is never silently closed or left open.

### 5. The feedback epic is found by its title

The instruction file and the web-research agent name the issue `Feedback on agents and tools` of
type `Epic`, searched by title in the marketplace repository, never by number. A number in an
instruction file is the literal that goes stale (the `qsm-i1u` it replaces). Feedback tasks keep the
rules of today: title names where, label `source:<who>`, search the title words first and comment on
an existing one, a subagent creates only this kind. The search needs `--repo`, or the checkout of
`QSM_MARKETPLACE`, because a subagent in another project would otherwise file into that project.

### 6. The readers outside qsm-tasks go, apart from one write

| Reader or writer | Decision | Reason |
| --- | --- | --- |
| worktrunk `.beads/redirect` | removed | the store is on GitHub, a workspace has nothing to point at |
| memory `orient` task lines | removed (question 1) | session start must not need the network |
| cockpit Tasks card, `tasks` verb | removed (question 2) | a polled network read; GitHub's board is the view |
| lens open-task reads | removed (question 3) | same reason as the card |
| lens pen edit | kept, through `qsm-forge gh create` | it is a write of one issue, the same verb the skill uses |
| toolbox `br` row, knip `br` | removed | no `br` |

Removing a reader removes its dependency on qsm-tasks (memory, cockpit). The lens swaps
`qsm-tasks` for `qsm-forge`, since it still calls a forge verb.

### 7. Order of work

Readers first, qsm-tasks last. `br` stays usable until nothing calls it, so every intermediate state
builds and every test that passed before still passes. Each reader removal is also the place its
test is deleted or rewritten: a test of a removed behaviour is removed with it, never kept green by
a fake `br`.

### 8. Evals use a fake `qsm-forge`

The evals of qsm-tasks (`task-tool-last-child-of-epic`, whose grader reads `.beads/issues.jsonl`),
qsm-openspec, qsm-plan and qsm-review scaffold a repository with `br init` and `br create`. They get
a `qsm-forge` stub on PATH that records its arguments to a file and prints a canned answer for
`list` and `view`; the graders read that file. The real verbs against real GitHub are proved once by
the epic's integration criteria and its QA stage. Alternative: real `test:` issues per eval run,
rejected
as noise on the public repository (question 4).

## Risks / Trade-offs

- **Offline, tracking stops.** One path, no fallback. The skill's caveats say so.
- **The verb names are not fixed yet.** The sibling changes own them; group 1 of tasks.md reconciles
  this change with them, and the spec's scenarios describe results, not flags.
- **`marketplace-lens` is an active change** whose requirement "An edit becomes one task in the task
  tool" is not in the main spec yet. If it archives first, this change modifies it; if not, its
  tasks 3.3 and its design 14 are reconciled when it is applied. Recorded in tasks.md.
- **A rate limit or a missing `project` scope** surfaces as the verb's failure with the cause; the
  skill names `gh auth refresh -s project` as the fix.

## Migration Plan

This change adds no data migration. The 98 `br` tasks become issues in the migration piece, which
needs the `.beads/` file readable until it finishes, so `.beads/` and the `br` binary stay on the
maintainer's machine until the triage is confirmed. Group 11 of tasks.md, the sweep that confirms
nothing names `br`, is applied after that. Nothing here deletes `.beads/` itself.
