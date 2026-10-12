# Install

```bash
claude plugin install qsm-memory@qsm-marketplace
bun plugins/qsm-memory/scripts/install.ts
```

Compiles `qsm-memory` into `$QSM_BIN_DIR` (default `~/.local/bin`, must be on `PATH`); the hooks
call it from there. The plugin registers the hooks module and the MCP server. `--dry-run` prints
the plan.

Optional, changes a file you own: `qsm-setup activate qsm-memory -- --memory qsm` sets
`autoMemoryEnabled: false` and `cleanupPeriodDays: 7` in `~/.claude/settings.json`. `--memory skip`
writes nothing.

Without the plugin loaded, register the server by hand:

```json
{ "mcpServers": { "qsm-memory": { "command": "qsm-memory", "args": ["mcp"] } } }
```
