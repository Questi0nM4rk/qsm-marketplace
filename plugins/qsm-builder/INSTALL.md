# Install

```bash
claude plugin install qsm-builder@qsm-marketplace
bun plugins/qsm-builder/scripts/install.ts
qsm-builder doctor
```

The installer compiles `qsm-builder` into `QSM_BIN_DIR` (default `~/.local/bin`, must be on
`PATH`). It is idempotent; `--dry-run` prints the plan.

The task tool on `PATH` comes from `qsm-tasks`, a dependency: the lens reads open tasks through
it and saves an edit as one. `qsm-builder doctor` exits 4 (`missing`) and names `qsm-tasks` without
it.
