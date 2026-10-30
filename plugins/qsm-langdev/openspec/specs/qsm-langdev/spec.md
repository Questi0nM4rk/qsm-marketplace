# qsm-langdev Specification

## Purpose

Per-language quality checks and structural architecture checks over one declarative registry and one
structural checker, behind a single CLI.

## Requirements

### Requirement: A check compares a reference tree against the shipped tree

`check` SHALL score every selected checker against two sides: the reference,
which is the last commit (`HEAD`), and the shipped side, which is every tracked
file as the working tree holds it (a staged change, an unstaged change, and a
file added to the index). An untracked file is not measured: a file git does
not track is not on its way into a commit, so a finding in it decides nothing
about the commit under the gate. Each side SHALL be scored in a scratch tree that holds
the inputs the repository's own commands read, so a checker measures there
what it measures in the live checkout: every dependency directory the live
checkout installed (`node_modules`, `.venv`) at any depth, and every ignored
path a tsconfig's `include` or `files` names, linked in from the live
checkout. A generated file stays on disk for the code that imports it; the
file sets leave it unscored. A checker SHALL pass only when the shipped side's total
is no higher than the reference side's; where the checker names files, no file
SHALL carry more findings than before, a moved file compared under its old
name; and where the checker reports individual findings, no finding SHALL
occur more often than before. A finding is identified by its rule and message,
never by its line, so code moving above it does not make it new. The run SHALL
stop at the first checker that fails and name it with both totals and the
newly-occurring lines. A checker that is not measured (it ran past its time
limit, or its output could not be read) does not stop the run: it decides
nothing, so the checkers after it still run and the report is whole. A
checker is selected only when its file set holds a file of a type it covers.
Each side is scored at most once per content: the
reference side comes from the result store whenever it holds that content, so
a run scores only what the store does not know (see "A checker runs once per
content, against a stored result").

#### Scenario: A new finding blocks

- **WHEN** the shipped tree carries one more finding for a checker than the
  reference tree
- **THEN** `check` SHALL fail, name the checker, both totals, and the new
  finding's location

#### Scenario: An untracked file is not measured

- **WHEN** the working tree holds a file git does not track, with a finding the
  reference tree does not have
- **THEN** `check` SHALL pass, hand the file to no checker, and list it in no
  file set; once the file is added to the index it is measured like any change

#### Scenario: A side reads the same inputs as the live checkout

- **WHEN** a package imports a dependency installed only in its own
  `node_modules`, or a generated declaration file its tsconfig names and git
  ignores, or a generated file marked `export-ignore`
- **THEN** a type-aware checker SHALL resolve it on either side and report
  what it reports when run directly in the live checkout

#### Scenario: A fix does not offset a new finding elsewhere

- **WHEN** a change removes findings from one file and adds one to another,
  lowering the overall total
- **THEN** `check` SHALL fail on the file that grew

#### Scenario: Moved code is not a new finding

- **WHEN** lines are inserted above an unchanged finding, or a file carrying
  findings is renamed with nothing else changed
- **THEN** `check` SHALL pass

#### Scenario: Nothing the change touches is covered

- **WHEN** a change touches only files no selected checker covers
- **THEN** `check` SHALL pass, reporting that no checker ran, not that every
  checker passed

### Requirement: Duplication is scored at every commit, not first at the push

jscpd SHALL run at pre-commit as well as at pre-push, because a commit that passes its own gates and
adds clones is found only when main is pushed, after several such commits were merged, far from the
commit that added them. A whole-tree jscpd run takes well under a second on this repository
(measured 136 ms on 514 files), so the commit gate carries no real cost.

#### Scenario: A commit adds a duplicated block

- **WHEN** a commit adds a block that repeats one already in the tree, and nothing else
- **THEN** its pre-commit gate SHALL report jscpd worse and block the commit

### Requirement: Every run computes its file sets once

Before any checker runs, the run SHALL compute three file sets and hand each
checker the one it declares. They are computed once per run, never per
checker, and the run reports each set's size.

#### Scenario: A commit that touches two files

- **WHEN** the working tree differs from `HEAD` in `a.ts` and `b.ts` and a
  per-file checker covers TypeScript
- **THEN** that checker SHALL be handed exactly `a.ts` and `b.ts`, and the
  report SHALL say `changed: 2 files`

#### Scenario: A file that another file imports

- **WHEN** `a.ts` changed, `b.ts` imports `a.ts`, `c.ts` imports `b.ts`, and a
  checker declares `changed+N` with N = 1
- **THEN** that checker SHALL be handed `a.ts` and `b.ts`, not `c.ts`

#### Scenario: The whole project on request

- **WHEN** the caller names no files and a checker declares `given`
- **THEN** that checker SHALL be handed every file under the repository root
  that git does not ignore

### Requirement: The import graph is one module every language feeds

qsm-langdev SHALL own one import graph, independent of the structural checker
(sentrux) and of any other tool, that any checker, verb or plugin of the
langdev family can query. Each language contributes one extractor that reads a
file's own import statements and resolves them to files in the repository:
TypeScript and JavaScript (`import`, `export ... from`, `require`, dynamic
`import()`), Python (`import`, `from ... import`), and shell (`source`, `.`).
An import that resolves to nothing in the repository (a package, a builtin) is
not an edge. The graph SHALL be cached per file content, so a run re-reads
only files whose content changed since the last run. The query SHALL answer
the files within N edges of a given set, in both directions. A language with
no extractor contributes no edges and is named in the report, never silently
treated as having no imports.

#### Scenario: A relative import

- **WHEN** `b.ts` holds `import { x } from "./a"` and `a.ts` exists
- **THEN** the graph SHALL hold the edge `b.ts -> a.ts`

#### Scenario: A package import

- **WHEN** `b.ts` holds `import { z } from "zod"`
- **THEN** the graph SHALL hold no edge for it

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
another set and engine at a push than at a commit; the edit hook and the stop gate run at the
pre-commit point and share its entries. After a run the store SHALL keep, for every checker the run
used and at the run's point only, the entries the reference and shipped sides of that run used, so
it never grows without bound and a commit never evicts what a push stored, nor a push what a commit
stored. An entry outside a point's directory is a miss and is removed by the next run of its
checker. Nothing SHALL run a checker twice over the same content, the two sides of one run included.
The report SHALL say, per checker, whether each side was a hit or scored, and the run's total.

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
with the community engine at every point, pre-commit (the commit hook, the edit hook, the stop gate,
and `check`, whose default is pre-commit) and pre-push (the push hook and `check --at pre-push`)
alike, whatever the login, and SHALL NOT ask for the login. The Pro engine's cross-file run over the
whole tree is not a gate on a person's machine: measured on this repository, both sides at once took
128 s quiet, 373 s with every core busy, and past 600 s at a load of 15, and a run cut short blocks
a push for nothing it proved. That run belongs to a CI job, which does not exist yet; until it does,
no checker declares a Pro form and nothing runs `semgrep --pro` or `semgrep ci` (which uploads).
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
`--version` presence probe does not answer in time (five minutes, the limit for any process the gate
starts) is not missing: `check` SHALL report that checker as not measured, naming the probe and its
limit and asking for a retry, and SHALL NOT tell the person to install it.

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

### Requirement: A repository that never ran init is left alone

A repository is this tool's to judge only once its own `.qsm-langdev/gates.json`
is on disk — `init` writes it, and nothing else does. Every entry point a
harness or git can reach without the caller naming a verb — the edit
hook (`tool.call`), the SubagentStop gate, and `hook pre-commit`/`hook pre-push` as the
installed git hooks call them — SHALL do nothing at all in a repository
without gates.json: no stdout, no block, no warning, exit successfully. Only
the verb a person types explicitly, `check`, SHALL say so: one line naming
the repository and `init`, through the outcome table's `missing` code, never
`worse`. Once gates.json exists, this tool judges the repository exactly as
it did before this requirement: a selected language with no scaffolded
config still fails loud, the same as the requirement above.

#### Scenario: The edit hook in an un-init'd repository

- **WHEN** a file is written in a repository with no `.qsm-langdev/gates.json`
- **THEN** the edit hook SHALL print nothing and exit successfully, whatever
  the file's language or its findings

#### Scenario: The stop gate in an un-init'd repository

- **WHEN** an agent's session stops and a tree it edited has no
  `.qsm-langdev/gates.json`
- **THEN** the stop gate SHALL neither judge nor block on that tree

#### Scenario: The installed git hook in an un-init'd repository

- **WHEN** `hook pre-commit` or `hook pre-push` runs in a repository with no
  `.qsm-langdev/gates.json`
- **THEN** it SHALL exit successfully with nothing on stdout or stderr

#### Scenario: `check` in an un-init'd repository

- **WHEN** a person runs `check` directly in a repository with no
  `.qsm-langdev/gates.json`
- **THEN** it SHALL report the `missing` outcome, naming the repository and
  `qsm-langdev init` as the remedy, and SHALL NOT run any checker

### Requirement: A person can let a measured regression pass once

The installed git hooks SHALL read `QSM_LANGDEV_ALLOW`, a reason, for the one
command it is set on. The `langdev` and `structure` gates SHALL still run in
full and write their results, so the next run compares against them; a
measured regression SHALL then pass, its lines kept and the reason named. A
check that could not run, and the leak gates, SHALL be unaffected. The variable
is read per run and never stored.

#### Scenario: A regression the author allows once

- **WHEN** a hook runs with `QSM_LANGDEV_ALLOW` set and a checker is worse
- **THEN** the gate SHALL pass, listing the worse checker and the reason

#### Scenario: A check that could not run is not allowed

- **WHEN** `QSM_LANGDEV_ALLOW` is set and a checker's binary is missing, or a
  checker was not measured
- **THEN** the gate SHALL still block

### Requirement: The guard keeps the git hooks in the loop

A function hook on the Bash tool SHALL deny, at `tool.call`, a line where `git`
runs `commit` with `--no-verify` or `-n`, or `push` with `--no-verify`, and a
line that sets `QSM_LANGDEV_ALLOW`, and SHALL tell the agent to send the person
the command to run as `! QSM_LANGDEV_ALLOW="<why>" <command>`. A `!` command in
the prompt runs past every tool hook and only the person can type it, so the
allow never depends on a permission prompt, an auto mode, or the order of other
plugins' hooks. It is a guardrail: a command written to evade it evades it. It
SHALL fail closed: a guard that breaks denies.

#### Scenario: A commit or a push that skips the hooks is denied

- **WHEN** an agent runs `git commit -n` or `git push --no-verify`
- **THEN** the guard SHALL deny the call, naming the `!` form with `QSM_LANGDEV_ALLOW`

#### Scenario: Allowing a regression is the person's command

- **WHEN** an agent runs a command that sets `QSM_LANGDEV_ALLOW`
- **THEN** the guard SHALL deny the call and name the `!` form the person runs

#### Scenario: An ordinary commit passes the guard untouched

- **WHEN** an agent runs `git commit -m <message>` or a plain `git push`
- **THEN** the guard SHALL leave the call as it is

### Requirement: Every verb reports through the shared outcome table

The binary SHALL take its verbs, their arguments, their help, and its `--json`
envelope from `qsm.json` through the shared CLI base, and every verb SHALL end
in one code of the marketplace outcome table:

#### Scenario: A comparison blocks

- **WHEN** `check` or `structure` finds the shipped tree worse
- **THEN** the binary SHALL exit 3, and under `--json` the envelope SHALL
  carry `"code": "worse"` with the verdicts as data

#### Scenario: A gate blocks the hook

- **WHEN** `hook pre-commit` runs a gate that fails
- **THEN** the binary SHALL exit 1, naming the gate

#### Scenario: A checker is not measured

- **WHEN** `check` or `hook pre-commit` runs a checker past its time limit, or
  one whose output cannot be read, and no checker is worse
- **THEN** the binary SHALL exit 5 with `"code": "blocked"`, the report SHALL
  name `<checker>: not measured: timed out after <N>s; retry` or
  `<checker>: not measured: <cause>; retry`, and every checker after it SHALL
  still report

### Requirement: Install builds the structural checker when it is missing

Install SHALL compile this plugin's binary and its classic hook through
the shared install base, and SHALL handle the structural checker as one extra
step: `already` when the checker on PATH reports a qsm-patched version;
otherwise it SHALL run this plugin's build script and report `installed` on
success, `error` with the build command on failure, and `missing-prereq`
naming `cargo` when `cargo` is not on PATH. A dry run SHALL name the build
command and run nothing.

#### Scenario: No compatible checker present

- **WHEN** install runs, `cargo` is on PATH, and no checker reporting a
  qsm-patched version is on PATH
- **THEN** install SHALL run the build script and report `installed`

#### Scenario: The build fails

- **WHEN** the build script exits non-zero
- **THEN** install SHALL report `error` carrying the command to run by hand

#### Scenario: No cargo

- **WHEN** no compatible checker and no `cargo` is on PATH
- **THEN** install SHALL report `missing-prereq` naming `cargo` and build
  nothing

#### Scenario: A compatible checker is already present

- **WHEN** the checker on PATH reports a qsm-patched version
- **THEN** install SHALL report `already` and build nothing

### Requirement: Doctor reports each checker's binary as present or missing

`doctor` SHALL report, for every checker in the languages currently selected
(or, with no selection, every language the tree's files touch), whether its
binary resolves and, when it does not, the command to install it. `doctor`
SHALL also report whether the structural checker on the machine reports a
qsm-patched version, distinguishing that from an unpatched upstream checker
and from none present at all. A binary that does not answer `--version` within the probe limit is
not missing: `doctor` SHALL report it as not measured, as `check` does. `doctor` SHALL install
nothing.

#### Scenario: A backing linter is missing

- **WHEN** a selected checker's binary does not resolve
- **THEN** `doctor` SHALL list it as missing together with its install
  command, and run no install itself

#### Scenario: Doctor meets a checker whose presence probe times out

- **WHEN** a selected checker's binary does not answer `--version` within the probe limit
- **THEN** `doctor` SHALL list it as not measured and ask for a retry, SHALL NOT list it as
  missing or give its install command, and SHALL end `blocked` rather than `missing` when no
  binary is truly absent

#### Scenario: An unpatched structural checker is present

- **WHEN** the structural checker on PATH reports a plain upstream version
- **THEN** `doctor` SHALL report it as not ready, distinguishing this from no
  structural checker being present at all

### Requirement: List reports the registry as data

`list` SHALL report every checker with its language, its enforcement point,
and its thresholds, read live from the one registry every other verb reads.
`list --json` SHALL emit the same as data.

#### Scenario: A registry entry appears identically everywhere

- **WHEN** a checker is added to the registry
- **THEN** `list`, `doctor`, and `check` SHALL all reflect it without further
  configuration

#### Scenario: A quantity gated twice is a query, not a reading of 39 manuals

- **WHEN** `list --json` runs
- **THEN** every row carries `measures.counts`, and the rows whose `measures.overlaps`
  name each other are exactly the pairs counting one quantity over shared files

### Requirement: Generated files are outside the quality gates, never the safety gates

A path the repository's `.gitattributes` marks `linguist-generated` or `export-ignore` is owned by a
generator. Every quality checker (duplication, dead code, complexity, lint, types, and `structure`)
SHALL leave it out of what it scores, on either side. The marker is the one definition of
"generated"; this plugin keeps no list of its own. The jscpd checker is handed the scored files, not
the root. A checker whose registry row declares `guardsSafety` (semgrep, bandit, devskim,
dotnet-vulnerable) SHALL keep the unnarrowed set, and the `secrets`, `entropy` and content-denylist
gates read the staged files, so none of these ever skip a generated file. Whole-project tools (knip,
depcruise, bun check) read the tree through their own configuration and are not narrowed.

#### Scenario: A generated file changes

- **WHEN** a staged change touches a file marked `linguist-generated` and one unmarked file
- **THEN** a quality checker SHALL score only the unmarked file, and the `given` set it scores SHALL
  omit the generated one

#### Scenario: A security scanner meets a generated file

- **WHEN** a staged change touches only a file marked `linguist-generated`
- **THEN** a checker declaring `guardsSafety` SHALL still score it

#### Scenario: A generated file carries a secret

- **WHEN** a staged file marked `linguist-generated` holds a secret-shaped string
- **THEN** the `secrets` and `entropy` gates SHALL still block the commit

#### Scenario: Structure and a generated file

- **WHEN** the shipped tree differs from the reference tree only in a file marked
  `linguist-generated`
- **THEN** `structure` SHALL report that no product file changed and not score it

### Requirement: Structure scores the architectural comparison the same way

`structure` SHALL apply the reference-versus-shipped rule to architectural
quality rather than to a checker's findings: it SHALL score the reference
tree and the tree given by `--against`, or, given `--session` and `--agent`
and no path, every tree that agent edited this session against the commit it
started from there. A failing verdict SHALL name every cross-module
dependency edge the shipped tree has that the reference tree does not. A tree
missing its architectural rules file SHALL be reported as not scored, never
as failed.

#### Scenario: A change that touches only tests

- **WHEN** the shipped tree differs from the reference tree only in test
  files or test fixtures
- **THEN** `structure` SHALL pass, reporting that no product file changed
  and that the tree was not scored

#### Scenario: New tests beside a product change

- **WHEN** a change adds tests that import a shared test helper and also
  changes a product file
- **THEN** `structure` SHALL score the product change alone, list no edge
  from a test file, and say how many test files it left out

#### Scenario: A worse structural score

- **WHEN** the shipped tree's architectural quality scores lower than the
  reference tree's by more than the stated tolerance
- **THEN** `structure` SHALL fail, report the quality before and after, and
  list every newly added cross-module edge

#### Scenario: A structure agent with no recorded edit

- **WHEN** `--session` and `--agent` name an agent that edited nothing this
  session
- **THEN** `structure` SHALL pass, saying the agent edited no tree

#### Scenario: The architecture backing tool cannot be reached

- **WHEN** the structural scoring tool is missing or answers with no
  machine-readable output
- **THEN** `structure` SHALL fail and name its install command

### Requirement: Languages selection decides which checkers a repository runs

`languages add <name>` and `languages remove <name>` SHALL change the
repository's own selection of languages to gate on. The selection SHALL be
opt-in: an empty or absent selection SHALL mean no ordinary language's
checkers run, never "whatever this tree contains." An always-on language
(`docs`, `multi`) SHALL run regardless of the selection — nobody picks a
language in order to stop linting their YAML. The selection SHALL be per
repository, never machine-global.

#### Scenario: Adding a language to the selection

- **WHEN** `languages add` names a known language
- **THEN** later runs of `check` and `doctor` in that repository SHALL include
  that language's checkers

#### Scenario: An unknown language name

- **WHEN** `languages add` or `languages remove` names an unrecognized
  language
- **THEN** the command SHALL fail and list the known languages

#### Scenario: An empty selection gates nothing ordinary

- **WHEN** `.qsm-langdev/gates.json` names no languages, or omits the field
- **THEN** `check`, the edit hook, and the stop gate SHALL run no ordinary
  language's checkers, and SHALL still run the always-on languages'

#### Scenario: `init` records what it scaffolded

- **WHEN** `init` runs in a repository
- **THEN** it SHALL write the detected non-always-on languages into
  `.qsm-langdev/gates.json`'s selection, never an empty one, so the languages
  it just scaffolded configs for are the ones that gate

### Requirement: The secrets gate also runs the machine-local content denylist

When the file at `contentDenylistPath` in root `lib/paths.ts` exists, the secrets gate SHALL run
gitleaks a second time on the staged changes with it, redacted, and SHALL block naming the rule id,
file and line of each hit, never a pattern. When the file is absent, the gate SHALL pass and print
one line that the content denylist is not set up, naming the `content-denylist` skill.

#### Scenario: A staged file matches a denylist rule

- **WHEN** a staged file matches a rule in the denylist
- **THEN** the commit is blocked and the output names the rule id and location

#### Scenario: No denylist on this machine

- **WHEN** the file does not exist
- **THEN** the gate passes with one line naming the skill that sets it up

### Requirement: A push is compared against what the pushed remote holds

At pre-push the `langdev` and `structure` gates SHALL compare a ref the remote has against the
remote's commit, and a new branch against the merge base with the default branch of the remote being
pushed to (its `HEAD`, else `main`, else `master`, as this clone last saw it). When this clone holds
no such branch of that remote, as on the first push to an empty remote or to a path, there is
nothing to be worse than and the ref SHALL be skipped, never scored as a tree of added files. When
every pushed ref is skipped the gate SHALL report itself skipped, naming each ref and why, never a
bare pass. A
default branch another remote holds, or a local branch, SHALL NOT serve as the reference. A pre-push
call that carries no remote name SHALL fail these gates as it fails `secrets`.

#### Scenario: The first push to an empty remote

- **WHEN** a clone pushes a branch to a remote it holds no branch of
- **THEN** the gates SHALL NOT score the whole tree as changed, and SHALL NOT block the push

#### Scenario: Every pushed ref is skipped

- **WHEN** a push to a path or an empty remote skips every ref
- **THEN** the `langdev` and `structure` gates SHALL print `skipped` with each ref and its reason,
  and SHALL NOT block the push

#### Scenario: A new branch on a remote the clone knows

- **WHEN** a new branch is pushed to `origin` and `origin/main` is known
- **THEN** the gates SHALL compare it against the merge base with `origin/main`

### Requirement: The secrets gate at a push scans the pushed commits

At pre-push the `secrets` gate SHALL run gitleaks with the repository's `.gitleaks.toml`, redacted,
over the commits each pushed ref adds, never over the staged changes. For a ref that exists on the
remote the range is the remote commit up to the local one; for a new branch it is the local commits
not reachable from a remote-tracking ref of the remote being pushed to, whose name git hands the
hook as its first argument, so a commit only another remote holds is still scanned; a deletion adds
no commit and is skipped. A pre-push call that carries no remote name SHALL block the push, naming
the hook as out of date and telling the person to run `qsm-langdev install` again. A finding SHALL
block the push naming the rule id, file and line of each hit, never the matched value. A gitleaks
run that fails without a report SHALL block the push as one that could not run, a missing
`.gitleaks.toml` SHALL block it as a fail naming that file, and a missing gitleaks binary SHALL
block it as a fail naming the binary. Before scanning a ref the remote has, the gate SHALL check
that the remote commit exists in this clone, and SHALL block the push naming the ref and telling
the person to fetch when it does not, because gitleaks exits 0 over a range it cannot resolve. A
range git cannot list SHALL block the push as one that could not run; a range that lists no commit
adds nothing and is skipped. The machine-local content denylist is a commit-time check and SHALL
NOT run at a push.

#### Scenario: A pushed commit holds a secret

- **WHEN** a push adds a commit whose file holds a secret-shaped string, to an existing branch or a
  new one
- **THEN** the push is blocked and the output names the rule id, file and line, and not the string

#### Scenario: A commit only another remote holds

- **WHEN** a new branch is pushed to one remote and a commit it adds, holding a secret-shaped
  string, is reachable only from the remote-tracking refs of a different remote
- **THEN** the push is blocked

#### Scenario: A hook installed before the remote name was passed

- **WHEN** an installed pre-push hook calls the gate without the remote name
- **THEN** the push is blocked, the output says the hook is out of date and to run
  `qsm-langdev install` again, and nothing is scanned or skipped

#### Scenario: A clean push

- **WHEN** every commit a push adds is free of secret-shaped strings
- **THEN** the secrets gate SHALL pass

#### Scenario: A force push over a remote tip this clone never fetched

- **WHEN** a push replaces a remote ref whose commit is not in this clone, with commits that hold a
  secret-shaped string
- **THEN** the push is blocked, the output names the ref and says to fetch first, and the remote ref
  does not move

### Requirement: Nothing this tool touches has a warning level

This holds everywhere, not only in the configs: every rule in a config this
tool ships, every checker the registry invokes, and every verdict the tool
itself reports. A finding SHALL be at the severity that fails, or the rule
SHALL be off with the reason written beside it. Nothing SHALL sit at a
middle severity that neither blocks nor goes away.

#### Scenario: A rule the repository accepts

- **WHEN** a rule's findings are not worth failing on
- **THEN** the config SHALL turn that rule off and carry the reason, and
  SHALL NOT lower it to a warning

#### Scenario: A rule the repository does not accept

- **WHEN** a rule's findings are worth acting on
- **THEN** the config SHALL set it to the severity that fails the check

#### Scenario: A count that never reaches zero

- **WHEN** a checker's floor on a healthy tree is above zero, as jscpd's is
- **THEN** the floor SHALL be written down with the measurement that
  establishes it, and the ratchet SHALL fail the moment it grows

### Requirement: A config names the rules it wants, and every one of them fails

A config this tool ships SHALL enable rules by naming them, not by setting a
whole group or category to a severity. Every rule it names SHALL fail the
check. A rule the repository will not act on SHALL be absent, with the
reason written where it would otherwise appear.

#### Scenario: A rule that fires where it should not

- **WHEN** a rule's findings are noise in this codebase, as oxlint's
  import/no-nodejs-modules is in a CLI
- **THEN** the config SHALL leave that rule out with the reason, and SHALL
  NOT enable it and suppress it at the call sites

#### Scenario: A whole group would be convenient

- **WHEN** a group setting would enable many rules at once
- **THEN** the config SHALL name the rules it wants from that group instead,
  so every enabled rule is one somebody chose

### Requirement: Init writes each profile's config files the repository lacks

`init --profile <name>` SHALL write, for every language the repository's
files indicate, the profile's config file wherever the repository does not
already have a file of that name, and SHALL record the chosen profile.
`init` SHALL NOT overwrite a config file the repository already has.

#### Scenario: A fresh repository

- **WHEN** `init` runs in a repository with no config files of its own
- **THEN** every detected language's profile config SHALL be written

#### Scenario: A repository with its own config

- **WHEN** the repository already has a config file a profile would write
- **THEN** `init` SHALL leave that file untouched and report it as already
  present

### Requirement: The edit hook reports a file's own regression and never blocks

After a file is written, the hook, through its door `qsm-langdev edited <file>`, SHALL run the same
comparison as `check` scoped to that one file against its version at the reference commit, and SHALL
surface the verdict, current findings marked whether newly occurring. The hook SHALL exit
successfully regardless of the verdict; it is advisory only. The checkers SHALL run under what is
left of 7.5 seconds from the start of the binary, at least 1 second, because the engine gives the
noun call 10 seconds and the fixers and the start take their share first; a checker past its budget
SHALL be reported as not measured, never as a failed hook, so several edits made at once still each
get the checkers that finished.

Before the comparison the hook, and the pre-commit gate over staged files with no unstaged changes,
SHALL run each static fixer that covers the file and re-stage what the gate fixed. The fixers are
the safe fix modes of the checkers langdev runs (`rumdl` and `markdownlint-cli2 --fix`,
`oxlint --fix` and `oxfmt`, `ruff check --fix` and `ruff format`, `shfmt -w`, `fish_indent -w`,
`rustfmt`), never an unsafe or code-deleting fix; a fixer whose binary is missing is skipped.
`dotnet format` is no fixer: it loads a project and its analyzers on every run, 24 s measured, which
no edit can carry, so `dotnet-format` only reports, once per owning project (`groupBy`), scoped to
the changed files and with `--no-restore`, and the person runs the fix. When the pre-commit gate
blocks, it names each staged file it skipped for unstaged changes.

#### Scenario: A written file gained a finding

- **WHEN** the edited file now carries one more finding than its reference
  version
- **THEN** the hook SHALL report the new finding to the editor and SHALL NOT
  block the edit

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
that comparison rather than a block.

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

### Requirement: Architecture data is queryable during a session

The plugin SHALL expose the structural checker's architecture queries over
MCP so an agent or user can ask about the current codebase's structure
without leaving the session or invoking the gate.

#### Scenario: Module installed in a session

- **WHEN** a session starts with the module installed
- **THEN** the architecture query tools SHALL be available over the MCP
  connection without a separate manual start step

### Requirement: Installing and removing the git hooks is reversible

`install` SHALL wire the reference-versus-shipped comparison into the repository's commit and push
points, appending to an existing hook script rather than replacing it, each calling
`qsm-langdev hook <pre-commit|pre-push>`, and marking exactly what it added. The pre-push call
carries the remote name git hands the hook as its first argument. `install` SHALL bring a hook or
block it wrote earlier up to the current call, so a repository is never left on a stale one, by
replacing only its earlier call line: whatever the person added to a hook `install` wrote whole
stays as it was. A hook `install` wrote whole that holds neither the current nor the earlier call
line SHALL be left untouched and named with the line to add by hand. `uninstall` SHALL remove
exactly what `install` added and nothing the repository already had.

#### Scenario: Installing beside an existing hook

- **WHEN** the repository already has its own pre-commit hook
- **THEN** `install` SHALL append its own marked block rather than replacing
  the file

#### Scenario: Uninstall restores the prior hook

- **WHEN** `uninstall` runs after `install` appended to an existing hook
- **THEN** the repository's original hook content SHALL remain and the
  appended block SHALL be gone

#### Scenario: Reinstalling over a hook written before the remote name was passed

- **WHEN** `install` runs and the pre-push hook or block it wrote earlier lacks the remote name
- **THEN** that hook or block SHALL be rewritten to the current call, and a second `install` SHALL
  change nothing

#### Scenario: Reinstalling over a hook the person extended

- **WHEN** `install` runs and the pre-push hook it wrote whole has the earlier call line followed by
  lines the person added
- **THEN** only the call line SHALL change, and every added line SHALL stay

### Requirement: The checker deadline terminates its owned process group

The existing checker runner SHALL start each checker in its own process group and terminate
that group when the outer deadline expires, including engine children started by a launcher.
It SHALL retain the existing deadline values and not-measured outcome. It SHALL NOT identify
processes for termination by executable name or terminate unrelated user processes.

#### Scenario: A timed-out launcher has a running engine child

- **WHEN** a checker launcher starts an engine child and the checker exceeds its outer deadline
- **THEN** the runner SHALL terminate the owned launcher and engine group, report not measured,
  and leave no running engine from that invocation after cleanup

### Requirement: Semgrep rule timeouts and fatal errors invalidate measurements

The Semgrep output reader SHALL reject a native rule `Timeout`, including one reported at warning
level with nonempty results, as an incomplete measurement. Fatal scan errors SHALL also reject
nonempty partial output. Counting and failure reporting SHALL use the same classification and
retain the native cause. Other warning kinds SHALL retain their existing treatment.

Incomplete scans SHALL produce no tally and SHALL NOT enter the result store. The existing gate
outcome rules SHALL apply: absent another worse checker, an unmeasured scan is blocked, never
passed or labelled as a new regression. Complete output at a findings exit code SHALL remain a
measured result.

#### Scenario: A timeout is labelled as a warning

- **WHEN** Semgrep returns findings and an error with type `Timeout` and level `warn`
- **THEN** the scan SHALL be not measured, the cause SHALL name the timeout, and no partial
  result SHALL be cached or compared as a valid count

#### Scenario: A fatal error accompanies findings

- **WHEN** Semgrep returns a fatal scan error alongside otherwise readable findings
- **THEN** the scan SHALL be not measured regardless of the result count

#### Scenario: Findings come from a completed scan

- **WHEN** Semgrep completes and returns findings at exit code 1 without a scan failure
- **THEN** those findings SHALL remain measured and subject to the existing comparison rule

### Requirement: Semgrep rule execution stays inside the checker deadline

The common Semgrep argument builder SHALL explicitly use `--timeout 0` to avoid a separate native
per-rule cutoff within the already bounded checker execution. The existing outer deadlines, 600
seconds at a commit and a push alike, SHALL remain unchanged and enforced. Reaching that deadline
SHALL report not measured and SHALL NOT store a score. The changed argv SHALL participate in the
existing store key so entries collected under the native default are not reused in this mode. No
rule, quality threshold, reference commit or engine-selection policy SHALL change.

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
