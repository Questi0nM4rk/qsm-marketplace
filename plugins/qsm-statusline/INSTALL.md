# Install

```bash
bun plugins/qsm-statusline/scripts/install.ts
```

Compiles `qsm-statusline` into `QSM_BIN_DIR` (default `~/.local/bin`, must be on `PATH`);
needs `bun`. `--dry-run` prints the plan. Your settings file is never edited: add
`{ "statusLine": { "type": "command", "command": "qsm-statusline render", "padding": 1 } }`
yourself, check with `qsm-statusline doctor`, then restart Claude Code. Rerun to update.
