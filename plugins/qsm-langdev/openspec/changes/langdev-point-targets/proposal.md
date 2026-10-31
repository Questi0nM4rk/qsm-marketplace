## Why

qsm-langdev has one time limit per run and no idea of how long a checker should take, so a limit set
close to the expected time fails a run that is merely slow, and a run that is slow every time is
never seen. The edit hook runs the whole commit set: one `.ts` edit took 16.0 to 18.2 s at a load of
13 to 18 and 8.4 to 12.0 s at a load of 2.4, measured on 2026-10-31, while the engine gives the hook
10 s, so under load the model gets no findings for a TypeScript edit. CI never runs langdev at all,
and the Pro semgrep run the spec gives to CI has no job.

## What Changes

- Every checker declares the points it runs at, out of four: `edit`, `pre-commit`, `pre-push`, `ci`.
  The edit hook runs the `edit` set, no longer the `pre-commit` set.
- Each point has a target time per checker and a timeout, one table in the main CLI:

  | Point | Target per checker | Timeout |
  | --- | --- | --- |
  | edit | 5 s | the engine's 10 s per hook (the checkers share what is left of 7.5 s) |
  | pre-commit (commit hook, stop gate, `check`) | 30 s | 5 min |
  | pre-push | 1 min | 5 min |
  | ci | 10 min | 20 min |

- A checker run over its target is reported `slow` with its measured time and never fails. A run
  over its timeout stays `not measured`, as today.
- Every run's time is kept per checker and point; `doctor` names a checker whose median over its
  last 10 runs is above its target.
- Every language rules set in the registry SHALL have a `general` and a `strict` profile and at
  least one checker at each point; a gate fails the registry otherwise.
- semgrep leaves the `edit` point (9.0 s for one file alone); it still scans the changed files at
  commit and push.
- The edit set is picked per language and file type from a measurement of every tool: what it costs
  on one file and what it finds under the project's rules that a faster tool does not.
- The edit hook fixes with the project's own rules, then tells the model only the errors the
  project's rules raise in the file; `not run`, `not measured`, totals and `slow` go to the hook's
  log.
- Feedback `qsm-i1u.97`: the gate's copy of the tree resolves types as the checkout does, so a
  hooks module no longer scores dozens of false `no-unsafe-*` findings.
- **BREAKING** for the stop gate: its per-checker budget of 55 s becomes the `pre-commit` timeout of
  5 min, with the 30 s target.
- A new `langdev` job in `.github/workflows/ci.yml` runs `qsm-langdev check --at ci` against the
  commit the push replaced, with the Pro semgrep run over the whole tree. CI is red since
  2026-10-21; the job lands on a green CI.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `qsm-langdev`: points become four with a target and a timeout each; slow runs are reported and
  tracked; the edit hook runs its own set; every language has both profiles and every point; the
  Pro semgrep run gets its CI job.

## Impact

- `lib/registry.ts`: `runsAt` and `prePush` become the declared points, the point table,
  `registryGaps` checks profiles and points per language.
- `lib/compare.ts`, `lib/edit-findings.ts`, `hooks/gate-hook.ts`: limits read from the point table;
  `slow` lines; run times recorded.
- `lib/result-store.ts` or a sibling: the run-time record `doctor` reads.
- `.github/workflows/ci.yml`: the lockfile and test failures fixed, the `langdev` job added; the
  repo secret `SEMGREP_APP_TOKEN` is the owner's to add.
- `README.md`, `USAGE.md`: the points, targets and the `slow` line.

## Critiques

Devil's advocate:

- The 1 s rule for the edit set is not the owner's number; the owner's target is 5 s. Fixed by its
  reason in the spec: the edit set runs at once inside 7.5 s, and a load of 15 made the same run
  about five times slower, so 1 s quiet is 5 s under load. Task 2.1 measures every candidate.
- A language with no checker fast enough for `edit` (dotnet may be one) would fail the registry
  gate. Fixed: task 4.1 stops and asks the owner instead of inventing a checker.
- The `slow:` line at `edit` would land in the model's context, where it is noise. Fixed: at `edit`
  only the project's errors reach the model; every other line goes to the hook's log.
- An edit set picked by speed alone keeps a fast tool that finds nothing new and drops nothing the
  person needs at edit. Fixed: the set is picked by cost and use (design D3), measured in task 2.1.

Future archaeologist:

- Why does `edit` read the `pre-commit` store entries and not its own? Fixed: the spec says why (a
  checker runs the same way at both), so a later split is a decision, not a cleanup.
- Why per worktree timings and not one machine file? Fixed: design D5 says why.

Scope sniper:

- The CI job and the work to make CI green are half of this change. Waived: the owner chose "add the
  langdev CI job now" over writing the target only; making CI green is its precondition, task 5.1.
- The timing file and the doctor median are new code. Waived: the owner chose them ("Hláška +
  doctor") over the slow line alone.
