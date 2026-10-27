## Why

Epic #3 moves every task of this project from `.beads/issues.jsonl`, a file each branch carries its
own copy of, to GitHub Issues, so a protected `main` still works. The binary that reads and writes
those issues is the sibling change `qsm-tasks-cli` (the plugin's own `qsm-tasks` binary: every task
operation is one verb, the agent never composes `gh`). This change is the piece after it: the task
tool stops being `br`. The `task-tool` skill holds the model and the flow in terms of the new verbs,
and every file that reads or writes `.beads` or names `br` is changed or deleted, because "it is not
done if any step still needs `br`". It depends on `qsm-tasks-cli`.

## What Changes

- **The `task-tool` skill names GitHub Issues as the main task tool and the `qsm-tasks` verbs for
  every step.** It drops its `br` table and section. The model: an epic is an issue of the
  organization issue type `Epic` holding the intent and the done-when criteria, a task is an issue
  of type `Task` and a sub-issue of it, the change's steps live in `tasks.md`, close rules, deferred
  work, feedback tasks. The `task-writing` skill stays as it is.
- **The skill holds the expected flow, specific to our task tool.** Both flows, both definitions of
  done, which verb moves each step, and who may move what: a task moves Todo, In Progress (`claim`),
  In Review (`review`, pull request open, CI and the review bots), Ready For Human Review (`human`,
  CI green, every finding fixed), Done (merge with `Closes #N`, no verb); an epic moves Planning,
  Building (its first claim), Ready For Test (a GitHub Action, no verb), In Test (`qa`, the QA
  agent), Blocked (`finding`), Done (`accept`). The owner approves pull requests and accepts epics,
  the agent never does either on its own word; the QA agent runs In Test. The names and definitions
  are not copied: the skill says to run `qsm-tasks flow`, which prints them from the binary.
- **A QA agent replaces the test-it sub-issue.** An epic has no test-it task anymore. When every
  task is done the epic waits for the QA agent, which tests the whole against the business request
  and the acceptance criteria on the real path, in a Claude Code session on the owner's machine for
  now. A finding becomes a fix task under the epic (`finding`) and the epic is Blocked until it
  closes, then the Action sends it back to Ready For Test. The owner accepts the QA result
  (`accept`) and only then is the epic Done and closed. The grilling and plan skills, spec-archive
  and the cockpit's stage text say this instead of test-it, and spec-archive no longer closes an
  epic.
- **A change is bound to its task by a first line in the issue body**, `openspec: <change-id>`,
  written by `qsm-tasks spec` or `add --spec` and read by `find-spec`, because an issue has no
  external-reference field.
- **A merged pull request with `Closes #N` closes a task.** That is the close for a task; `close` is
  for work that has no pull request.
- **The main instruction file names the tools.** In `plugins/qsm-setup/instructions/CLAUDE.md`, the
  "Where things live" table's row "the task tool" names `qsm-tasks` with what tasks mean for us and
  its daily verbs, and the session archive row becomes the memory tool naming `qsm-memory` with what
  memory means for us and its daily verbs (rows in the design, decision 9).
- **qsm-tasks loses `br`.** Its install check and its `br` skill text go; the binary and the install
  are `qsm-tasks-cli`'s. The plugin declares no plug-in dependency.
- **The feedback rule moves.** `plugins/qsm-setup/instructions/CLAUDE.md` and the web-research agent
  name epic `qsm-i1u` in the task tool; they name instead the issue titled `Feedback on agents and
  tools` of type `Epic`, filed with `qsm-tasks feedback`, which finds it by title and labels the
  sub-issue `source:<who>`.
- **qsm-worktrunk stops writing `.beads/redirect`.** Issues are on GitHub, so a worktree has nothing
  to point at: `lib/task-store.ts`, the call in the create hook, `StoreIo` in `lib/node-io.ts`, and
  the "shares the task store" requirement go.
- **qsm-memory `orient` drops the in-progress and closed-task lines** (`lib/beads.ts`, the task
  part of `orient.ts`) and its dependency on qsm-tasks. See open question 1.
- **qsm-cockpit drops the Tasks card and the `tasks` verb**, and its dependency on qsm-tasks. See
  open question 2.
- **qsm-builder lens stops reading tasks and saves a pen edit as a loose task** through
  `qsm-tasks add`: `lens tasks`, the task part of `lens brief`, the open-task counts, the `.beads`
  carve-out in `lens/watch.ts` and the "open tasks reach the agent" hook go; `lens/edits.ts` calls
  `qsm-tasks add` without an epic. The dependency on `qsm-tasks` stays, for that one write. See open
  question 3.
- **qsm-toolbox loses its `br` row**, and `knip.jsonc` its `br` binary.
- **qsm-openspec's "no task tool store" stop** becomes "task tool not reachable" (`qsm-tasks doctor`
  does not pass): no GitHub remote, no login or no board stops spec-propose before it writes.
- **Evals that start from `br init`** (qsm-tasks, qsm-openspec, qsm-plan, qsm-review) get a fake
  `qsm-tasks` on PATH that records its arguments; see open question 4.

Not in this change: the `qsm-tasks` binary, its verbs, flow table, doctor, setup and the Action
(`qsm-tasks-cli`, which this change waits on), pull requests and review threads (qsm-forge, which
this change does not touch), the triage of the 98 open `br` tasks and the untracking of `.beads/`
(the migration piece of the epic, which runs after the readers here are gone), the organization and
its board (created by the maintainer), GitLab, and moving qsm-desktop, qsm-shell and qsm-workbench.

## Capabilities

### New Capabilities

None. Every requirement lands in an existing capability.

### Modified Capabilities

- `qsm-tasks`: GitHub Issues is the main task tool, reached through the plugin's own verbs; the
  model in GitHub terms; the task flow, the epic flow and the QA stage in the skill; no test-it
  task.
- `qsm-plan`: the epic's last piece is the QA stage, not a test-it task.
- `qsm-worktrunk`: the shared-task-store requirement removed.
- `qsm-memory`: the briefing without task lines; the dependency requirement removed.
- `qsm-cockpit`: the Tasks card and the `tasks` verb removed; the dependency requirement removed.
- `qsm-builder`: the lens without a task reader, an edit saved as a loose task, the dependency kept
  for that write.
- `qsm-toolbox`: the installer sentence no longer names `br`.
- `qsm-openspec`: the stop when no task tool is reachable; archive no longer closes an epic.
- `qsm-setup`: the one place for feedback is a GitHub issue, and the instruction file's table names
  the task tool and the memory tool.

## Impact

- Plugins: `qsm-tasks`, `qsm-worktrunk`, `qsm-memory`, `qsm-cockpit`, `qsm-builder`, `qsm-toolbox`,
  `qsm-openspec`, `qsm-plan`, `qsm-review`, `qsm-setup`, `qsm-web`, plus root `knip.jsonc`. The
  full list of files is `tasks.md`.
- `plugin.json` `dependencies`: `qsm-memory` and `qsm-cockpit` lose `qsm-tasks`; `qsm-builder`
  keeps it; `qsm-tasks` has none.
- The person: a session start no longer lists in-progress tasks and the cockpit has no Tasks card;
  the GitHub board is where that is seen.
- Waits on `qsm-tasks-cli`: nothing here can be applied or proved until the binary, its verbs, the
  flow table and the Action `epic-stage.yml` exist.
- The board, its two fields, its views and its built-in workflows are the owner's, set once in the
  web UI and measured; `qsm-tasks setup` and `doctor` own the rest.

## Open questions

1. **Does `orient` read in-progress issues, or drop that part?** Recommendation: drop. Session start
   would then need a network call that fails offline (and loud, by the one-path rule), and the
   briefing is meant to be built with no model call and no wait. The commits of a session's window
   already show what it did; the board shows what is in progress.
2. **Does the cockpit keep a Tasks card?** Recommendation: drop the card and the verb. It polls
   after every task-tool command; a polled network read is slower than the `br` file read it
   replaces, and GitHub's board is the view.
3. **Does the lens keep "a pen edit becomes a task"?** Recommendation: keep the write, through
   `qsm-tasks add` (one call, a loose task with no epic), and drop every read of tasks (open-task
   lists, counts, stale state of an edit). The in-flight `marketplace-lens` change specifies the
   edit-as-task requirement; archive that change first, or this one reconciles it.
4. **How do evals that need a task store run without GitHub?** Recommendation: a fake `qsm-tasks`
   on PATH that appends its arguments to a file the grader reads. Real `test:` issues for every
   eval run would be noise on the public repository, and the real path is proved once, by
   `qsm-tasks-cli` and the epic's QA stage.

## Critiques

Devil's advocate:

- A network call replaces a file read in every step of the flow (ready list, lookup, claim, close),
  so a session offline cannot track work. Waived with the reason stated: the epic decides GitHub is
  the main store, and the one-path rule says no fallback; the cost is that tracking stops offline,
  and the change says so in the skill's caveats and in the briefing decision (question 1).
- Binding by a first body line is fuzzier than `br`'s exact external reference. Fixed: `find-spec`
  filters for an exact first line and `qsm-tasks-cli` proves it on real issues (its task 0.3) before
  this change's skill relies on it; the label fallback lives inside the binary, so nothing here
  changes if it is taken.
- "A merged PR closes the task" fails for work without a PR (planning, a decision). Fixed: `close`
  stays for work that no merge closes, with a reason comment, and the skill says which to use.
- The QA agent runs in a session on the owner's machine, so an epic at Ready For Test waits until
  the owner starts it. Waived with the reason: the wait is visible (the Epics board column Ready For
  Test) and a dedicated machine is the later piece; a timer that starts QA by itself would be an
  unattended agent nobody approved.
- The skill says the owner accepts epics and approves pull requests, but the binary cannot tell the
  owner from the agent (one login). Waived with the reason: the stage guards stop a skipped stage,
  and the yes is a rule in the skill and a line in the reply; a per-person gate needs the App bot's
  second identity, a later piece.
- Dropping test-it leaves the epic's last proof with one tester. Fixed: the QA agent is a separate
  session that did not build the epic, tests against the business request and the criteria on the
  real path, and the owner still accepts the result before Done.
- qsm-plan and qsm-openspec depend on qsm-tasks, so plan now needs `gh` and a login. Waived: that is
  what "GitHub is the task tool" means; the prerequisite fails `missing` naming `gh`.

Future archaeologist:

- Why is the feedback epic found by title, not by number? Fixed: the design says the number would
  be the one literal that goes stale in an instruction file (the `qsm-i1u` problem), and
  `qsm-tasks feedback` is the one place that searches.
- Why does a spec change get an issue at all when `tasks.md` holds its steps? Fixed: the design
  states it: the issue is what a maintainer and a pull request see; `tasks.md` is the agent's local
  breakdown, never an issue.
- Why is there no test-it task and no label `epic`? Fixed: the design says the epic is an issue
  type and the final proof is a stage with its own agent, so a per-epic sub-issue only duplicated
  what the board's Epics view shows. Epic #3 holds the owner's decision.
- Why does the skill not list the stage definitions? Fixed: decision 1 says `qsm-tasks flow` owns
  names, definitions and guards, and the skill owns who acts and when, so a rename edits one file.
- Why does the CLAUDE.md table name `qsm-tasks` and `qsm-memory` when skills say "the task tool"?
  Fixed: decision 9 says the instruction file is the one place an agent learns, on every task, which
  binary serves a role; skills and agents keep the role name.
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
- The memory row in CLAUDE.md is not about tasks. Waived: it is the same table row edit, and
  naming one tool by binary and not the other would leave the table inconsistent.
- Question 3's "keep the pen-edit write" is the biggest piece of new behaviour here. Recorded as
  open question 3 with a drop-it fallback that removes the whole lens write path in one task.
