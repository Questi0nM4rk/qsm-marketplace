## 1. Points and the point table

- [x] 1.1 `lib/registry.ts`: `Point` is `edit | pre-commit | pre-push | ci`; `POINTS` holds each
      target and timeout (design D2); every checker's `runsAt` and `prePush` become a required
      `points` list with per-point overrides, `ci` included; `selectedAt` reads `points`; `list` and
      `list --json` print `points`. Files: `lib/registry.ts`, `lib/registry.test.ts`, the verbs that
      read `runsAt` (`grep -rn runsAt lib hooks`). Proof:
      `qsm-langdev list --json | jq '.[].points'` prints four-point lists, and
      `bun test plugins/qsm-langdev` passes. Blocked by nothing.
- [x] 1.2 `lib/compare.ts`, `lib/edit-findings.ts`, `hooks/gate-hook.ts`: every limit read from
      `POINTS`; `STUCK_MS`, `DEFAULT_CHECK_BUDGET_MS` and the `dotnet-format` `timeoutMs` deleted;
      the stop gate runs at `pre-commit`; `QSM_LANGDEV_GATE_BUDGET_MS` stays the stop gate's test
      seam. Proof: `grep -rnE "STUCK_MS|CHECK_BUDGET" lib hooks` finds nothing, and the stop gate
      test with the seam still reports not measured. Blocked by 1.1.

## 2. The edit set

- [x] 2.1 Measure every checker of every language, per file type, on real files of this repository
  (the stack's other repos for a language this one lacks): the cost, three runs of one file on a
  quiet machine, and the use, what each finds under the project's rules that no faster checker of
  the same file type finds. Pick the edit set by the two rules of design D3 and record the table and
  the reason per checker in the change's `measurements.md`. Files: `measurements.md`,
  `lib/registry.ts`. Proof: the table, and `qsm-langdev list --json` agreeing with it. Blocked by
  1.1.
- [x] 2.2 The edit hook runs the `edit` set. Reopened 2026-10-31: the store sharing with
      `pre-commit` it shipped is gone with 2.5. Files: `lib/edit-findings.ts`. Proof: the real path
      at load: run `qsm-langdev edited <abs .ts file> --session probe` three times while
      `stress-ng --cpu 12` runs; each answers under 7.5 s with the TypeScript edit set and no
      semgrep. Blocked by 2.1.
- [x] 2.3 Reopened 2026-10-31 (the `+` marks against HEAD go with 2.5). What the model gets: the
  project's errors in the edited file and nothing else; every
  `not run`, `not measured`, total and `slow` line to the hook's log. Files: `lib/edit-findings.ts`,
  `hooks/register.tsx`. Proof: in this repository, write a clean `.md` file and a `.ts` file with
  one oxlint finding through the real hook in a Claude Code session; the first adds no context, the
  second only that finding. Blocked by 2.2.
- [x] 2.4 Feedback `qsm-i1u.97`: the gate's copy of the tree resolves types as the checkout does,
  so a hooks module scores no `no-unsafe-*` finding the checkout lacks. Files: where the copy is
  made (`lib/tree.ts`, `lib/compare.ts`). Proof: a commit that adds a hooks module oxlint passes in
  the checkout is no worse at the commit gate, and `qsm-i1u.97` closes with the measured run.
  Blocked by nothing. Done 2026-10-31 without code: not reproducible at 8c563f0a (oxlint 0 -> 0
  through `check` and a real commit); fixed by 3262884a and 396218a2, `qsm-i1u.97` closed.
- [x] 2.5 The edit hook checks in place: the edit set runs on the live file with the project's
  config, no HEAD side, no scratch tree, no store; an untracked file is checked too; the
  `StorePoint` mapping of `edit` to `pre-commit` goes. Files: `lib/edit-findings.ts`,
  `lib/compare.ts`, `lib/registry.ts`, `lib/result-store.ts`. Proof: through the real hook in a
  session, a new unstaged `.ts` file with an oxlint finding reports it; a finding already at HEAD is
  reported too; the timing table of `measurements.md` measured again. Blocked by nothing.

## 3. Slow lines and doctor

- [x] 3.1 A scored checker records its wall time; over target the report prints the `slow:` line;
      times append to `.qsm-langdev/timings/<point>.jsonl`, last 10 per checker. Files:
      `lib/compare.ts`, a new `lib/timings.ts` (one job: the timing record, read by compare and
      doctor). Proof: a commit in a sandbox repo with `POINTS` target overridden to 1 ms through the
      test seam prints the slow line and passes; the file holds 10 lines after 12 runs. Blocked by
      1.2.
- [x] 3.2 `doctor` names a checker whose median at a point is over target. Files: the doctor verb,
  `lib/timings.ts`. Proof: `qsm-langdev doctor` in a sandbox with a recorded file of 10 runs at 41 s
  prints the warning of the spec scenario and exits as before. Blocked by 3.1.

## 4. The registry gate

- [ ] 4.1 `registryGaps` fails a language without both profiles (but `fish`) or without a checker at
      a point. Files: `lib/registry.ts`, `lib/registry.test.ts`. Proof: `bun test` passes on the
      real registry, and fails with `dotnet: no checker at edit` when the test removes dotnet's edit
      checkers. A language the measurements of 2.1 leave without an edit checker is a question for
      the owner before this line closes. Blocked by 2.1.

## 5. CI

- [x] 5.1 CI green again: today every run fails at `bun install --frozen-lockfile`, and before that
  at `Test`. Find each cause from the run logs and fix it. Files: what the logs name. Proof: a green
  `CI` run on `main`. Blocked by nothing.
- [ ] 5.2 Verify that `semgrep scan --pro` with only `SEMGREP_APP_TOKEN` set runs the Pro engine and
      uploads nothing (design D7 says unverified). Proof: one local run with the token from
      `qsm-secrets`, its output and the semgrep docs page quoted in `measurements.md`. Blocked by
      nothing.
- [ ] 5.3 The `ci` point: semgrep's `ci` form is `scan --pro` over the whole tree, a missing token
  fails naming it; `check --at ci` accepted. Files: `lib/registry.ts`, `lib/compare.ts`. Proof:
  `qsm-langdev check --at ci --against HEAD~1` locally, once with and once without the token.
  Blocked by 1.2 and 5.2.
- [ ] 5.4 The `langdev` job in `.github/workflows/ci.yml` (spec: CI runs the ci point). Proof: the
  job green on a push to `main`, its log showing the `ci` comparison; the owner adds the
  `SEMGREP_APP_TOKEN` secret first. Blocked by 5.1 and 5.3.

## 6. Docs and landing

- [ ] 6.1 `README.md` and `USAGE.md`: the four points, their targets and timeouts, the `slow:` line,
  the doctor warning. Proof: `bun run validate` and markdownlint pass. Blocked by 3.2 and 5.3.
- [ ] 6.2 Measure again the table of the design's Context on the same machine and add the after
      column to `measurements.md`. Proof: edit `.ts` under 7.5 s at load 15. Blocked by everything
      above.
