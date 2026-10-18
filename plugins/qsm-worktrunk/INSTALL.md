# Install

```bash
bun plugins/qsm-worktrunk/scripts/install.ts
```

Needs `bun` and `wt`. The installer compiles `qsm-worktrunk` and the three classic hooks, links the
binary into `QSM_BIN_DIR` (default `~/.local/bin`) and writes its completion. `--dry-run` prints the
plan. The plug-in itself installs with `claude plugin install qsm-worktrunk@qsm-marketplace`.
