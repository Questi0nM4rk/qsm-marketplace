## Context

qsm-langdev is one plugin with one bin. Every language is a rules set inside it: its checkers in
`lib/registry.ts` (each with a `language` and a `runsAt` of `pre-commit` or `pre-push`) and its two
profiles under `profiles/<general|strict>/<language>/`. The language plugins (`qsm-langdev-ts` and
the rest) hold skills only and stay so. The owner decided on 2026-10-31 that this change improves
the main CLI's interface and moves nothing out of it (epic `qsm-rbkv` holds every decision quoted).

Limits today, read from the code on 2026-10-31:

| Where | Limit |
| --- | --- |
| any process a gate starts (`STUCK_MS`, `lib/compare.ts:99`) | 5 min |
| the edit hook's checkers (`DEADLINE_MS`, `lib/edit-findings.ts:14`) | what is left of 7.5 s |
| the stop gate per checker (`DEFAULT_CHECK_BUDGET_MS`, `hooks/gate-hook.ts:41`) | 55 s |
| `dotnet-format` (`registry.ts:976`) | 5 min |
| a function hook, set by the engine (`HookBudget.ms`, `claude-code.d.ts:5277`) | 10 s, fixed |

Measured on 2026-10-30 and 31, cold store:

| Point | Time | Load (12 cores) |
| --- | --- | --- |
| edit `.ts` | 16.0, 17.1, 18.2 s | 13 to 18 |
| edit `.ts` | 8.4, 12.0 s | 2.4 |
| edit `.md` | 4.6, 5.3, 6.0 s | 15 to 18 |
| stop (`check`) | 9.4 s | 7 |
| commit hook | 5.2, 9.3 s | 6 to 7 |
| push, langdev part | 12.8 s | 5 |
| CI, last green runs (2026-10-21) | 244 to 371 s | runner |

One `.ts` edit, step by step at load 2.4: `semgrep scan` of the one file 9.0 s, `semgrep --version`
1.3 to 1.9 s, oxlint 0.6 s, oxfmt, lizard, jscpd and markdownlint 0.1 to 0.3 s each.

## Goals / Non-Goals

**Goals:**

- One table in the main CLI says, per point, the target a checker is meant to finish under and the
  timeout that only catches a stuck run.
- Every checker says at which of four points it runs; the edit hook gets its own fast set.
- A slow run is visible and never fails; a checker slow every time is named by `doctor`.
- The Pro semgrep run over the whole tree runs in CI.

**Non-Goals:**

- Moving any language's rules into its language plugin.
- Deciding rust, docs and multi (owner: "ted to nech, projdeme to vice"); they get the same points
  and nothing else changes for them.
- Making any checker faster. A checker over its target is a finding for a later task, never a reason
  to drop it from a point it belongs to.
- A target per language or per checker: the target belongs to the point.
- Sentrux layers, where a project says from where it may import (`qsm-i1u.43`): the next change
  (owner: "potom musime jeste upravit ten sentrux").

## Decisions

### D1. A checker lists its points; nothing inherits a point

`runsAt` becomes `points`, a required list out of `edit`, `pre-commit`, `pre-push`, `ci`. How a
checker runs at a point where that differs (a file set, an engine) stays declared per point, as
`prePush` does today, and `ci` gets the same form. A list beats "a point and everything after it"
because the sets do not nest: semgrep runs at commit and push but not at edit, and only at `ci` with
the Pro engine. Required, like `fileSet`, so no checker inherits a set nobody chose for it.

### D2. One point table owns targets and timeouts

```ts
export const POINTS = {
  edit: { targetMs: 5_000 },                 // timeout: the engine's 10 s, see D3
  "pre-commit": { targetMs: 30_000, timeoutMs: 300_000 },
  "pre-push": { targetMs: 60_000, timeoutMs: 300_000 },
  ci: { targetMs: 600_000, timeoutMs: 1_200_000 },
} as const;
```

`STUCK_MS`, `DEFAULT_CHECK_BUDGET_MS` and the `dotnet-format` `timeoutMs` go away; each run reads
its point's row. The stop gate runs at `pre-commit`, so it gets 30 s and 5 min.
`QSM_LANGDEV_GATE_BUDGET_MS` stays as the stop gate's test seam. Alternative rejected: a target per
checker, because the owner set one per point ("per ONE checker").

### D3. The edit point stays a function hook and checks in place

The edit hook compares nothing against HEAD (owner: "edit maji byt in place checks against the
rules, not against head"). Its checkers run on the written file in the live checkout, with the
project's configuration, and report every error in it; no scratch tree, no reference side, no
store. That drops the two tree checkouts and the second scoring from every edit, and checks a new
file git does not track, which the HEAD comparison never saw because it scores tracked files only.
The ratchet stays where a reference exists: commit, push and CI. Alternative rejected: keep the
HEAD comparison and add untracked files to the scratch tree, which keeps the cost and answers a
question (is it worse than HEAD) the commit asks again anyway.

The edit hook stays in `hooks/register.tsx`, where the engine gives every hook 10 s that no plugin
can raise (owner: "edit by mel byt tady v tomto hook module"). The checkers keep sharing what is
left of 7.5 s from the binary's start, so the hook answers inside the engine's 10 s. The edit set is
chosen per language and file type by two measurements, never by speed alone (owner: "zmer vsechny ty
tools, a porovnej to s tim co se ti realne per lang / file type, bude nejvice hodit per edit"):

1. cost: one run on one file measures under 1 s on a quiet machine, because the set runs in
   parallel and a load of 15 made the same run about five times slower;
2. use: on a sample of real files of that type in this repository, it finds something the project's
   rules flag that no faster edit checker already finds. A tool that finds nothing the others miss
   stays at commit.

The edit hook fixes first, with the project's own config and only for the project's selected
languages (`lib/fixers.ts` does both today), then tells the model only the errors the project's
rules raise in that file. Every other line it prints today (`not run`, `not measured`, totals,
`slow`) goes to the hook's log: the model cannot act on it, and the commit scores the file again.

The checkers score a copy of the tree, where `.claude/types` (gitignored, made by
`bun run plugin-types`) is missing, so every hooks module scores dozens of `no-unsafe-*` findings
the checkout does not have (feedback `qsm-i1u.97`). The copy gets what the checkout's type
resolution reads, so the project's rules are judged, not a missing file.

Draft, to be measured in task 2.1:

| Language | At edit | Not at edit |
| --- | --- | --- |
| docs | yamllint, taplo, markdownlint-cli2 | |
| ts | oxlint, oxfmt, jscpd | semgrep-ts |
| py | ruff, ruff-format, vulture, bandit | semgrep-py |
| shell | shellcheck, shellmetrics, bash-syntax, shfmt | semgrep-bash |
| zsh | zsh-syntax, zsh-lint, zshellcheck, shellmetrics-zsh, shfmt-zsh | |
| fish | fish-syntax, fish-indent | |
| multi | lizard | semgrep-dockerfile |
| rust | rustfmt | semgrep-rust |
| dotnet | devskim | dotnet-format (24 s), semgrep-dotnet |

### D4. Slow is a line in the report, never a verdict

A checker that scored a side records the wall time of its run at the point. Over the target, the
report adds `slow: <checker> <seconds> s at <point>, target <seconds> s`, and the verdict does not
change. At `edit` the line goes to the hook's log and never to the model (D3). A store hit costs
nothing and records nothing. A run cut at its timeout records the timeout, so a stuck checker
counts as slow too.

### D5. Run times live beside the result store

Each recorded time is appended to `.qsm-langdev/timings/<point>.jsonl` in the worktree, one line
`{"checker","ms","at"}`, a directory that keeps itself out of git as the store does (`cacheDir`). A
write keeps the last 10 lines per checker, so the file stays bounded. `doctor` reads them and names
each checker whose median of its last 10 runs is above its point's target, with the median and the
target. Alternative rejected: a machine-wide file, because every worktree would mix its numbers, and
`doctor` runs in a repository.

### D6. The registry gate checks profiles and points per language

`registryGaps` fails when a language that reads configuration (all but `fish`) lacks
`profiles/general/<language>/` or `profiles/strict/<language>/`, and when a language has no checker
at one of the four points. The gate already runs in `bun test`, so a new language without both
profiles and every point cannot land.

### D7. CI runs the `ci` point as its own job

A `langdev` job in `.github/workflows/ci.yml`, next to the existing one, on a push to `main`:

1. installs the checkers `qsm-langdev doctor` names and builds the bin;
2. runs `qsm-langdev check --at ci --against ${{ github.event.before }}`; an all-zero or unknown
   `before` is skipped with its reason, as the push gate skips a first push;
3. has `timeout-minutes: 30`.

At `ci`, semgrep runs `semgrep scan --pro` over the whole tree with `SEMGREP_APP_TOKEN` from a repo
secret, and never `semgrep ci`, which uploads. A missing token fails the job naming the secret: one
path, no community fallback. That `scan --pro` with only the token neither uploads nor needs
`semgrep login` is unverified; task 5 checks it first.

## Risks / Trade-offs

- [The edit set misses what only semgrep finds] → semgrep still runs at every commit, push and CI,
  so a finding reaches the person at the commit, at most one step later.
- [CI is red since 2026-10-21] → task 4 makes it green first; the new job would otherwise land on a
  pipeline nobody reads.
- [The token in CI is the owner's to add] → the job fails naming the secret until it exists.
- [A timing file per worktree loses the history of a deleted worktree] → accepted: a checker slow
  everywhere is slow in the main checkout too.
- [Five minutes of a stuck stop gate holds an agent] → owner's rule: "kdyz se to upe posere"; the
  target makes a slow run visible long before.

## Migration Plan

The registry entries are rewritten once from `runsAt`/`prePush` to `points`; no stored result
changes key, because the store's directories are per point already and the edit point stores
nothing. Nothing reads an old shape after the change.

## Open Questions

None. Rust, docs and multi are outside this change by the owner's word.
