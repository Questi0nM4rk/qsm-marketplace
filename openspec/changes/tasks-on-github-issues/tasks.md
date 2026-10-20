Piece 3 of epic #3 (<https://github.com/Questi0nM4rk/qsm-marketplace/issues/3>). Paths are from the
repository root. Every slice ends with `bun run validate`, `bun run lint`, `bun run typecheck` and
`bun test` green, and a test of a behaviour that is removed is removed with it. Proof is the real
path or an eval, not a unit test that restates the edit. The order keeps `br` usable until nothing
calls it: readers (groups 2 to 6), then the shim and evals (7), then the skill (8), then the rest (9
to 10), then the sweep (11). This change waits on `forge-issue-verbs` and `forge-board-verbs` for
lines 1, 5, 8 and 11; lines 2, 3, 4, 6, 7 need no forge verb and can start now. The bound task lives
in the epic, the steps live here.

## 1. Reconcile the verb names and prove the lookup

Owns: nothing in the tree except the verb names written in
`plugins/qsm-tasks/skills/task-tool/SKILL.md` (group 8) and the working names in this change's
design.md. Blocked by: `forge-issue-verbs`.

- [ ] 1.1 Read the archived or applied `forge-issue-verbs` and `forge-board-verbs`; replace the
      working verb names in this change's design.md table and the spec scenarios if they differ, and
      settle open question 5 (a `list` and a `view`) with the maintainer
- [ ] 1.2 Proof of the binding: create an issue titled `test: openspec binding` whose first body
      line is `openspec: tasks-on-github-issues`, another `test: openspec binding more` with
      `openspec: tasks-on-github-issues-more`, run the lookup (list plus exact first-line filter)
      and read that only the first is returned; close both. If the search misses, the binding
      becomes the label `change:<id>` and the proposal, design and the qsm-tasks delta change with
      it

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
near line 167 and the Tasks state), `hooks/register.tsx` (the `tasks` atom, the `$.cockpit.tasks()`
read, `tasksCard`, the card in the pane), `hooks/register.test.tsx` (the Tasks card tests, near
lines 270), `hooks/noun.generated.ts`, `scripts/cli.ts` (the `tasks` handler and the `br` probe in
`doctor`), `scripts/cli.test.ts`, `qsm.json` (the `tasks` verb and the `doctor` description),
`types/` if the plugin ships a contract, `USAGE.md` (lines 8 to 11), `README.md` (lines 30, 43 to
45), `INSTALL.md` (line 9), `.claude-plugin/plugin.json` (`dependencies` becomes `[]`),
`openspec/specs/qsm-cockpit/spec.md` (the pane requirement and two removed requirements, at
archive; also the Purpose sentence "the claimed tasks", edited by hand). Blocked by: open question 2
is answered (recommendation: drop).

- [ ] 4.1 Remove the card, the verb and the probe; regenerate the noun with
      `bun lib/generate-noun.ts plugins/qsm-cockpit`
- [ ] 4.2 Proof: `bun run test:hooks` for the cockpit passes and `/cockpit` opens with Chat, Agents
      and Decisions only (the hooks test renders the pane)

## 5. qsm-builder lens: no task reads, one write through qsm-forge

Owns: `plugins/qsm-builder/lib/lens/tasks.ts` and `brief.ts` (delete), `lib/lens/edits.ts` (the
`br create` call becomes a `qsm-forge gh create` call, the error texts), `lib/lens/watch.ts` (the
`.beads` carve-out, lines 11 to 19), `lib/lens/model.ts`, `lib/lens/page.ts`, `lib/lens/view.ts`,
`lib/lens/serve.ts` (the open-task fields, stale state, task counts), `lib/lens/pull.ts` and
`pull.test.ts`, `lib/lens/serve.test.ts` (the `.beads` skip near line 225 and the temp task store),
`lib/lens/refs.test.ts`, `hooks/register.tsx` and `hooks/view.tsx` (the first-read hook and the
counts), `hooks/register.test.ts`, `hooks/noun.generated.ts`, `scripts/cli.ts` (the `tasks` and
`brief` handlers, the `doctor` probe becomes `qsm-forge`), `scripts/cli.test.ts` (the `br` test near
line 173), `qsm.json` (`lens tasks`, `lens brief`, descriptions on lines 10 and 121),
`types/index.d.ts`, `references.txt` (the `beads` entry, line 38), `README.md` (line 39, 46),
`USAGE.md` (the verbs on lines 62 to 77), `INSTALL.md` (lines 12 to 13),
`skills/add-plugin/SKILL.md` and `skills/skill-standards/SKILL.md` (a grep for `lens tasks` and
`lens brief`), `.claude-plugin/plugin.json` (`qsm-tasks` becomes `qsm-forge`),
`openspec/specs/qsm-builder/spec.md` (at archive). The active `openspec/changes/marketplace-lens/`
(its design 14, its requirement "An edit becomes one task in the task tool", its task 3.3) is
reconciled here if it has not archived yet. Blocked by: group 1 (the create verb), open question 3.

- [ ] 5.1 The edit save calls `qsm-forge gh create`; the title keeps the `<where>:` prefix
- [ ] 5.2 Remove every read of tasks; the page, `lens marketplace` and `lens plugin` print none
- [ ] 5.3 Proof: `qsm-builder lens` served from a temp marketplace, an edit posted to it, a
      `qsm-forge` stub on PATH records one `gh create` call with the title; no file named `.beads`
      appears and `qsm-builder doctor` says `missing` naming qsm-forge when the stub is absent

## 6. qsm-toolbox and knip drop `br`

Owns: `plugins/qsm-toolbox/lib/catalog.ts` (the `br` row, lines 60 to 70),
`lib/catalog.test.ts` (the sentence naming `br`), `skills/toolbox/SKILL.md` (the description and the
row on line 22), `README.md` (line 52), `openspec/specs/qsm-toolbox/spec.md` (at archive), root
`knip.jsonc` (the `br` binary, line 50, and the comment on line 34). Blocked by: nothing.

- [ ] 6.1 Remove the row, the skill line and the knip entry
- [ ] 6.2 Proof: `qsm-toolbox doctor` lists no `br` and `bun run lint` (knip) passes

## 7. A fake qsm-forge for the evals that scaffolded `br`

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
`graders/tasks-for-missing.md`). Blocked by: open question 4, group 1 (verb names).

- [ ] 7.1 The stub appends each call's arguments to a file, answers `list` and `view` with canned
      JSON, and is put on PATH by each scaffold in place of `br init` and `br create`
- [ ] 7.2 Graders read the recorded calls instead of `.beads/issues.jsonl`
- [ ] 7.3 Proof: `bun run eval qsm-tasks` for `task-tool-last-child-of-epic` passes with the new
      skill (after line 8); the other four evals pass unchanged in what they grade

## 8. The qsm-tasks skill, README and manifest

Owns: `plugins/qsm-tasks/skills/task-tool/SKILL.md` (rewritten: the model rules, working rules, a
verb map, caveats on offline and the `project` scope, red flags; no `br`, no `.beads`, no `flush`,
no `redirect`), `README.md` (why it exists, what you get, install, use, caveats),
`.claude-plugin/plugin.json` (description, keywords, `dependencies: ["qsm-forge"]`),
`scripts/install.ts` and `scripts/install.test.ts` (delete), `evals/task-tool-fire/`,
`evals/unrelated-negative/` (unchanged unless the prompt names `br`),
`openspec/specs/qsm-tasks/spec.md` (the delta, and its Purpose paragraph by hand at archive),
`skills/task-writing/SKILL.md` (unchanged; check its "GitHub or GitLab issue today" line says
GitHub). Blocked by: groups 1 and 7.

- [ ] 8.1 Rewrite the skill from the delta spec; at most 8 KB
- [ ] 8.2 Proof: `bun run eval qsm-tasks` (fire, last-child-of-epic, unrelated negative) passes
- [ ] 8.3 `bun run validate` passes; a grep of the skill for `\bbr\b`, `beads`, `.beads` is empty

## 9. Skills and specs that stop on "no task store"

Owns: `plugins/qsm-openspec/skills/spec-propose/SKILL.md` (step 2, lines 35 to 41: "No task store
reachable ... offer to initialize one" becomes "task tool not reachable: stop and name the
cause"), `skills/spec-archive/SKILL.md` (lines 12, 55 to 57: leave a task the merge already
closed), `skills/spec-apply/SKILL.md` (line 27, claim: unchanged unless it names a store),
`openspec/specs/qsm-openspec/spec.md` (at archive), `plugins/qsm-plan/skills/plan/SKILL.md` (a grep,
lines 29 to 42, 3 hits: the roles stay), `plugins/qsm-plan/skills/grilling/SKILL.md` (lines 81 and
94: "of kind decision" becomes a label), `plugins/qsm-review/skills/release-readiness/SKILL.md`
(line 23: no change expected), `plugins/qsm-essentials/skills/{writing,debugging,refactoring,
subagents}/SKILL.md` (one line each; no change expected, checked by the sweep). Blocked by: group 8.

- [ ] 9.1 Edit the two openspec skills; `bun run eval qsm-openspec` passes

## 10. The feedback rule moves to a GitHub issue epic

Owns: `plugins/qsm-setup/instructions/CLAUDE.md` (the section "Feedback on how agents and tools
behave", lines 99 to 109: epic `qsm-i1u` and the task-tool commands become the issue titled
`Feedback on agents and tools` with the label `epic`, found by title, sub-issue with label
`source:<who>`, filed with the qsm-forge verbs in the marketplace repository),
`plugins/qsm-web/agents/web-research.md` (line 48: epic `qsm-i1u`),
`plugins/qsm-usage/skills/usage/SKILL.md` (line 94: "the task tool says how", no change expected),
`plugins/qsm-setup/openspec/specs/qsm-setup/spec.md` (at archive). The feedback epic issue itself is
created by the maintainer's migration piece, not by this change. Blocked by: group 8.

- [ ] 10.1 Edit the two files; run `qsm-setup activate qsm-setup -- --instructions replace` in a
      sandbox Claude home and read that the activated `CLAUDE.md` has no `qsm-i1u`

## 11. The sweep, after the migration

Owns: root `.gitignore` and `.beads/` (not deleted here: the migration piece untracks it after the
triage), `AGENTS.md` (no `br` mention today; checked), `README.md` root (checked), the files a
final grep finds. Blocked by: groups 2 to 10, and the epic's triage task.

- [ ] 11.1 Sweep:
      `grep -rnIE "\bbr (ready|show|create|close|update|list|dep|comment|sync)|beads|\.beads|beads_rust"`
      over the tree outside `openspec/changes/archive/` and `.beads/` returns nothing, and
      `bun run validate` passes
- [ ] 11.2 Archive: merge the deltas and edit by hand what a delta cannot (the Purpose and design
      table sentences listed in groups 3, 4 and 8)
