## Why

The epic Questi0nM4rk/qsm-marketplace#3 moves every task of this project from a file in git to a
GitHub issue, because a protected `main` cannot take a status change that needs a pull request. The
agent must then create, close, comment on, nest and order issues, and the raw route is several
calls per step: a sub-issue needs the child's numeric id (not its number) fetched first, then a
POST with `sub_issue_id`; a dependency needs the same id lookup. The harness's raw calls repeat the
mistake qsm-forge already removed for review threads. This change gives each issue step one
atomic verb under `qsm-forge gh issue`, the same shape and the same loud failures as the thread
verbs, so the task flow can stop using `br` without a second tool.

This is piece 1 of the epic. The board verbs (add an item, move its status) are piece 2 and are not
here.

## What Changes

- **Six verbs**, all GitHub only, all under `qsm-forge gh issue`:
  - `create <title>` with `--body` or `--file`, repeatable `--label`, optional `--parent <n>`
    (the new issue is born a sub-issue);
  - `close <n>` with `--reason completed|not-planned` and optional `--message`;
  - `comment <n> --message`;
  - `sub-issue <parent> <child>` attaches an existing issue as a child;
  - `blocked-by <n>` with exactly one of `--add <m>` or `--remove <m>`;
  - `ready` lists open issues that no open issue blocks, optionally under `--parent <n>` or with
    `--label`, because the task flow needs it to pick the next piece of work.
- **One failure rule**: GitHub refuses (unknown label, unknown issue, a parent in another owner,
  a dependency cycle, a missing scope): the verb exits `failed` (1) with GitHub's cause and does
  nothing else, no retry by another route, no rollback.
- **JSON output per verb** (`--json` envelope `data`), listed in the spec.
- `USAGE.md` rows, the README's verb count and table, `qsm.json` entries, the regenerated noun
  (`$.forge.ghIssueCreate` and so on).

Not in this change: board verbs (piece 2), GitLab (the maintainer moved to GitHub only), an issue
`view` or `edit` verb, a `labels` verb (the `epic` label is created once by hand), closing by pull
request (GitHub does it), the qsm-tasks skills (piece 3), a hook that refuses raw `gh issue` calls
(open decision 1 in design.md), and migrating the `br` tasks.

## Capabilities

### New Capabilities

None. Every requirement lands in the existing `qsm-forge` capability.

### Modified Capabilities

- `qsm-forge`: six issue verbs with error codes and JSON output, and the rule that a refused call
  fails loud and does nothing else.

## Impact

- `plugins/qsm-forge/` (`lib/github-issues.ts` new, `scripts/cli-gh.ts` or a sibling
  `scripts/cli-gh-issue.ts`, `qsm.json`, `types/index.d.ts` generated, `USAGE.md`, `README.md`).
- The forge-guard hook is untouched; it allows `gh issue` calls today and keeps doing so until open
  decision 1 is settled.
- The token needs scope `repo`; the board work later needs `project` (already granted).

## Critiques

Devil's advocate:

- `gh issue create --parent` may create the issue and then fail to attach it, leaving an orphan
  that a retry would duplicate. Fixed: that case is a `failed` whose message names the created
  issue number and says it exists unattached; the spec has the scenario, and the first task
  proves what `gh` really does by a live run before the scenario is relied on. No rollback by
  deleting, because a verb that deletes is a second path.
- Sub-issues and dependencies may not exist on a plan or an organisation setting: the API docs
  read do not state a tier. Waived as a design risk with its test: the first live run on this
  repository answers it, and a refusal is exactly the loud failure the spec demands; the
  maintainer moves to an organisation tomorrow, so the proof runs again there (task 6).
- `ready` trusts `blockedBy` in `gh issue list --json`, and the field may list a closed blocker.
  Fixed: the verb filters to open blockers itself, and the live run includes a blocker that was
  closed.
- Wrapping `gh` makes the verbs only as good as `gh`'s flags (`--add-blocked-by` is new).
  Waived: `qsm-forge doctor` already requires `gh`; a `gh` without the flag fails with its own
  message, loud, and the design names the minimum behaviour rather than a version number.

Future archaeologist:

- Why `gh issue create` with `--parent` instead of create then `sub-issue`? Fixed: the design
  says one GitHub call is atomic where two are not, and that `sub-issue` exists for issues that
  already exist.
- Why no `view`, why `ready` at all? Fixed: the design says `ready` is the one read the task flow
  cannot do without (find work no open issue blocks); everything else is a raw read the guard
  does not forbid.
- Why reasons `completed` and `not-planned` only? Fixed: the design states that `duplicate` needs
  a second issue argument and nothing in the task flow closes by duplicate.

Scope sniper:

- `ready` could wait for piece 3. Waived: the epic's last criterion has a fresh session pick and
  claim work through the verbs only; without it the agent falls back to raw `gh issue list`.
  It is one `gh issue list --json` call and a filter.
- Six verbs could be four: `sub-issue` and `blocked-by` as flags of `create`. Waived: a task
  written first and nested later is the normal case (a split of an epic), and a flag on
  `create` does not cover an existing issue.
- No tests beyond the live run would be the minimum. Fixed the other way: one `bun test` through
  `runBin` with a recording fake `gh` proves the contract the live run cannot, that a usage error
  or a refusal runs nothing further. Nothing else is added.
