Piece 3 of epic #3 (<https://github.com/qsmark-labs/qsm-marketplace/issues/3>). Paths are from the
repository root. Every slice ends with `bun run validate`, `bun run lint`, `bun run typecheck` and
`bun test` green, and a test of a behaviour that is removed is removed with it. Proof is the real
path or an eval, not a unit test that restates the edit. The order keeps `br` usable until nothing
calls it: readers (groups 2 to 6), then the shim and evals (7), then the skill (8), then the rest (9
to 10), then the sweep (11). This change waits on `qsm-tasks-cli` (the binary, its verbs, `flow`,
`doctor` and the Action `epic-stage.yml`) for lines 1, 5, 7, 8 and 10; lines 2, 3, 4, 6 need no
`qsm-tasks` verb and can start now. The bound task lives in the epic, the steps live here. The epic
is an issue of type Epic and the QA stage replaces the test-it task, so every line that named
test-it or the label `epic` is rewritten for that: 1.1, 4.1, 7, 8, 9, 10 and 11.

## 1. Read qsm-tasks-cli as applied

Owns: nothing in the tree except verb names in this change's design.md table and the spec
scenarios, if a name moved. Blocked by: `qsm-tasks-cli` applied and `qsm-tasks` on PATH.

- [ ] 1.1 Read `qsm-tasks --help` and `qsm-tasks flow`; check every verb named in design.md
      decision 1 and the spec's scenarios exists with those flags and guards; fix the names here
      where they moved, and settle open questions 1 to 4 with the maintainer
- [ ] 1.2 Proof the skill can rely on: on a `test:` issue, `add --spec` then `find-spec` returns it
      and `find-spec` of a longer id returns `none`; close the issue

## 2. qsm-worktrunk stops writing the task-store redirect

Owns: `plugins/qsm-worktrunk/lib/task-store.ts` and `lib/task-store.test.ts` (delete),
`lib/node-io.ts` (the `StoreIo` half), `hooks/worktree-create.ts` (the `writeRedirect` import and
call, the header comment about the task store), `hooks/worktree-remove.ts` (the comment on the
redirect), `scripts/hooks.test.ts` (the redirect test, lines 56 to 70), `README.md` (lines 11, 26,
63), `.claude-plugin/plugin.json` (the description), `openspec/specs/qsm-worktrunk/spec.md` (the
removed requirement, at archive). Blocked by: nothing.

- [ ] 2.1 Delete the redirect; the create hook still prints the bare path git lists
- [ ] 2.2 Proof: the hook's own test spawns it against a temp repository and reads the printed
      absolute path and no `.beads` directory in the new workspace

## 3. qsm-memory orient without task lines

Owns: `plugins/qsm-memory/lib/beads.ts` (delete), `lib/orient.ts` (the `inProgress` and
`recentlyClosed` use, the `TrackerMissing` path, `beadLine`, the closed ids of a session window),
`lib/orient.test.ts` (the tracker fixture and its tests, lines 33 to 190), `scripts/cli.test.ts`
(the tracker test near line 261), `qsm.json` (the description of `orient`, line 179), `README.md`
(lines 14, 38 to 39, 69), `.claude-plugin/plugin.json` (`dependencies` becomes `[]`),
`openspec/specs/qsm-memory/spec.md` (the briefing requirement and the Dependencies requirement at
archive; also the design table row "Tasks for the briefing" and the "stub task tool" in its test
row, which are not requirements and are edited by hand at archive). Blocked by: open question 1 is
answered (recommendation: drop).

- [ ] 3.1 Remove the task part of `orient`; the briefing still fits 1500 characters
- [ ] 3.2 Proof: `qsm-memory orient` run in a temp repository that has a `.beads/` directory and
      no `br` on PATH prints the block and exits 0 (the real run through `runBin`)

## 4. qsm-cockpit without the Tasks card

Owns: `plugins/qsm-cockpit/lib/tasks.ts` (delete), `lib/cockpit.ts` (the `br close` id detection
near line 167 and the Tasks state, and the CLOSE stage text on line 68 that says "close the epic
only when ... test-it passed": it says the epic waits for QA and the owner's acceptance),
`hooks/register.tsx` (the `tasks` atom, the `$.cockpit.tasks()`
read, `tasksCard`, the card in the pane), `hooks/register.test.tsx` (the Tasks card tests, near
lines 270), `hooks/noun.generated.ts`, `scripts/cli.ts` (the `tasks` handler and the `br` probe in
`doctor`), `scripts/cli.test.ts`, `qsm.json` (the `tasks` verb and the `doctor` description),
`types/` if the plugin ships a contract, `USAGE.md` (lines 8 to 11), `README.md` (lines 30, 43 to
45), `INSTALL.md` (line 9), `.claude-plugin/plugin.json` (`dependencies` becomes `[]`),
`openspec/specs/qsm-cockpit/spec.md` (the pane requirement and two removed requirements, at
archive; also the Purpose sentence "the claimed tasks", edited by hand). Blocked by: open question 2
is answered (recommendation: drop).

- [ ] 4.1 Remove the card, the verb and the probe, and rewrite the CLOSE text; regenerate the noun
          with
      `bun lib/generate-noun.ts plugins/qsm-cockpit`
- [ ] 4.2 Proof: `bun run test:hooks` for the cockpit passes and `/cockpit` opens with Chat, Agents
      and Decisions only (the hooks test renders the pane)

## 5. qsm-builder lens: no task reads, one write through qsm-tasks

Owns: `plugins/qsm-builder/lib/lens/tasks.ts` and `brief.ts` (delete), `lib/lens/edits.ts` (the
`br create` call becomes a `qsm-tasks add` call with no epic, the error texts), `lib/lens/watch.ts`
(the `.beads` carve-out, lines 11 to 19), `lib/lens/model.ts`, `lib/lens/page.ts`,
`lib/lens/view.ts`, `lib/lens/serve.ts` (the open-task fields, stale state, task counts),
`lib/lens/pull.ts` and `pull.test.ts`, `lib/lens/serve.test.ts` (the `.beads` skip near line 225 and
the temp task store), `lib/lens/refs.test.ts`, `hooks/register.tsx` and `hooks/view.tsx` (the
first-read hook and the counts), `hooks/register.test.ts`, `hooks/noun.generated.ts`,
`scripts/cli.ts` (the `tasks` and `brief` handlers, the `doctor` probe becomes `qsm-tasks`),
`scripts/cli.test.ts` (the `br` test near line 173), `qsm.json` (`lens tasks`, `lens brief`,
descriptions on lines 10 and 121), `types/index.d.ts`, `references.txt` (the `beads` entry, line
38), `README.md` (line 39, 46), `USAGE.md` (the verbs on lines 62 to 77), `INSTALL.md` (lines 12 to
13), `skills/add-plugin/SKILL.md` and `skills/skill-standards/SKILL.md` (a grep for `lens tasks` and
`lens brief`), `.claude-plugin/plugin.json` (`dependencies` keeps `qsm-tasks`, its reason is now the
one write), `openspec/specs/qsm-builder/spec.md` (at archive). The active
`openspec/changes/marketplace-lens/` (its design 14, its requirement "An edit becomes one task in
the task tool", its task 3.3) is reconciled here if it has not archived yet. Blocked by: group 1,
open question 3.

- [ ] 5.1 The edit save calls `qsm-tasks add`; the title keeps the `<where>:` prefix
- [ ] 5.2 Remove every read of tasks; the page, `lens marketplace` and `lens plugin` print none
- [ ] 5.3 Proof: `qsm-builder lens` served from a temp marketplace, an edit posted to it, a
      `qsm-tasks` stub on PATH records one `add` call with the title and no `--epic`; no file named
      `.beads` appears and `qsm-builder doctor` says `missing` naming qsm-tasks when the stub is
      absent

## 6. qsm-toolbox and knip drop `br`

Owns: `plugins/qsm-toolbox/lib/catalog.ts` (the `br` row, lines 60 to 70),
`lib/catalog.test.ts` (the sentence naming `br`), `skills/toolbox/SKILL.md` (the description and the
row on line 22), `README.md` (line 52), `openspec/specs/qsm-toolbox/spec.md` (at archive), root
`knip.jsonc` (the `br` binary, line 50, and the comment on line 34). Blocked by: nothing.

- [ ] 6.1 Remove the row, the skill line and the knip entry
- [ ] 6.2 Proof: `qsm-toolbox doctor` lists no `br` and `bun run lint` (knip) passes

## 7. A fake qsm-tasks for the evals that scaffolded `br`

Owns: one shared stub, `lib/fixtures/` (the existing kit location; a `fakeBin` recording stub, in
root `lib` because four plugins' evals use it), and the scaffolds and prompts of
`plugins/qsm-tasks/evals/task-tool-last-child-of-epic/` (`scaffold.sh`, `prompt.md`,
`graders/store-state.md` which reads `.beads/issues.jsonl`, `graders/child-closed.md`,
`graders/epic-closed.md`), `plugins/qsm-openspec/evals/spec-archive-closes-every-bound-task/`
(`.sh`, `prompt.md`), `spec-propose-open-decisions-before-any-artifact/` (`.sh`, `prompt.md`,
`graders/task-bound-first.md`), `spec-propose-settled-brainstorm-becomes-apply-ready/` (`.sh`,
`prompt.md`, `graders/dependency-ordered-tasks.md`),
`plugins/qsm-plan/evals/plan-three-asks-three-sizes/` (`.sh`, `prompt.md`, `samples/pass.md`,
`samples/fail.md`),
`plugins/qsm-plan/evals/grilling-settled-facts-and-dependent-questions/prompt.md`,
`plugins/qsm-plan/evals/grilling-fire/prompt.md`,
`plugins/qsm-review/evals/release-readiness-czech-saas-launch/` (`.sh`, `prompt.md`,
`graders/tasks-for-missing.md`). Four of them carry test-it and change in what they grade, not only
in how they scaffold: the `Test it` task of the qsm-tasks scaffold goes, `store-state.md` and
`child-closed.md` pass when the child is closed with a reason and the epic is not closed and the
reply says it waits for QA, `epic-closed.md` is rewritten for the owner's acceptance, the
spec-archive grader `closes-tasks-and-epic.md` (line 8) says the epic waits for QA, and
`plugins/qsm-plan/evals/plan-three-asks-three-sizes/samples/pass.md` (lines 9 to 11 and 18) has no
test-it piece. Blocked by: open question 4, group 1.

- [ ] 7.1 The stub appends each call's arguments to a file, answers `ready`, `list`, `show` and
      `find-spec` with canned JSON, and is put on PATH by each scaffold in place of `br init` and
      `br create`
- [ ] 7.2 Graders read the recorded calls instead of `.beads/issues.jsonl`, and grade the QA
      wording above in place of test-it
- [ ] 7.3 Proof: `bun run eval qsm-tasks` for `task-tool-last-child-of-epic` passes with the new
      skill (after line 8), and the plan and openspec evals pass with their rewritten graders

## 8. The qsm-tasks skill, README and manifest

Owns: `plugins/qsm-tasks/skills/task-tool/SKILL.md` (rewritten: the model rules with epic as issue
type and no test-it (lines 24 and 35 and the table row on line 69), the task flow and the epic flow
with the QA stage, working rules, the verb table of design decision 1 with who acts and when, the
instruction to run `qsm-tasks flow` for names and definitions instead of copying them, caveats on
offline and the `project` scope, red flags; no `br`, no `.beads`, no `flush`, no `redirect`),
`README.md` (the lines about `br` and test-it; the rest is `qsm-tasks-cli`'s),
`.claude-plugin/plugin.json` (description, keywords, which name test-it today; `dependencies` stays
`[]`), `evals/task-tool-fire/`, `evals/unrelated-negative/` (unchanged unless the prompt names
`br`), `openspec/specs/qsm-tasks/spec.md` (the delta, and its Purpose paragraph by hand at archive),
`skills/task-writing/SKILL.md` (unchanged; check its "GitHub or GitLab issue today" line says
GitHub), `evals/task-tool-owner-accepts/` (new, see 8.2). Blocked by: groups 1 and 7.

- [ ] 8.1 Rewrite the skill from the delta spec, flows included; at most 8 KB
- [ ] 8.2 A new eval case, `task-tool-owner-accepts`: the epic is In Test, QA found nothing, the
      owner said nothing about accepting; the grader passes when the agent reports to the owner and
      runs no `accept`, and fails on a recorded `accept` call (the stub of group 7)
- [ ] 8.3 Proof: `bun run eval qsm-tasks` (fire, last-child-of-epic, owner-accepts, unrelated
      negative) passes
- [ ] 8.4 `bun run validate` passes; a grep of the skill and README for `\bbr\b`, `beads`,
      `.beads`, `test-it` and the label `epic` is empty

## 9. Skills and specs that stop on "no task store" or name test-it

Owns: `plugins/qsm-openspec/skills/spec-propose/SKILL.md` (step 2, lines 35 to 41: "No task store
reachable ... offer to initialize one" becomes "task tool not reachable: stop and name the
cause"), `skills/spec-archive/SKILL.md` (lines 12, 55 to 57: leave a task the merge already
closed), `skills/spec-apply/SKILL.md` (line 27, claim: unchanged unless it names a store),
`openspec/specs/qsm-openspec/spec.md` (at archive), `plugins/qsm-plan/skills/plan/SKILL.md` (a grep,
lines 29 to 42, 3 hits: the roles stay), `plugins/qsm-plan/skills/grilling/SKILL.md` (lines 81 and
94: "of kind decision" becomes a label), `plugins/qsm-review/skills/release-readiness/SKILL.md`
(line 23: no change expected), `plugins/qsm-plan/skills/plan/SKILL.md` (lines 86 to 95 and 125:
"Add the last piece, test-it" and the epic's close rule become the QA stage, and an epic is written
with type Epic and stage Planning), `plugins/qsm-plan/skills/grilling/SKILL.md` (line 93: "the
final test-it task checks" becomes "the QA agent checks"), `plugins/qsm-plan/openspec/specs/
qsm-plan/spec.md` (the Purpose sentence on line 7, by hand at archive; the requirement by the
delta), `plugins/qsm-openspec/skills/spec-archive/SKILL.md` (lines 58 to 62: the epic close rule
becomes "report the epic's stage, never close it"), `plugins/qsm-openspec/openspec/specs/
qsm-openspec/spec.md` (at archive), `plugins/qsm-essentials/skills/{writing,debugging,refactoring,
subagents}/SKILL.md` (one line each; no change expected, checked by the sweep). Blocked by: group 8.

- [ ] 9.1 Edit the two openspec skills; `bun run eval qsm-openspec` passes
- [ ] 9.2 Edit the plan and grilling skills; `bun run eval qsm-plan` passes with the rewritten
      grader sample

## 10. The instruction file and the feedback rule

Owns: `plugins/qsm-setup/instructions/CLAUDE.md` (two parts. The table "Where things live", line 68
and the session archive row below it: the two rows are replaced by the two rows of design decision 9
verbatim, three columns kept. The section "Feedback on how agents and tools behave", lines 99 to
109: epic `qsm-i1u` and the task-tool commands become the issue titled
`Feedback on agents and tools` of type `Epic`, filed with `qsm-tasks feedback`, which finds it by
title in the marketplace repository, and the sentence on the label that says who noticed is
deleted), `plugins/qsm-web/agents/web-research.md` (line 48: epic `qsm-i1u`),
`plugins/qsm-usage/skills/usage/SKILL.md` (line 94: "the task tool says how", no change expected),
`plugins/qsm-setup/openspec/specs/qsm-setup/spec.md` (at archive). The feedback epic issue itself is
created by `qsm-tasks setup` or the maintainer's migration piece, not by this change. Blocked by:
group 8.

- [ ] 10.1 Edit the three places; run `qsm-setup activate qsm-setup -- --instructions replace` in a
      sandbox Claude home and read that the activated `CLAUDE.md` has no `qsm-i1u`, one row names
      `qsm-tasks` with `ready`, `list --mine`, `show`, `claim` and `note`, and one names
      `qsm-memory` with `search`, `show` and `note`

## 11. The sweep, after the migration

Owns: root `.gitignore` and `.beads/` (not deleted here: the migration piece untracks it after the
triage), `AGENTS.md` (no `br` mention today; checked), `README.md` root (checked), the files a
final grep finds. Blocked by: groups 2 to 10, and the epic's triage task.

- [ ] 11.1 Sweep:
      `grep -rnIE "\bbr (ready|show|create|close|update|list|dep|comment|sync)|beads|\.beads|beads_rust|test-it"`
      over the tree outside `openspec/changes/archive/` and `.beads/` returns nothing, and
      `bun run validate` passes
- [ ] 11.2 Archive: merge the deltas and edit by hand what a delta cannot (the Purpose and design
      table sentences listed in groups 3, 4 and 8)
