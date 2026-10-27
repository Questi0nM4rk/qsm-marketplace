The steps of this one change, in dependency order. Paths are under `plugins/qsm-tasks/` unless they
start with `lib/` of the root or `.github/`. Every group ends with `mise exec -- bun run validate`,
`lint`, `typecheck` and `bun test ./ ./.gates` green, and adds nothing beyond the ask. Proof runs
on `qsmark-labs/qsm-marketplace` and org Project #1 through the built binary with `--json`; every
issue it creates is titled `test: ...` and is closed (not planned) before the group is ticked, and a
search for open `test:` issues is empty at the end. The owner has made the board, its fields, views
and workflows; nothing here creates them on this repository.

## 0. Measure what the backend does

Owns: nothing in the tree; the answers go into design decisions 4, 6, 9 and 11. Blocked by: nothing.

- [ ] 0.1 `gh issue create --parent` with a label that does not exist: does it leave an issue
      behind? `gh issue list --search "-is:blocked"` with a closed blocker: does it still block?
- [ ] 0.2 `subIssuesSummary` right after a close: is it current at the moment the `issues: closed`
      event runs? (settles whether the Action needs the search count)
- [ ] 0.3 Is the first-body-line search exact enough: issues bound to `add-x` and `add-x-more`,
      `gh issue list --search '"openspec: add-x" in:body'` then the first-line filter returns only
      the first? If not, decision 6 falls back to the label `change:<id>`
- [ ] 0.4 Can GraphQL read the project's workflows (`workflows { name enabled }`) and views (name),
      and write fields, options with descriptions and issue types? Each answer is `ok` or `manual`
      for `doctor`/`setup` (design 11)
- [ ] 0.5 Close every `test:` issue; edit the decisions the answers change

## 1. The binary exists: manifest, flow table, `flow`, install

Owns: `qsm.json` (every verb of the spec with typed args, `--repo`, `--project`), `scripts/cli.ts`
(`runCli` map: `flow` real, the other verbs absent until their group), `lib/flow.ts` and
`lib/flow.test.ts` (the table as data; the test is the one place a guard is asserted against the
spec's scenarios), `scripts/install.ts` (one `installScript(import.meta)` call, replaces the `br`
probe; delete `scripts/install.test.ts`), `types/index.d.ts` and `hooks/noun.generated.ts`
(generated with `bun lib/generate-noun.ts plugins/qsm-tasks`), `.claude-plugin/plugin.json`
(`types`, description, keywords, no `br`). Blocked by: 0.

- [ ] 1.1 `qsm.json` declares all thirty-four verbs; `checkHandlers` fails for the verbs not yet
      handled, so unfinished verbs are registered as handlers that exit `failed` with reason
      `not-built` until their group lands and this stub is deleted in group 9
- [ ] 1.2 `lib/flow.ts`: Status and Epic stage options with the definitions of the spec's table,
      each verb's guard and effect
- [ ] 1.3 Proof: `qsm-setup install qsm-tasks`, then `qsm-tasks --help` lists the verbs and
      `qsm-tasks flow --json` prints both flows and the two definitions of done; a second install
      changes nothing

## 2. The backend seam and the read verbs

Owns: `lib/backend.ts` (the `Backend` type and the item, kind, field types), `lib/backend-for.ts`,
`lib/github/{run,resolve,read}.ts` (repository and board resolution, `gh` reads),
`lib/verbs/read.ts` (`ready`, `list`, `show`, `tree`, `search`, `notes`, `board`), `lib/render.ts`
(row and line text, one place), `scripts/cli.ts`. Blocked by: 1.

- [ ] 2.1 Resolution: `--repo`, origin, linked board, `--project`; `no-repo`, `no-board`, `no-gh`
      are typed errors
- [ ] 2.2 The seven reads; `ready` is one search plus the Todo filter; text and `data` shape per the
      spec, no node id anywhere
- [ ] 2.3 One `bun test` through `runBin` with a recording fake `gh`: a usage error runs no call;
      the output of `ready` is byte-identical twice
- [ ] 2.4 Proof: on this repository `qsm-tasks tree 3`, `list --epic 3`, `show 4`, `board`,
      `search "task"`, `notes 3`; `ready` omits the epic; each `--json` has no node id

## 3. Create and comment verbs

Owns: `lib/github/write.ts` (create issue by body on stdin, sub-issue, blocked-by, comment, labels,
type), `lib/verbs/create.ts` (`epic`, `add`, `feedback`, `note`), `scripts/cli.ts`. Blocked by: 2.

- [ ] 3.1 `epic` (type Epic, stage Planning), `add` (`--epic`, `--after`, `--spec`, `--label`),
      `note`; the body reaches `gh` on stdin; the rule that `add` under Ready For Test or In Test
      sets Building and under Done is refused
- [ ] 3.2 `feedback`: finds the epic by exact title in the `QSM_MARKETPLACE` checkout's repository,
      comments on an open same-title issue, else creates under it with `source:<who>`
- [ ] 3.3 Proof: `epic "test: epic" --intent` a file with backticks, two `add --epic` tasks with
      `--after`, `tree` shows order and stage Planning, `note` posts exactly the text; a `feedback`
      from another directory lands in this repository, a repeat comments instead; `add --epic` on
      a missing label exits `failed` and `list` shows nothing new

## 4. Edit verbs

Owns: `lib/verbs/edit.ts` (`edit`, `move`, `after`, `unblock`, `assign`, `spec`, `find-spec`),
`lib/github/write.ts`, `scripts/cli.ts`. Blocked by: 3.

- [ ] 4.1 The seven verbs; `edit --body` keeps the binding line; `find-spec` filters to the exact
      first line
- [ ] 4.2 Proof: `spec` two test tasks `add-x` and `add-x-more`, `find-spec add-x` prints one;
      `after` / `unblock` change what `ready` lists; `after` that would cycle exits `failed`;
      `unblock` of a missing blocker exits `failed` naming both

## 5. Task flow verbs

Owns: `lib/verbs/task-flow.ts` (`claim`, `release`, `review`, `human`, `reopen`, `close`, `drop`,
`defer`), `lib/github/fields.ts` (set a Status or Epic stage, add to board), `scripts/cli.ts`,
`lib/verbs/task-flow.test.ts` through `runBin` with a recording fake `gh` (a guard refusal runs no
write; a refused second write of `claim` names the first). Blocked by: 4.

- [ ] 5.1 The eight verbs read their guard and effect from `lib/flow.ts`; `claim` writes the board
      item, Status, assignee, then the epic, each idempotent
- [ ] 5.2 Proof: a `test:` task `claim`ed twice (second changes nothing), epic Building; `human`
      from In Progress is `blocked`; `review`, `human`, `review` again; `defer` then `release`;
      `close --reason` and `drop --reason` on two others; `reopen`; another login's task is `held`
      (a second account, or a recorded answer when none exists)
- [ ] 5.3 `claim` run before the auto-add workflow finished (the item is not on the board yet)
      succeeds

## 6. The Action

Owns: `.github/workflows/epic-stage.yml` (new). Blocked by: 1 (it uses the same option names) and
the owner setting the secret `PROJECT_TOKEN`.

- [ ] 6.1 The workflow: `issues: closed`, concurrency per parent, `gh` calls only (parent and type,
      `subIssuesSummary`, the parent's stage, `gh project item-edit`)
- [ ] 6.2 Proof: under `test: epic` at Building with two `test:` tasks, close one (stage
      unchanged), close the other (Ready For Test within a minute); read the Actions run; a missing
      secret fails the run visibly (`gh secret remove` then restore is the owner's, so this case is
      shown on a fork or skipped and named)
- [ ] 6.3 A merged throwaway pull request with `Closes #N` on a `test:` task: `show N` prints Done

## 7. Epic flow verbs

Owns: `lib/verbs/epic-flow.ts` (`plan`, `qa`, `finding`, `accept`, `reject`), `scripts/cli.ts`,
the epic cases of `lib/verbs/task-flow.test.ts`. Blocked by: 5 and 6.

- [ ] 7.1 The five verbs from the flow table; `finding` and `reject` create the fix task before the
      stage write
- [ ] 7.2 Proof, the whole loop on `test: epic`: claim and close both tasks (Action: Ready For
      Test), `qa` (In Test), `finding` (Blocked, a fix task), close the fix task (Action: Ready For
      Test), `qa`, `reject --reason` (Building, a task), close it, `qa`, `accept` (Done, closed);
      `accept` from Ready For Test exits `blocked`; `plan` on Building returns Planning

## 8. doctor, setup and the guard against drift

Owns: `lib/github/check.ts`, `lib/github/setup.ts`, `lib/verbs/admin.ts`, `scripts/cli.ts`. Blocked
by: 0.4 and 6.

- [ ] 8.1 `doctor`: each check of the spec with `ok`, `failed` or `manual` and its fix; reads the
      Action file's field and option names against the flow table
- [ ] 8.2 `setup`: fields with options and definitions, issue types, labels, the feedback epic;
      idempotent; prints the manual remainder
- [ ] 8.3 Proof: `doctor` on this repository reads every line and exits as the measurement of 0.4
      allows; a scratch board made with `gh project create` takes `setup` (both fields, all
      options with definitions appear), a second `setup` changes nothing, `doctor` lists the views,
      workflows and secret as `manual` for it, and the scratch board is deleted

## 9. Docs, the old stub and the spec

Owns: `README.md` (`## Why it exists` rewritten whole in at most five sentences: names the binary,
what it refuses to be, when it would have no reason to exist; what you get; install; use; caveats),
`INSTALL.md` and `USAGE.md` (one row per verb: flags, data, exit codes), the `not-built` stub of
1.1 (deleted), `openspec/specs/qsm-tasks/spec.md` (the delta merged at archive; its Purpose
paragraph edited by hand). Blocked by: 7 and 8.

- [ ] 9.1 Docs written, the stub deleted, `bun lib/generate-noun.ts plugins/qsm-tasks` clean
- [ ] 9.2 `mise exec -- bun run validate`, `lint`, `typecheck`, `bun test ./ ./.gates`,
      `bun run test:hooks` exit 0; `qsm-tasks` prints no output on a verb when `gh` is absent except
      the `missing` outcome (`PATH` without `gh`)
- [ ] 9.3 Hand the diff to the `qsm-review` strict-reviewer with the add-tool and add-plugin hard
      rules as its checklist; fix every finding that holds
