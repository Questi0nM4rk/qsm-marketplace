## ADDED Requirements

### Requirement: Every point has a target per checker and a timeout

qsm-langdev SHALL hold one table of four points, each with the time one checker is meant to finish
under (its target) and the time after which a run is taken for stuck (its timeout):

| Point | Who runs it | Target per checker | Timeout |
| --- | --- | --- | --- |
| `edit` | the edit hook | 5 s | what is left of 7.5 s, inside the engine's 10 s per hook |
| `pre-commit` | the commit hook, the stop gate, `check` | 30 s | 5 min |
| `pre-push` | the push hook, `check --at pre-push` | 1 min | 5 min |
| `ci` | the `langdev` CI job, `check --at ci` | 10 min | 20 min |

Every checker SHALL declare, as a required list, the points it runs at; no checker SHALL inherit a
point it did not declare. Every limit a run applies SHALL be read from this table; no checker and
no hook SHALL carry a limit of its own. A target is never a limit: a run over its target goes on.

#### Scenario: A checker runs only where it is declared

- **WHEN** `semgrep-ts` declares `pre-commit`, `pre-push` and `ci`
- **THEN** the edit hook SHALL NOT run it, and `check`, the push hook and
  `check --at ci` SHALL

#### Scenario: A stuck process at a push

- **WHEN** a checker's process at a push gives no answer for 5 minutes
- **THEN** the run SHALL stop its process group and report it
  `not measured: timed out after 300.0s; retry`

### Requirement: A run over its target is reported slow and never fails

A checker that scored a side SHALL record the wall time of its run at the point. When that time is
above the point's target, the report SHALL carry the line
`slow: <checker> <seconds> s at <point>, target <seconds> s`, and the verdict SHALL NOT change for
it. At the edit point the line SHALL go to the hook's log, never to the model. A store hit SHALL
record nothing. A run stopped at its timeout SHALL record the timeout.

#### Scenario: A slow commit checker

- **WHEN** oxlint takes 42.0 seconds in a commit hook and finds nothing new
- **THEN** the report SHALL carry `slow: oxlint 42.0 s at pre-commit, target 30.0 s`
  and the commit SHALL pass

#### Scenario: A store hit

- **WHEN** both sides of a checker are store hits
- **THEN** no time SHALL be recorded for it and no slow line SHALL be printed

### Requirement: Doctor names a checker that is slow at a point

Each recorded time SHALL be appended to `.qsm-langdev/timings/<point>.jsonl` in the worktree, a
directory that holds its own `.gitignore` of `*` as the store does, one JSON line with the checker,
the milliseconds and the time of the run, and a write SHALL keep only the last 10 lines per checker.
`doctor` SHALL name every checker whose median over its recorded runs at a point is above that
point's target, with the median, the target and the number of runs, as a warning that does not
change its exit code.

#### Scenario: A checker slow every time

- **WHEN** the last 10 recorded runs of `semgrep-ts` at `pre-commit` have a
  median of 41 seconds
- **THEN** `doctor` SHALL warn
  `semgrep-ts is slow at pre-commit: median 41.0 s over 10 runs, target 30.0 s`

#### Scenario: One slow run

- **WHEN** one of a checker's 10 recorded runs took 90 seconds and its median
  is 4 seconds
- **THEN** `doctor` SHALL NOT name it

### Requirement: Every language has both profiles and a checker at every point

The registry gate SHALL fail, naming the language and what it lacks, when a language that reads
configuration (every language but `fish`) has no `profiles/general/<language>/` or no
`profiles/strict/<language>/`, and when any language has no checker declaring one of the four
points. The gate runs in `bun test`, so a language rules set without them cannot land.

#### Scenario: A language without an edit checker

- **WHEN** every `dotnet` checker leaves out the `edit` point
- **THEN** the registry gate SHALL fail with `dotnet: no checker at edit`

#### Scenario: A language without its strict profile

- **WHEN** `profiles/strict/rust/` does not exist
- **THEN** the registry gate SHALL fail with `rust: no strict profile`

### Requirement: CI runs the ci point on every push to main

`.github/workflows/ci.yml` SHALL hold a `langdev` job that, on a push to `main`, installs the
checkers `qsm-langdev doctor` names, builds the bin, and runs
`qsm-langdev check --at ci --against <the commit the push replaced>`, with `timeout-minutes: 30`.
When the replaced commit is all zeros or not in the clone's history, the job SHALL report the run
skipped with that reason and pass, as the push gate does on a first push. `SEMGREP_APP_TOKEN` SHALL
come from the repository's secrets.

#### Scenario: A push to main

- **WHEN** a push moves `main` from `A` to `B`
- **THEN** the `langdev` job SHALL compare `B` against `A` at the `ci` point
  and fail when a checker is worse

#### Scenario: The first push

- **WHEN** the replaced commit is all zeros
- **THEN** the job SHALL print `skipped` with the reason and pass

## RENAMED Requirements

- FROM: `### Requirement: The edit hook reports a file's own regression and never blocks`
- TO:
  `### Requirement: The edit hook checks the written file against the project's rules and never blocks`

## MODIFIED Requirements

### Requirement: A checker runs once per content, against a stored result

Every checker result SHALL be stored in the worktree's own result store, `.qsm-langdev/results/`,
which git ignores: the directory holds its own `.gitignore` of `*`, written when the store creates
it, so a repository that never ran `init` sees nothing untracked and its own `.gitignore` is never
edited; the import graph's cache does the same. A stored result is keyed by the checker, the
checker's tool version (what `<binary> --version` prints), a hash of the configuration it read (its
arguments without the scored files, and the config files it declares in the registry, and, for a
checker that resolves imports (`tsc`, `depcruise`, `knip`), the names of the packages installed in
the tree's `node_modules` directories and the content of the lockfile beside the root and every
`package.json` (`bun.lock`, `package-lock.json`, `yarn.lock`), so a result scored before
`bun install` or before a version bump is not served after it), and the hash of the content it
scored, paths included: each file on its own for a per-file checker, the whole set for every other
checker. A run SHALL look both sides up in the store and score only what is missing. So the first
run in a worktree scores both sides once, and every later run scores the shipped side only, because
the reference is the content of the last commit, which the store already holds from when it was the
shipped side. A change of tool version or configuration misses the store and scores both sides
again, once, and so does a qsm-langdev that scores a side with other inputs: an entry an older one
stored is not read. Switching branches, pulling or rebasing needs nothing special: content the store
does not know is scored once. A rule pack a checker would pull over the network (semgrep's
`p/<pack>`, or a single rule, `r/<id>`) SHALL be fetched once per run into a local file the checker
reads, and that file's content SHALL be part of the configuration hash, so a changed pack misses the
store; our own rules (`qsm/<language>`) are written from the binary the same way and hashed the same
way. A finding from a local rules file SHALL be known by the rule's own id, never by the scratch
directory the file sat in, so a stored side and a fresh one name it alike. A checker whose version
cannot be read, one of whose packs cannot be fetched (it then pulls the pack itself, as it would
with no store), or whose answer depends on something no key holds (dotnet's advisories come over the
network), SHALL never be stored and SHALL be scored every run, and the report SHALL name it and why.
A failed run is never stored, and an entry the store cannot read is a miss. The store SHALL keep
each enforcement point's entries apart, `results/<checker>/<point>/`, because one checker runs
another set and engine at a push than at a commit; the stop gate runs at the pre-commit point, and
the `ci` point keeps its own entries. The edit point keeps none: it checks the live file in place.
After a run the store SHALL keep, for every checker the run used and at the run's point only, the
entries the reference and shipped sides of that run used, so it never grows without bound and a
commit never evicts what a push stored, nor a push what a commit stored. An entry outside a point's
directory is a miss and is removed by the next run of its checker. Nothing SHALL run a checker twice
over the same content, the two sides of one run included. The report SHALL say, per checker, whether
each side was a hit or scored, and the run's total.

#### Scenario: The first run in a fresh worktree

- **WHEN** the store is empty and `a.ts` changed
- **THEN** the checker SHALL score the `HEAD` version and the working-tree
  version of `a.ts` once each and store both

#### Scenario: The next commit

- **WHEN** the previous commit's gate stored `a.ts` and now only `b.ts` changed
- **THEN** the checker SHALL score only the working-tree `b.ts`; the `HEAD`
  side of `b.ts` scores once if the store lacks it, and `a.ts` is not scored

#### Scenario: A new ruleset

- **WHEN** the checker's configuration hash differs from every stored entry
- **THEN** the run SHALL score both sides once and replace the stored entries

#### Scenario: A commit between two pushes

- **WHEN** a push stored both sides, a commit ran the same checker, and the
  same content is pushed again
- **THEN** the second push SHALL be a store hit on both sides

### Requirement: Semgrep scans the changes at a commit and at a push, and asks for a login

Semgrep's community engine analyses each file on its own: a flow from one file into another is not
found even when both files are scanned together. Every semgrep checker SHALL scan the `changed` set
with the community engine at the pre-commit point (the commit hook, the stop gate, and `check`,
whose default is pre-commit) and the pre-push point (the push hook and `check --at pre-push`) alike,
whatever the login, and SHALL NOT ask for the login. No semgrep checker SHALL run at the edit point:
one file alone took 9.0 s, most of the 10 s the engine gives the edit hook. The Pro engine's
cross-file run over the whole tree is not a gate on a person's machine: measured on this repository,
both sides at once took 128 s quiet, 373 s with every core busy, and past 600 s at a load of 15, and
a run cut short blocks a push for nothing it proved. That run SHALL be every semgrep checker's form
at the `ci` point: `semgrep scan --pro` over the whole tree, logged in by `SEMGREP_APP_TOKEN` in the
environment; at `ci` a missing `SEMGREP_APP_TOKEN` SHALL fail the checker, naming the variable, and
never fall back to the community engine. Nothing SHALL run `semgrep ci`, which uploads.
`doctor` and `install` SHALL report, as a warning and never a failure, when the semgrep CLI is not
logged in: `semgrep is not logged in: run semgrep login to use qsm-langdev at its fullest`, asking
the CLI, never reading its token file: `semgrep show identity` exiting 0, or a `SEMGREP_APP_TOKEN`
in the environment, is logged in; exiting 2 is logged out; any other answer SHALL be warned as
unknown, never taken for logged out. An absent semgrep is its missing binary, never a login warning.
A free login adds the Pro engine (cross-file analysis for TypeScript, JavaScript, Python and C#),
the Pro rules, and supply-chain scanning. A checker that runs past its time limit SHALL be reported
as not measured, naming the limit and the retry, and SHALL NOT be reported as worse. So SHALL a
checker whose run ended with output its parser cannot read, a tool error rather than findings:
`<checker>: not measured: <cause>; retry`, the cause the tool's own words (semgrep's JSON `errors`,
else the first line of stderr that says something, or the last when a Python traceback opens it,
else the exit code), and it SHALL NOT be stored. Output the parser reads is measured whatever the
exit code: semgrep exiting 1 with results is findings. A run with a checker not measured and none
worse answers `blocked`, never `ok`: nothing proved the tree no worse. A worse checker in the same
run answers `worse`. The stop gate logs a checker not measured as a warning and does not hold the
agent.

#### Scenario: A bash script piping a download into bash

- **WHEN** a changed `.sh` file runs `curl -fsSL https://x | bash`
- **THEN** `semgrep-bash` SHALL report
  `bash.curl.security.curl-pipe-bash.curl-pipe-bash` on that line

#### Scenario: A Dockerfile with a suffix

- **WHEN** a commit changes `deploy/Dockerfile.prod`
- **THEN** `semgrep-dockerfile` SHALL scan it, and no other semgrep checker
  SHALL

#### Scenario: A commit

- **WHEN** a commit changes 3 of 376 TypeScript files, whether semgrep is
  logged in or not
- **THEN** semgrep SHALL scan those 3 files only, with the community engine

#### Scenario: A push

- **WHEN** a push runs, whether semgrep is logged in or not
- **THEN** every semgrep checker SHALL scan the changed files with the
  community engine, as a commit does

#### Scenario: An edit

- **WHEN** the edit hook checks a written `.ts` file
- **THEN** no semgrep checker SHALL run, and `semgrep-ts` SHALL scan the file
  at the next commit

#### Scenario: A CI run

- **WHEN** `qsm-langdev check --at ci` runs with `SEMGREP_APP_TOKEN` set
- **THEN** every selected semgrep checker SHALL run `semgrep scan --pro` over
  the whole tree, and nothing SHALL run `semgrep ci`

#### Scenario: A CI run without the token

- **WHEN** `qsm-langdev check --at ci` runs with no `SEMGREP_APP_TOKEN`
- **THEN** every selected semgrep checker SHALL fail naming
  `SEMGREP_APP_TOKEN`, and SHALL NOT scan with the community engine

#### Scenario: Not logged in

- **WHEN** semgrep is on PATH and `semgrep show identity` exits 2
- **THEN** `doctor` and `install` SHALL warn `semgrep is not logged in: run
  semgrep login to use qsm-langdev at its fullest` and their exit codes
  SHALL NOT change

#### Scenario: A timeout

- **WHEN** semgrep does not finish within its limit
- **THEN** the report SHALL say `semgrep-ts: not measured: timed out after 60s;
  retry` and the verdict SHALL NOT call it worse

#### Scenario: A real finding at a non-zero exit

- **WHEN** semgrep exits 1 with a result in its JSON on a changed file
- **THEN** that result SHALL count as a finding, and the verdict SHALL be
  worse when the reference side does not hold it

### Requirement: A missing binary or a missing config fails, never a skip

`check` SHALL fail, naming the checker and its install command, when a selected checker's binary is
not resolvable. `check` SHALL also fail, naming the missing file and that it must be created or the
checker removed from selection, when a selected language has no scaffolded config in the repository,
since scoring both sides at a tool's defaults would let nothing ever regress. A binary whose
`--version` presence probe does not answer in time (its point's timeout) is not missing: `check`
SHALL report that checker as not measured, naming the probe and its limit and asking for a retry,
and SHALL NOT tell the person to install it.

#### Scenario: A checker's binary is absent

- **WHEN** a selected checker's binary cannot be found
- **THEN** `check` SHALL fail and print that checker's install command

#### Scenario: A checker's presence probe times out

- **WHEN** a selected checker's binary does not answer `--version` within the
  probe limit
- **THEN** `check` SHALL report the checker as not measured with the limit
  named, and SHALL NOT say it is not installed

#### Scenario: A selected language has no config in the repository

- **WHEN** a language is selected and none of its config files exist in the
  repository
- **THEN** `check` SHALL fail, naming the missing file and `init` as the
  remedy

### Requirement: List reports the registry as data

`list` SHALL report every checker with its language, the points it runs at,
and its thresholds, read live from the one registry every other verb reads.
`list --json` SHALL emit the same as data, each row's `points` a list out of
`edit`, `pre-commit`, `pre-push` and `ci`.

#### Scenario: A registry entry appears identically everywhere

- **WHEN** a checker is added to the registry
- **THEN** `list`, `doctor`, and `check` SHALL all reflect it without further
  configuration

#### Scenario: A quantity gated twice is a query, not a reading of 39 manuals

- **WHEN** `list --json` runs
- **THEN** every row carries `measures.counts`, and the rows whose `measures.overlaps`
  name each other are exactly the pairs counting one quantity over shared files

### Requirement: The edit hook checks the written file against the project's rules and never blocks

After a file is written, the hook, through its door `qsm-langdev edited <file>`, SHALL run the
checkers that declare the `edit` point, never the whole pre-commit set, on that one file in place,
in the live checkout with the project's own configuration, and compare it against nothing: no
reference commit, no scratch tree, no stored result. A file git does not track yet is checked the
same way. The hook SHALL exit successfully whatever it finds; it is advisory only. The ratchet
against a reference belongs to the commit, the push and CI, which score the file again. The hook
stays a function hook, where the engine gives every hook 10 seconds that no plugin can raise, so the
edit point has no five-minute timeout: the checkers SHALL run under what is left of 7.5 seconds from
the start of the binary, at least 1 second, because the fixers and the start take their share first;
a checker past its budget SHALL be reported as not measured, never as a failed hook, so several
edits made at once still each get the checkers that finished. A checker SHALL declare the `edit`
point only when it scores one file, one run measures under 1 second on a quiet machine, because the
edit set runs at once and a load of 15 made the same run about five times slower, and it finds in
that file type something the project's rules flag that no faster edit checker already finds.

What the hook gives the model SHALL be the errors the project's own rules raise in the edited file
and nothing else: each finding with its rule and line. A file
with no finding SHALL give the model nothing. A checker that did not run, was not measured, or was
slow SHALL NOT be told to the model; it SHALL go to the hook's log, because the commit gate scores
the file again and the model cannot act on it.

Before its checkers the hook, and the pre-commit gate over staged files with no unstaged changes,
SHALL run each static fixer that covers the file and re-stage what the gate fixed. The fixers are
the safe fix modes of the checkers langdev runs (`rumdl` and `markdownlint-cli2 --fix`,
`oxlint --fix` and `oxfmt`, `ruff check --fix` and `ruff format`, `shfmt -w`, `fish_indent -w`,
`rustfmt`), never an unsafe or code-deleting fix; a fixer whose binary is missing is skipped.
`dotnet format` is no fixer: it loads a project and its analyzers on every run, 24 s measured, which
no edit can carry, so `dotnet-format` only reports, once per owning project (`groupBy`), scoped to
the changed files and with `--no-restore`, and the person runs the fix. When the pre-commit gate
blocks, it names each staged file it skipped for unstaged changes.

#### Scenario: A written file breaks a rule

- **WHEN** the edited file carries a finding under the project's rules, whether
  or not its version at HEAD carried it
- **THEN** the hook SHALL report the finding to the editor and SHALL NOT block
  the edit

#### Scenario: A new file git does not track

- **WHEN** the model writes a new `.ts` file that is not staged
- **THEN** the hook SHALL check it like any other file and report its findings

#### Scenario: A TypeScript edit under load

- **WHEN** a `.ts` file is written at a load of 15 on 12 cores
- **THEN** the hook SHALL answer inside the engine's 10 seconds with the
  findings of the TypeScript edit set, and no semgrep checker SHALL run

#### Scenario: A clean edit says nothing

- **WHEN** a written file has no finding under the project's rules
- **THEN** the hook SHALL add nothing to the model's context

#### Scenario: A checker covers no file of the edit

- **WHEN** a `.md` file is written and the TypeScript checkers cover none of it
- **THEN** the model SHALL NOT see a line such as
  `oxlint: its changed set holds no file it covers — not run`

#### Scenario: A hooks module checked in place

- **WHEN** a `hooks/register.tsx` that oxlint passes in the checkout is written
- **THEN** the hook SHALL report no `no-unsafe-*` finding the checkout does
  not have

### Requirement: The session-stop gate blocks a worsened tree, capped

At an agent's session stop, one gate SHALL compare every tree that agent
edited against the commit that was current there when the agent first edited
it, keyed to that agent's own edit record rather than to the directory the
gate runs in. One agent edits one tree: the gate attributes a tree's
regression to the agent that edited there and does not split a tree between
agents. The gate SHALL score both the per-language finding comparison,
through the same rule as `check`, and the architectural quality comparison,
through the same rule as `structure`, in one run. A regression in either
comparison SHALL block the stop, reporting the changed files and, for the
comparison that regressed, the totals or the quality before and after. The
gate SHALL allow the stop when both comparisons held or improved. When a tree
has no ruleset to score one comparison under, or the checker that comparison
needs is unavailable, the gate SHALL allow the stop and report a warning for
that comparison rather than a block. The gate SHALL run at the pre-commit
point, with that point's target and timeout for every checker.

#### Scenario: A checker slower than the commit target at a stop

- **WHEN** a checker takes 45 seconds in the stop gate
- **THEN** the gate SHALL score it, report it slow against the 30-second
  target, and SHALL NOT report it not measured

#### Scenario: A worktree agent is judged on its own tree

- **WHEN** an agent edited only its own worktree while another agent edited
  the main checkout, and the gate runs with the main checkout as its
  directory
- **THEN** the gate SHALL judge the first agent only on its worktree against
  its own start commit there

#### Scenario: An agent with no recorded edit

- **WHEN** the stopping agent has no recorded edit anywhere
- **THEN** the gate SHALL pass, saying the agent edited no tree

#### Scenario: Either comparison regressed

- **WHEN** an agent's edited tree carries a new finding, scores lower
  architectural quality, or both, relative to the commit it started from
- **THEN** the gate SHALL block the stop once and report every comparison
  that regressed

#### Scenario: The block cap is reached

- **WHEN** the same standing regression has already blocked the same agent's
  stop a bounded number of times
- **THEN** the gate SHALL allow the stop, record the regression instead of
  blocking again, and SHALL NOT block that agent for the same regression
  again in the session

### Requirement: Semgrep rule execution stays inside the checker deadline

The common Semgrep argument builder SHALL explicitly use `--timeout 0` to avoid a separate native
per-rule cutoff within the already bounded checker execution. The outer deadline is the point's
timeout, five minutes at a commit and a push alike and twenty at `ci`, and SHALL be enforced.
Reaching that deadline SHALL report not measured and SHALL NOT store a score. The changed argv SHALL
participate in the existing store key so entries collected under the native default are not reused
in this mode. No rule, quality threshold, reference commit or engine-selection policy SHALL change.

#### Scenario: The rule needs more than the native default allows

- **WHEN** a rule exceeds the native default per-file budget but finishes within the outer deadline
- **THEN** Semgrep SHALL be allowed to finish rather than omit the rule's finding

#### Scenario: The whole checker exceeds its existing deadline

- **WHEN** the checker does not finish within its existing outer deadline
- **THEN** the existing timeout path SHALL stop the bounded run, report not measured and retain
  no score for it

#### Scenario: A partial result exists from the native default mode

- **WHEN** the result store holds a score collected without the explicit timeout argument
- **THEN** that entry SHALL NOT answer a scan using the new argv, without changing the baseline
  commit or manually deleting cache files
