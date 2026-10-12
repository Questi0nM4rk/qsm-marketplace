# Install

```bash
claude plugin install qsm-forge@qsm-marketplace
bun plugins/qsm-forge/scripts/install.ts
```

Compiles `qsm-forge` into `$QSM_BIN_DIR` (default `~/.local/bin`). `--dry-run` previews. `gh` and
`glab` are never installed: authenticate them yourself (`gh auth login`, `glab auth login`).
