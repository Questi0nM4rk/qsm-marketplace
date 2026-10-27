## Why

Epic #3 moves the project's tasks from a file in git to GitHub issues and a board. An agent that
works on that board with raw `gh`, `jq` and GraphQL composes several calls per step (a sub-issue
needs a node id fetched first, a field write needs a project id, a field id and an option id), gets
the flow wrong in a different way each session, and posts whatever it improvised. This change makes
the task tool a plugin with its own binary, `qsm-tasks`, whose verbs cover the whole flow from a
business request to an accepted epic, so the agent never composes a backend call and a gap is fixed
by extending the binary, never by a skill telling the agent to call a raw API. It replaces the two
qsm-forge changes that tried to do part of it (`forge-issue-verbs`, `forge-board-verbs`): the task
tool serves the marketplace's "task" port, qsm-forge stays pull requests and review threads, and
neither knows the other.

## What Changes

- **A binary `qsm-tasks`** in `plugins/qsm-tasks/` (one plugin, one binary named after it), noun
  `$.tasks`, verbs described in `qsm.json`, text output for the agent and the `--json` envelope of
  `lib/cli-base.ts` for hooks and scripts. Thirty-four verbs in six groups:
  - read: `ready`, `list`, `show`, `tree`, `search`, `notes`, `board`;
  - create: `epic`, `add`, `feedback`, `finding`;
  - edit: `edit`, `move`, `after`, `unblock`, `assign`, `spec`, `find-spec`, `note`;
  - task flow: `claim`, `release`, `review`, `human`, `reopen`, `close`, `drop`, `defer`;
  - epic flow: `plan`, `qa`, `accept`, `reject` (and `finding`, listed under create);
  - admin: `doctor`, `setup`, `flow`.
- **The flow is code, not prose.** Both flows (a task by Status, an epic by Epic stage), their
  definitions of done and the guard of every move are one table in `lib/flow.ts`; the verbs, `flow`,
  `doctor` and `setup` read it. A verb that would break the flow fails `blocked` naming the rule.
- **The backend is GitHub and stays behind one interface.** `lib/backend.ts` is the port, backend
  neutral (items, kinds, Status, Epic stage); `lib/github/` is the only code that knows `gh`, issue
  types, sub-issues, `blockedBy` and the project fields. No verb output carries a node id, a field
  id or a GraphQL shape.
- **A GitHub Action carried over** from `forge-board-verbs`: `.github/workflows/epic-stage.yml`
  moves an epic to Ready For Test when its last open sub-issue closes (also from Blocked after a fix
  task closes). `gh` only, the secret `PROJECT_TOKEN`, nothing posted.
- **Done for a task is GitHub's**: merge with `Closes #N` closes it and the board's "Item closed"
  workflow sets Done. No verb marks a merged task Done.
- **The QA stage replaces the test-it task.** `qa`, `finding`, `accept` and `reject` are its verbs.
- **`doctor` and `setup`** check and create everything the API allows (fields, options with
  definitions, issue types, labels, the feedback epic) and name the rest (views, built-in workflows,
  the secret) with the one place to set each.
- **Ghost mode.** The binary adds no footer, marker, label or trailer of its own to anything it
  posts; the text is what the caller passed.

Replaces `forge-issue-verbs` and `forge-board-verbs`, both deleted. Moved from them: the Action and
its token (decision 9), "Done is GitHub's" (decision 8), the two board fields with their option
names and definitions (now `lib/flow.ts`), `ready` as one search (decision 4), the "refused call
fails loud, does nothing else" rule, and body text on stdin. Left behind and not carried: the `gh`
and `gl` sub-command shape, `--owner --project` on every call (the board is resolved from the
repository, decision 3), a guard hook that refuses raw `gh issue` calls (see Questions).

Not in this change: pull requests, review threads, git (qsm-forge), GitLab, a second backend, the
QA agent itself, the GitHub App bot that opens pull requests, the skills that call the verbs and the
migration of `br` tasks (`tasks-on-github-issues`, which depends on this change), and views and
built-in workflows, which the API cannot create.

## Capabilities

### New Capabilities

None. Every requirement lands in the existing `qsm-tasks` capability.

### Modified Capabilities

- `qsm-tasks`: a binary with the verbs of the whole task flow, the flow table, the backend boundary,
  `doctor` and `setup`, the Action, and the install that compiles the binary; the `br` install and
  the no-binary requirements are removed.

## Impact

- `plugins/qsm-tasks/`: `qsm.json`, `scripts/{cli,install}.ts`, `lib/` (flow, backend, github,
  verbs), `types/index.d.ts` and `hooks/noun.generated.ts` (generated), `INSTALL.md`, `USAGE.md`,
  `README.md`, `.claude-plugin/plugin.json`.
- `.github/workflows/epic-stage.yml` in this repository and the repository secret `PROJECT_TOKEN`
  (the owner sets it).
- The token needs the `project` scope; `doctor` says so.
- Consumers: `qsm-builder`, `qsm-openspec`, `qsm-plan` and the skills reach the verbs through the
  skill `task-tool` and `$.tasks`; their edits are `tasks-on-github-issues`.
- Proof runs on `qsmark-labs/qsm-marketplace` and org Project #1 with issues titled `test: ...`,
  all closed afterwards.

## Questions

1. **A `close` verb for a task with no pull request.** The decided set has `drop` (not planned) and
   no way to finish a decision or spec-only task that no merge closes; the old rule "close without a
   pull request" needs one. Recommendation: keep `close <id> --reason "<what was done>"`, task only,
   completed; it is in this spec.
2. **Feedback label values against ghost mode.** `source:main-agent|subagent|user` names an agent on
   a public repository. Recommendation: keep the label, because feedback is about agents and the
   person chose the scheme; if ghost mode wins, the label becomes `source:me` for all.

## Critiques

Devil's advocate:

- Thirty-four verbs is a CLI nobody remembers, and each is a contract forever. Waived with the
  reason: the agent does not remember them, it reads `qsm-tasks --help` and the skill's flow table,
  and a verb is a flow step. Every verb earns its place by a step of the epic's flow that otherwise
  becomes a raw call; the spec's scenarios name that step, and a verb with none was cut (a `status`
  verb duplicates `show`, an `unclaim` is `release`, an epic is never reopened: new work is a new
  epic).
- The guard "who may move what" cannot be enforced: the owner and the agent share one `gh` login.
  Fixed in part: the verbs enforce state (`accept` only from In Test with no open sub-issue,
  `qa` only from Ready For Test, `human` only from In Review), so an agent cannot skip a stage; the
  owner's yes is a rule in the skill and the reply, not in the binary. Waived for the person: no
  per-person gate exists without a second identity, which is the App bot's piece.
- `reject` sends an epic back to Building, but the Action fires only on a close, so an epic at
  Building with every task closed would wait forever. Fixed: `reject` and `finding` each create the
  fix task that carries the reason, and the Action moves the epic when that task closes.
- `doctor` wants to read the board's built-in workflows and views; the GraphQL schema may not expose
  them. Unmeasured; task 0 measures it. If unreadable, `doctor` reports those checks as `manual`
  with the web-UI place and exits `partial`, never green on a guess.
- A second backend behind `lib/backend.ts` is speculation: one implementation makes an interface
  decoration. Waived with the reason: the interface is how the verbs are tested without `gh` (a
  recording backend in the flow tests) and it is where "extended in one place" is true; no
  registry, no config switch, no second implementation is built.
- `ready` lists Todo only, so a new session cannot see the task it already claimed. Fixed: the
  skill starts a session with `ready` and `list --mine`; the two together are the old ready list.
- One token for the owner and for the Action; a leaked `PROJECT_TOKEN` writes the org board.
  Waived until the App bot piece; stored as a repository secret, never printed.

Future archaeologist:

- Why is there a flow table in code and also a skill? Fixed: the design says the table owns names,
  definitions and guards, and the skill owns who acts and when; the skill says to run
  `qsm-tasks flow` instead of copying definitions.
- Why does `reject` take a reason as a task? Fixed: decision 7 names the Action-fires-on-close
  gap in one paragraph.
- Why no `--owner --project` flags, when the old change had them? Fixed: decision 3 says the board
  moved once and a repository has one linked board; `--project owner/number` overrides for the case
  of two.
- Why does `find-spec` search bodies at all? Fixed: decision 6, an issue has no external reference,
  so the first body line is the binding and the verb is its only reader and writer.
- Why is the Action in this repository's `.github/` and not in the plugin? Fixed: GitHub runs only
  that directory, the trigger is a close in the browser where no verb runs, and the field names in
  it are checked against `lib/flow.ts` by `doctor`.

Scope sniper:

- `setup` for a new repository is speculative with one repository. Waived: the person asked for it
  so a second project is one command, it is the only way the field options and their definitions
  are not typed by hand twice, and `doctor` already needs the same table.
- `tree`, `board`, `notes`, `search` are reads `gh` can do. Fixed the other way: the agent never
  composes a backend call, so a read it needs is a verb; each is one call and one table of output.
- `plan`, `release` and `unblock` could be flags. Waived: each is one flow step with a guard, a
  flag would hide the step from `--help` and from the noun.
- No unit tests beyond the flow table: proof is a real run per group on this repository, plus one
  `bun test` through `runBin` with a recording fake `gh` for what a real run cannot show (a usage
  error or a refusal runs nothing further, a guard refusal runs no write).
