## Why

Epic #3 moves every task of this project from `.beads/issues.jsonl`, a file each branch carries its
own copy of, to GitHub Issues, so a protected `main` still works. The forge verbs that read and
write issues are two sibling changes (`forge-issue-verbs`, `forge-board-verbs`); this change is the
third piece: the task tool stops being `br`. qsm-tasks keeps one answer to "which tool is the main
task tool" (GitHub Issues, reached through qsm-forge) and the rules for working with tasks, and
every file that reads or writes `.beads` or names `br` is changed or deleted, because "it is not
done if any step still needs `br`".

## What Changes

- **qsm-tasks names GitHub Issues as the main task tool.** The `task-tool` skill drops its `br`
  table and `br` section and says which qsm-forge verb does each step. The model: an epic is an
  issue of the organization issue type `Epic` holding the intent and the done-when criteria, a task
  is an issue of type `Task` and a sub-issue of it, the change's steps live in `tasks.md`, close
  rules, deferred work, feedback tasks. The `task-writing` skill stays as it is.
- **The board has two fields, and the skill states the flow of each.** A task moves by Status:
  Todo, In Progress (claim), In Review (pull request open, CI and the review bots), Ready For Human
  Review (CI green, every finding fixed), Done (merge with `Closes #N`). The owner tests tasks
  himself, so no agent stands between a task and him. An epic moves by Epic stage: Planning,
  Building (its first task is claimed), Ready For Test (set by a GitHub Action when its last
  sub-issue closes), In Test, Blocked, Done. Pull requests are opened by a GitHub App bot of the
  organization, a later piece; commits and everything posted stay in the owner's name.
- **A QA agent replaces the test-it sub-issue.** An epic has no test-it task anymore. When every
  task is done the epic waits for the QA agent, which tests the whole against the business request
  and the acceptance criteria on the real path, in a Claude Code session on the owner's machine for
  now. A finding becomes a fix task under the epic and the epic is Blocked until it closes, then the
  Action sends it back to Ready For Test. The owner accepts the QA result, and only then is the epic
  Done and closed. The grilling and plan skills, spec-archive and the cockpit's stage text say this
  instead of test-it, and spec-archive no longer closes an epic.
- **A change is bound to its task by a first line in the issue body**, `openspec: <change-id>`,
  because an issue has no external-reference field. Found by searching that line.
- **A merged pull request with `Closes #N` closes a task.** That is the close for a task; the
  explicit `close` verb is for work that has no pull request.
- **qsm-tasks loses its `br` install check and its install script.** It has no binary and probes
  nothing; it depends on qsm-forge, which carries the verbs.
- **The feedback rule moves.** `plugins/qsm-setup/instructions/CLAUDE.md` and the web-research agent
  name epic `qsm-i1u` in the task tool; they name instead the GitHub issue titled `Feedback on
  agents and tools` of type `Epic` in the marketplace repository, and a feedback task is a
  sub-issue of it with the label `source:<who>`.
- **qsm-worktrunk stops writing `.beads/redirect`.** Issues are on GitHub, so a worktree has nothing
  to point at: `lib/task-store.ts`, the call in the create hook, `StoreIo` in `lib/node-io.ts`, and
  the "shares the task store" requirement go.
- **qsm-memory `orient` drops the in-progress and closed-task lines** (`lib/beads.ts`, the task
  part of `orient.ts`) and its dependency on qsm-tasks. See open question 1.
- **qsm-cockpit drops the Tasks card and the `tasks` verb**, and its dependency on qsm-tasks. See
  open question 2.
- **qsm-builder lens stops reading tasks and saves a pen edit as an issue** through `qsm-forge`:
  `lens tasks`, the task part of `lens brief`, the open-task counts, the `.beads` carve-out in
  `lens/watch.ts` and the "open tasks reach the agent" hook go; `lens/edits.ts` calls
  `qsm-forge gh create`; the dependency `qsm-tasks` becomes `qsm-forge`. See open question 3.
- **qsm-toolbox loses its `br` row**, and `knip.jsonc` its `br` binary.
- **qsm-openspec's "no task tool store" stop** becomes "task tool not reachable": no GitHub remote
  or no login stops spec-propose before it writes.
- **Evals that start from `br init`** (qsm-tasks, qsm-openspec, qsm-plan, qsm-review) get a fake
  `qsm-forge` on PATH that records its arguments; see open question 4.

Not in this change: the forge verbs themselves (`forge-issue-verbs`, `forge-board-verbs`, which this
change waits on), the triage of the 98 open `br` tasks and the untracking of `.beads/` (the
migration piece of the epic, which runs after the readers here are gone), the organization and its
board (created by the maintainer), GitLab (the `gl` verbs stay as they are), and moving qsm-desktop,
qsm-shell and qsm-workbench.

## Capabilities

### New Capabilities

None. Every requirement lands in an existing capability.

### Modified Capabilities

- `qsm-tasks`: GitHub Issues is the main task tool; the model in GitHub terms with issue types; the
  task flow, the epic flow and the QA stage; no test-it task; the `br` install and its doctor
  requirement removed; a dependency on qsm-forge.
- `qsm-plan`: the epic's last piece is the QA stage, not a test-it task.
- `qsm-worktrunk`: the shared-task-store requirement removed.
- `qsm-memory`: the briefing without task lines; the dependency requirement removed.
- `qsm-cockpit`: the Tasks card and the `tasks` verb removed; the dependency requirement removed.
- `qsm-builder`: the lens without a task reader, an edit saved as an issue, the dependency swapped.
- `qsm-toolbox`: the installer sentence no longer names `br`.
- `qsm-openspec`: the stop when no task tool is reachable; archive no longer closes an epic.
- `qsm-setup`: the one place for feedback is a GitHub issue, not a task-tool epic.

## Impact

- Plugins: `qsm-tasks`, `qsm-worktrunk`, `qsm-memory`, `qsm-cockpit`, `qsm-builder`, `qsm-toolbox`,
  `qsm-openspec`, `qsm-plan`, `qsm-review`, `qsm-setup`, `qsm-web`, plus root `knip.jsonc`. The
  full list of files is `tasks.md`.
- `plugin.json` `dependencies`: `qsm-memory` and `qsm-cockpit` lose `qsm-tasks`; `qsm-builder`
  swaps it for `qsm-forge`; `qsm-tasks` gains `qsm-forge`.
- The person: a session start no longer lists in-progress tasks and the cockpit has no Tasks card;
  the GitHub board is where that is seen.
- Waits on `forge-issue-verbs` and `forge-board-verbs`: nothing here can be applied or proved until
  `create` (with `--type`), `close`, `comment`, `sub-issue`, `blocked-by`, `ready`, a view verb, the
  board verbs `board-set`, `board-status` and `claim`, and the Action `epic-stage.yml` exist.
- The board, its two fields, its views and its built-in workflows are the owner's, set once in the
  web UI and measured; this change relies on them and creates none.

## Open questions

1. **Does `orient` read in-progress issues, or drop that part?** Recommendation: drop. Session start
   would then need a network call that fails offline (and loud, by the one-path rule), and the
   briefing is meant to be built with no model call and no wait. The commits of a session's window
   already show what it did; the board shows what is in progress.
2. **Does the cockpit keep a Tasks card?** Recommendation: drop the card and the verb. It polls
   after every task-tool command; a polled network read is slower than the `br` file read it
   replaces, and GitHub's board is the view.
3. **Does the lens keep "a pen edit becomes a task"?** Recommendation: keep the write, through
   `qsm-forge gh create` (one call, same shape as the skill uses), and drop every read of tasks
   (open-task lists, counts, stale state of an edit). The in-flight `marketplace-lens` change
   specifies the edit-as-task requirement; archive that change first, or this one reconciles it.
4. **How do evals that need a task store run without GitHub?** Recommendation: a fake `qsm-forge`
   on PATH that appends its arguments to a file the grader reads. Real `test: ...` issues for every
   eval run would be noise on the public repository, and the real path is proved once, by the
   epic's QA stage.
5. **Do the issue verbs also include a listing and a view?** The epic names `create`, `close`,
   `comment`, `sub-issue`, `blocked-by`, but the ready list, the lookup by `openspec:` line and the
   feedback title search need a listing, and the epic check needs the sub-issues and their state
   (the Action does the epic's move to Ready For Test, but the QA agent still reads the epic).
   `forge-issue-verbs` today has `create`, `close`, `comment`, `sub-issue`, `blocked-by` and
   `ready`, and no listing or view. Recommendation: it adds `list` (filters: state, label, search,
   parent, type) and `view`. The skill names the verbs of that change as they stand and the two
   missing ones as working names (tasks.md group 1).

## Critiques

Devil's advocate:

- A network call replaces a file read in every step of the flow (ready list, lookup, claim, close),
  so a session offline cannot track work. Waived with the reason stated: the epic decides GitHub is
  the main store, and the one-path rule says no fallback; the cost is that tracking stops offline,
  and the change says so in the skill's caveats and in the briefing decision (question 1).
- Binding by a first body line and a text search is fuzzier than `br`'s exact external reference: a
  search for `openspec: add-x` can hit `add-x-more`, or miss an edited body. Fixed: the lookup
  filters the listing for an exact first line, and tasks.md group 1 (1.2) proves the search on a
  real `test:` issue before the skill relies on it. If the proof fails the binding becomes a label.
- "A merged PR closes the task" fails for work without a PR (planning, a decision, a spec-only
  change that is still a PR). Fixed: the explicit close verb stays, with a reason comment, and the
  skill says which to use.
- The QA agent runs in a session on the owner's machine, so an epic at Ready For Test waits until
  the owner starts it. Waived with the reason: the wait is visible (the Epics board column Ready For
  Test) and a dedicated machine is the later piece; a timer that starts QA by itself would be an
  unattended agent nobody approved.
- Dropping test-it leaves the epic's last proof with one tester. Fixed: the QA agent is a separate
  session that did not build the epic, tests against the business request and the criteria on the
  real path, and the owner still accepts the result before Done.
- qsm-tasks now depends on qsm-forge, and qsm-plan and qsm-openspec depend on qsm-tasks, so plan
  now needs `gh` and a login. Waived: that is what "GitHub is the task tool" means; the dependency
  is written twice as the architecture requires and fails `missing` naming the plugin.

Future archaeologist:

- Why is the feedback epic found by title, not by number? Fixed: the design says the number would
  be the one literal that goes stale in an instruction file (the `qsm-i1u` problem), and a title
  search is one verb call.
- Why does a spec change get an issue at all when `tasks.md` holds its steps? Fixed: the design
  states it: the issue is what a maintainer and a pull request see; `tasks.md` is the agent's local
  breakdown, never an issue.
- Why is there no test-it task and no label `epic`? Fixed: the design says the epic is an issue
  type and the final proof is a stage with its own agent, so a per-epic sub-issue only duplicated
  what the board's Epics view shows. Epic #3 holds the owner's decision.
- Why is the epic's move to Ready For Test not in the skill's steps? Fixed: the design says a
  GitHub Action does it (`forge-board-verbs`), so no agent has to remember, and the skill only
  names it as something that happens.
- Why was `br` removed rather than kept for local tasks? Not restated here: epic #3 holds the
  decision and its rejected options, and this change cites it instead of copying it.

Scope sniper:

- The lens, the cockpit and `orient` readers could be a second change. Waived with the reason: they
  call `br`, so removing `br` from qsm-tasks without them leaves a broken `orient`; tasks.md orders
  them before the qsm-tasks lines and each is a one-file removal, not a redesign.
- The eval shim could be skipped by deleting the evals. Waived: the evals are how the skills are
  proved (`bun run eval`), and the shim is one script.
- The plan, grilling and spec-archive skills, their specs and the cockpit's stage text could be
  left saying test-it. Waived: they would tell the agent to create a task the flow no longer has;
  tasks.md group 9 edits them and each is a sentence.
- Question 3's "keep the pen-edit write" is the biggest piece of new behaviour here. Recorded as
  open question 3 with a drop-it fallback that removes the whole lens write path in one task.
