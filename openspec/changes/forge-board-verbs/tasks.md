Proof runs on this repository against the maintainer's board (owner and number named in the run)
with an issue titled `test: board ...`, closed afterwards. Every slice ends with `bun run
validate`, `bun run lint`, `bun run typecheck` and `bun test` green. Paths are under
`plugins/qsm-forge/` unless they start with `lib/` of the root. Slices 1 to 4 need the issue
verbs of `forge-issue-verbs` only to create the test issue, which `gh issue create` can do first.

## 1. board-add and board-set

Owns: `lib/github-board.ts` (new, arg builders and mappers), `lib/github-board.test.ts` (new),
`scripts/cli.ts`, `qsm.json`, the generated noun. Blocked by: nothing.

- [ ] 1.1 Test: "unknown status name calls nothing" and "board not named calls nothing" through
      `Run`
- [ ] 1.2 `board-add` (`item-add`, then `item-edit` when `--status`) and `board-set`
- [ ] 1.3 Real run: add `test: board` issue with Todo, set In Progress, read it with
  `gh project item-list`

## 2. board-status

Owns: `lib/github-board.ts`, its test, `qsm.json`. Blocked by: 1.

- [ ] 2.1 Test: recorded answer with the issue on a second board picks the matching owner and
      number; "not on the board" prints and exits 0
- [ ] 2.2 GraphQL read of `projectItems` with the Status value
- [ ] 2.3 Real run on the issue from 1.3 and on an issue not on the board

## 3. claim

Owns: `lib/github-board.ts`, its test, `qsm.json`. Blocked by: 1 and 2.

- [ ] 3.1 Tests: other login holds it is `blocked`, closed issue is `blocked`, repeat changes
      nothing, assignee refusal after the board change names it as done
- [ ] 3.2 The verb: read issue, board add, In Progress, assign `@me`
- [ ] 3.3 Real run: claim a `test:` issue twice, then see the assignee and Status

## 4. Done by merge, and the docs

Owns: `USAGE.md`, `README.md`, `INSTALL.md` (the `project` scope line), `openspec` spec merge at
archive. Blocked by: 3.

- [ ] 4.1 Real run: a throwaway pull request with `Closes #N` (issue `test: ...`) merged into the
  default branch of this repository once the maintainer has protected it, then `board-status`
  answers Done; the issue is closed afterwards. Closing keywords act only on the default branch, so
  this cannot run against a side branch
- [ ] 4.2 USAGE rows and README verbs count; the note that the board needs "Item closed" and
  "Pull request merged" on
