# Install

```bash
claude plugin install qsm-openspec@qsm-marketplace
bun plugins/qsm-openspec/scripts/install.ts
openspec init --tools none   # once per project
```

Compiles `qsm-openspec` into `QSM_BIN_DIR` (default `~/.local/bin`, must be on `PATH`) and
runs `bun add -g @fission-ai/openspec` unless `openspec` is already there. `--dry-run` prints
the plan. Check with `qsm-openspec doctor`.
