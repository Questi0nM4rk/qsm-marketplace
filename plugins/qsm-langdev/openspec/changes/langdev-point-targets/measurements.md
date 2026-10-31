# qsm-langdev edit-point measurements (task 2.1 of langdev-point-targets)

Question: which checkers of lib/registry.ts join the `edit` point (design D3: cost under 1 s for one
file on a quiet machine, and a finding no faster checker of that file type finds under the project's
rules). Tree: qsm-marketplace worktree lpt-core (registry, fixers); sample files and configs from
the main checkout /home/qs_m4rk/Projects/FullStack.qsm/qsm-marketplace (the only repo with
`.qsm-langdev/gates.json`: languages ts, py, shell, rust; profile strict). Everything below is
MEASURED on 2026-10-31 unless it says otherwise. Nothing in any repository was written.

## How

- Cost: the registry's args (lib/registry.ts) run from the repo root on one file, 3 runs, median
  wall ms (bash EPOCHREALTIME); `--version` once. Load average (1 min, `/proc/loadavg`) was never
  quiet: 3.9 to 7.1 on 12 cores during all runs (something else on the machine kept it at 4-7).
  Every number is therefore an upper bound for a quiet machine, and no checker is near 1 s except
  oxlint (0.46 to 0.61 s across five sets at load 3.9 to 5.1). Scripts: cmds.sh, bench.sh (this
  dir).
- Use, two sample sets:
  - M = the marketplace's own tracked files (8 each of ts, md, py, sh, toml; 6 yaml; 2 rs). They
    pass the pre-commit gate, so they are nearly clean by construction.
  - F = files of sibling repos (ai-guardrails, hook-kit, tagen, feats, shell-ast, cc-review; 16 ts,
    11 md, 4 py, 9 sh, 7 yaml, 5 toml, 3 rs) plus 14 more py from HyDE/babysitter/codeagent, copied
    into a scratch tree beside the marketplace's config files (the project's rules applied to code
    that never met them). zsh: 36 files
    (~/.config/zsh, HyDE, end-4); fish: 53 files (~/.config/fish, HyDE, caelestia, end-4); dotnet: a
    local 310-file .cs repo (JaCoreApp), read only.
  - Fixers (lib/fixers.ts) ran on a copy first (rumdl MD013 reflow, markdownlint --fix, oxlint
    --fix, oxfmt, ruff check --fix, ruff format, shfmt -w, rustfmt, fish_indent -w); "findings"
    below are what is left after them, which is what the model would be told at edit.
  - Raw outputs: raw-pre/ (M), raw-tree/ (F before fixers), raw-tree-fixed/ (F after), raw-py2/,
    raw-zf*/, sum-*.json (parsed file, line, rule).
- Not measured: zsh-lint, zshellcheck, devskim (binaries not on PATH; I did not install them);
  clippy, dotnet, dotnet-vulnerable, dotnet-format (not edit candidates, need a cargo or dotnet
  build that writes target/ or obj/ into the repo); bun-check, knip, depcruise, pyright (push-only).

## docs

| Checker | File type | Median ms (load) | --version ms | Findings, files | Only it found | Edit | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| yamllint | yaml | 111 (5.9); 106 (7.1) | 99-110 | M 0/6; F 10 in 7/7 (document-start x7, comments x3) | all (only yaml checker); also a flow-sequence syntax error (synthetic) | yes | cheap, only yaml tool, findings are the project's style rules |
| markdownlint-cli2 | md | 255 (5.9); 352 on the largest md (7.1) | 208-211 | M 0/8; F 277 in 10/11 before fixers, 21 in 4/11 after (MD040 x14, MD060 x6, MD036 x1) | all (only md tool); the fixers remove 256 of 277 (MD060 180, MD013 72, MD032 9, MD034 1) | yes | what is left (fence language, table style) is the model's to fix |
| taplo | toml | 4 (5.9); 4 (7.1) | 2 | 0 on M 8/8, 0 on F 5/5, 0 on 47 toml files of 8 repos and ~/.config | n/a, finds nothing real; catches `invalid TOML` on a synthetic broken file | no by the rule as written | 4 ms and the only toml tool, but zero findings on any real file; owner's call (cost is nil) |

## ts (oxlint, oxfmt, jscpd, lizard are the edit candidates)

| Checker | File type | Median ms (load) | --version ms | Findings, files | Only it found | Edit | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| oxlint | ts/js | 510 (5.2); 571 on a 46 KB file (4.4); 464-608 repeats (3.9-5.1) | 37-40 | M 0/8; F 1005 in 13/16 before fixers, 998 after; 921 are `no-unsafe-*` from unresolved types in the copy (the qsm-i1u.97 noise), 58 other in 9/16 (strict-boolean-expressions 35, no-redundant-type-constituents 8, require-await 3) | all type/lint findings; also syntax errors | yes | the project's lint rules; slowest edit checker, 0.5 s |
| oxfmt | ts/js/json | 72 (6.2); 61 on a 46 KB file | 46 | M 0/8; F 7 in 7/16 before, 0 after | 0 after the oxfmt fixer; syntax errors are also oxlint's | no | a fixer removes every finding it can report |
| jscpd | ts/js | 44 (6.2); 47 on a 46 KB file | 35-38 | M 0/8; F clones in 4/16 files (2, 19, 1, 3 clones; 3 are test files) | all of them; but with the registry's `given` set at edit it scans the one file, so only clones inside that file | yes, with a caveat | cheap, finds what no other tool does; sees only intra-file clones at edit, cross-file ones stay at commit |
| lizard (also multi) | ts | 94 (6.2); 128 on a 46 KB file | 83-95 | M 0/18 (ts+py+rs), 0 over all tracked ts/py of the marketplace; F 3 in 2/16 (evaluateInternal ccn 60, parseExports 14, main 13) | all (oxlint's complexity rules are off by design, .oxlintrc.json:57-60) | yes | the only cyclomatic-complexity tool |
| semgrep-ts | ts/js | 9303 (5.0), one run | n/a | 0 on the one file | n/a | no | 9.3 s alone (design says 9.0 s); 9x the budget |

## py

| Checker | File type | Median ms (load) | --version ms | Findings, files | Only it found | Edit | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ruff | py | 8 (6.2); 8 (7.1) | 2 | M 0/8; F 32 in 4/4 before fixers, 20 after; 14-file extra set 395 (PLC0415 119, E701 36, PT023 31, ANN001 21, T201 21) | all (select = ALL minus S) | yes | 8 ms, the project's rule set, also catches syntax errors |
| ruff-format | py | 8 | 3 | M 0; F 2 before, 0 after fixer; extra set 7 files differ (fixer removes) | nothing after the fixer | no | `ruff format` fixer removes every finding |
| vulture | py | 61 (6.2); 60 (7.1) | 50-59 | M 0/8; F 6 before fixers, 2 after; extra set 0 of 14 | none: both remaining are `unused variable 'x'` on the same line as ruff's ARG001; the unused imports are ruff F401 (fixer) | no | at min-confidence 80 it reports only imports and variables/args, which ruff F401/F841/ARG001 already report; on one file it cannot see cross-file use |
| bandit | py | 190 (6.2); 200 (7.1) | 159-229 | M 0/8; F 0/4; extra set 246 in 14 files, all B101 (assert) | all of them: ruff ignores `S` (ruff.toml:33), so only bandit reports security rules; but only B101 ever fired | yes | the project's security rule set; cost 0.2 s; real security ids (B6xx etc.) never appeared in 26 files |
| lizard | py | 129 (6.2); 109 (7.1) | 95 | M 0; extra set 7 over-complex functions in 14 files (ccn 37, 15, 15, 13, 13 ...) | all | yes | see ts |
| semgrep-py | py | 21009 and 21285 (4.1), two runs | n/a | 0 on the one file | n/a | no | 21 s alone |

## shell (bash, sh)

| Checker | File type | Median ms (load) | --version ms | Findings, files | Only it found | Edit | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| shellcheck | sh | 50 (6.2); 119 (6.8) | 33-35 | M 1 in 1/8 (SC2292); F 24 in 6/9 (SC2292 12, SC2249 3, SC2154 3, SC2086 2, SC1091 2, SC2034) | all code findings; also every parse error I broke (SC1073/SC1072 as error on 3 broken scripts, synthetic) | yes | the shell rule set and a syntax check in one |
| shellmetrics | sh | 25 (6.2); 32 (6.8) | 3 | 0 on M 8/8 and F 9/9; but over all 41 marketplace .sh, 15 zsh dotfiles and 80 HyDE scripts: 4 functions over ccn 10 in 3 files (global_fn.sh print_log 17, restore_cfg.sh 14 and 33, default.zsh extract 17) | all (no other tool scores shell complexity, lizard has no .sh) | yes | the only shell complexity tool; the total is a bare number, as the registry says |
| bash-syntax | sh | 2 (6.2); 2 (6.8) | 1-2 | 0 on M and F; synthetic: catches all 3 broken scripts | none: shellcheck reports the same 3 as SC10xx errors | no | zero findings, subsumed by shellcheck; 2 ms so harmless if the owner wants it |
| shfmt | sh | 6 (6.2); 3 (6.8) | 4 | M 7 in 7/8 and F 5 in 5/9 before the fixer, 0 after; synthetic parse error: rc 1 | nothing after the fixer; a parse error is also shellcheck's | no | the shfmt -w fixer removes every finding |
| semgrep-bash | sh | not valid: my run used the public `p/bash` name (rc 7, 3.2 s); the registry uses its local `qsm/bash` pack | n/a | n/a | n/a | no | semgrep alone is 3 to 21 s on every language measured |

## zsh (files from ~/.config/zsh, HyDE, end-4; no gates.json for zsh anywhere, tools ran at defaults)

| Checker | File type | Median ms (load) | --version ms | Findings, files | Only it found | Edit | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| zsh-syntax | zsh | 3 (7.1) | 1 | 0 on 36 files; synthetic: catches both broken scripts (rc 1) | the only checker that is zsh itself (shellcheck has no zsh dialect) | yes | 3 ms, ground truth for zsh parse errors |
| shellmetrics-zsh | zsh | 32 (7.1) | 3 | 1 function over ccn 10 in 1/15 dotfiles (extract, 17) | all | yes | only zsh complexity tool |
| shfmt-zsh | zsh | 3 (7.1) | 2 | 28/36 files differ before the fixer, 0 after | nothing after the fixer; its parse-error message is also zsh -n's | no | the `shfmt -ln=zsh -w` fixer removes every finding |
| zsh-lint | zsh | NOT RUN: not installed (`go` is at /usr/bin/go; I did not `go install`) | | | | unknown | needs measuring |
| zshellcheck | zsh | NOT RUN: not installed | | | | unknown | needs measuring |

## fish (53 files from ~/.config/fish, HyDE, caelestia, end-4; fish is configless)

| Checker | File type | Median ms (load) | --version ms | Findings, files | Only it found | Edit | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fish-syntax | fish | 3 (7.1) | 2 | 0 on 53 files; synthetic: catches both broken scripts (exit 127, message names the line) | the parser itself | yes | 3 ms, names the line of a parse error |
| fish-indent | fish | 3 (7.1) | 3 | 33/53 files differ before the fixer, 0 after | nothing after the `fish_indent -w` fixer; on a parse error it exits 1 without a message | no | fixer removes every finding; fish-syntax says more about the only residue |

## multi

| Checker | File type | Median ms (load) | --version ms | Findings, files | Only it found | Edit | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| lizard | ts, py, rs, cs | ts 94-128, py 109-129, rs 105, cs 91 (3.8-7.1) | 83-100 | ts and py above; rs 0 on 5 files; cs 13 over-complex functions in 310 files (lizard over 600 listed, 882 functions) | all (only multi-language complexity tool) | yes | one binary covers the languages with no complexity tool of their own (rust, dotnet) |
| semgrep-dockerfile | Dockerfile | 3781 (7.9), one run | n/a | 0 | n/a | no | 3.8 s |

## rust (5 files: 2 marketplace, 3 ai-guardrails)

| Checker | File type | Median ms (load) | --version ms | Findings, files | Only it found | Edit | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rustfmt | rs | 17 (6.2) | 14 | 0 on 5 files (after its own fixer); synthetic parse error: rc 1 | only residue of the fixer is a parse error | yes, as the only candidate | 17 ms; the sole rust checker under 1 s; its use is parse errors only (clippy needs cargo, push point) |
| semgrep-rust | rs | not run | | | | no | semgrep is 3-21 s elsewhere |

## dotnet

| Checker | File type | Median ms (load) | --version ms | Findings, files | Only it found | Edit | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| devskim | cs | NOT RUN: not installed | | | | unknown | `dotnet tool install -g Microsoft.CST.DevSkim.CLI` would make it measurable |
| dotnet-format | cs | NOT RUN (design D3 and the registry comment cite 24 s per project, not mine) | | | | no | 24 s, an order of magnitude over the budget |
| semgrep-dotnet | cs | not run | | | | no | semgrep is 3-21 s elsewhere |

## Languages left with no edit checker

- dotnet: devskim is the only candidate under 1 s by the design's own account and it is not
  installed here, so its cost and use are unmeasured. Until then `registryGaps` would report
  `dotnet: no checker at edit` if devskim is dropped. lizard (multi) covers .cs at edit but is
  `multi`, not `dotnet`, so it does not satisfy the per-language gate (D6).
- zsh and fish and rust have an edit checker only because of a parse check (zsh-syntax,
  fish-syntax, rustfmt): on 36, 53 and 5 real files they found nothing.

## Contradictions with the D3 draft table

1. py: `vulture` is in the draft's edit set. Measured: no finding that ruff (F401/F841/ARG001) does
   not already give; remove from edit.
2. `ruff-format`, `oxfmt`, `shfmt`, `shfmt-zsh`, `fish-indent` (draft: all at edit): every finding
   they report is one the fixer in lib/fixers.ts removes first (0 after the fixers, measured), and a
   parse error is reported by shellcheck / zsh -n / fish -n / ruff / oxlint. By the design's own
   rule ("a finding a fixer removes is not a finding at edit") they leave the edit set. rustfmt is
   the exception only because rust has no other fast checker.
3. shell: `bash-syntax` is subsumed by shellcheck (SC1xxx on all three broken scripts) and found
   nothing on 17 files; remove, or keep at 2 ms by choice.
4. docs: `taplo` found nothing on any of 47 real toml files; by the rule as written it is out, by
   cost (4 ms) it is free. Owner's call.
5. ts: `jscpd` at edit scans only the edited file (`fileSet: "given"` = the edit's paths), so it
   finds duplicates inside that file only; 4 of 16 foreign files had one. Keep, but it is not the
   cross-file clone check its name suggests.
6. `lizard` is in the draft as `multi`; its cost is 0.09 to 0.13 s on every file type, and it is the
   only complexity tool for ts, py, rs and cs; keep.
7. `bandit` is in the draft and stays: ruff ignores `S`, so no faster tool finds its rules, but
   every finding on 26 py files was B101 (assert).
8. The marketplace's own files give no use evidence (the pre-commit gate keeps them clean: 0
   findings in M for 14 of 16 checkers; the only M findings are 7 shfmt format diffs, which the
   fixer removes, and one shellcheck SC2292 in an eval scaffold). The use column rests on F (foreign
   code).
9. oxlint is the slowest edit checker (0.46 to 0.61 s here); with the 5x slowdown the design
   measured at load 15 it is about 2.5 to 3 s, still inside 7.5 s.
10. In F, 921 of 998 oxlint findings are `no-unsafe-*` because the scratch tree has no
    `.claude/types` and the sibling code has unresolved imports: the qsm-i1u.97 noise the design
    already names.
11. Semgrep, all languages: 3.2 to 21 s for one file (3.8 s dockerfile, 9.3 s ts, 21 s py): none at
    edit.
