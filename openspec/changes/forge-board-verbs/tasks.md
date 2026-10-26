Proof runs on this repository against org Project #1 (owner `qsmark-labs`, number 1) with issues
titled `test: board ...` and an epic `test: board epic` of type Epic, all closed afterwards. Every
slice ends with `bun run validate`, `bun run lint`, `bun run typecheck` and `bun test` green.
Paths are under `plugins/qsm-forge/` unless they start with `lib/` of the root or `.github/`.
Slices 1 to 3 need the issue verbs of `forge-issue-verbs` only to create the test issues, which
`gh issue create --type Task|Epic --parent` can do first. The owner has already made the board,
its fields, views and workflows; nothing here creates them.

## 1. board-set and board-status

Owns: `lib/github-board.ts` (new, arg builders and mappers), `lib/github-board.test.ts` (new),
`scripts/cli.ts`, `qsm.json`, the generated noun. Blocked by: nothing.

- [ ] 1.1 Test: "unknown option name calls nothing", "both fields or none calls nothing", "board
      not named calls nothing" and "stage on a task is refused" through `Run`
- [ ] 1.2 `board-set` (one GraphQL read for type and ids, then `item-edit`) and `board-status`
- [ ] 1.3 Test: recorded answer with the issue on a second board picks the matching owner and
      number; "not on the board" prints and exits 0
- [ ] 1.4 Real run: create `test: board task` (it reaches Todo through the auto-add workflow),
      `board-set --status "In Review"`, `board-status` reads it, then the same on `test: board
      epic` with `--stage Planning`, and `--stage` on the task is refused

## 2. claim

Owns: `lib/github-board.ts`, its test, `qsm.json`. Blocked by: 1.

- [ ] 2.1 Tests: other login holds it is `blocked`, closed issue and an epic are `blocked`, repeat
      changes nothing, a refusal after the board change names the writes done
- [ ] 2.2 The verb: read, board add, In Progress, assign `@me`, epic Planning to Building
- [ ] 2.3 Real run: claim the `test:` task twice, then see the assignee, Status In Progress and
      the epic at Building

## 3. Done by merge

Owns: nothing in the tree. Blocked by: 2.

- [ ] 3.1 Real run: a throwaway pull request with `Closes #N` (issue `test: ...`) merged into the
      default branch of this repository, then `board-status` answers Done; the issue is closed
      afterwards. Closing keywords act only on the default branch, so this cannot run against a
      side branch

## 4. The Action: epic to Ready For Test

Owns: `.github/workflows/epic-stage.yml` (new). Blocked by: 1 (it uses the same field and option
names) and the owner setting the repository secret `PROJECT_TOKEN`.

- [ ] 4.1 The workflow: trigger `issues: closed`, a concurrency group per parent, `gh` calls only
      (parent and type, `subIssuesSummary`, the parent's stage, `gh project item-edit`)
- [ ] 4.2 Real run: under `test: board epic` at Building with two `test:` tasks, close one (stage
      unchanged), close the other (stage becomes Ready For Test within a minute); read the Actions
      run. This measures `subIssuesSummary` at the close event and the token. If the summary lags,
      count open sub-issues with a search instead and run again
- [ ] 4.3 Real run of the loop back: set the epic to Blocked, create a `test:` fix task under it,
      close it, and read Ready For Test; a wrong or missing secret fails the run visibly

## 5. The docs

Owns: `USAGE.md`, `README.md`, `INSTALL.md` (the `project` scope line and the `PROJECT_TOKEN`
secret), `openspec` spec merge at archive. Blocked by: 2 and 4.

- [ ] 5.1 USAGE rows for the three verbs and README verbs count
- [ ] 5.2 The note that the board needs the four workflows on, the two fields with their options,
      and that views and workflows are set once in the web UI
