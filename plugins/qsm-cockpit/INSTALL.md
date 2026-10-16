# Install

```bash
bun plugins/qsm-cockpit/scripts/install.ts
```

Needs `bun`. The installer compiles `qsm-cockpit` into `QSM_BIN_DIR` (default `~/.local/bin`) and
writes its completion. `--dry-run` prints the plan. The plug-in itself installs with
`claude plugin install qsm-cockpit@qsm-marketplace`, which brings `qsm-tasks` with it.
