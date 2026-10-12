# Install

```bash
claude plugin install qsm-langdev@qsm-marketplace
bun plugins/qsm-langdev/scripts/install.ts
```

Compiles `qsm-langdev` into `$QSM_BIN_DIR` (default `~/.local/bin`) and the stop gate hook into
`dist/`. Installs `rumdl` with `uv tool install` when it is absent. Builds `sentrux` (needs `cargo`;
without it install reports `missing-prereq`). `--dry-run` shows the plan. Other checker binaries are
never installed: `qsm-langdev doctor` names them.
