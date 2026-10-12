# Install

```bash
claude plugin install qsm-index@qsm-marketplace
bun plugins/qsm-index/scripts/install.ts
```

Compiles `qsm-index` into `$QSM_BIN_DIR` (default `~/.local/bin`, must be on `PATH`). `--dry-run`
prints the plan. The plugin's `.mcp.json` registers the stdio server `qsm-index mcp serve`.

The installer upgrades `graphify` to 0.8.34 or newer with `uv tool install -U graphifyy` (needs
`uv`) and never fetches `semble`, which is optional:

```bash
uv tool install semble
```

Check: `qsm-index doctor`.
