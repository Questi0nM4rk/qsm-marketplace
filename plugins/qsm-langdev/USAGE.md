# Usage

```bash
qsm-langdev check --against main --at pre-push
qsm-langdev list --json | jq -r '.data[] | [.language, .name, .measures.counts] | @tsv'
```

Verbs: `check`, `list`, `doctor`, `languages`, `init`, `structure`, `install`, `uninstall`,
`edited`, `hook`. `qsm-langdev --help` lists flags. Every verb takes `--json` (one envelope on
stdout).

Exit codes: 0 ok, 1 hook gate blocked, 2 bad call, 3 tree got worse, 4 not a git repository (or no
`init`), 5 a checker was not measured (retry).

Semgrep rule timeouts and fatal scan errors are not measured, even with partial findings. No
score is stored for that scan. Semgrep's per-rule timeout is off inside the checker deadline,
which is five minutes for `check`, the limit for any process the gate starts, and 420 seconds
for semgrep at pre-push. On timeout, the runner stops
the checker's process group, including its engine children.

`QSM_LANGDEV_GATE_BUDGET_MS` sets the per-checker limit of the stop gate (default 55000).
