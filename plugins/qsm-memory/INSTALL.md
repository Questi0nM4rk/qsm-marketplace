# Install

```bash
claude plugin install qsm-memory@qsm-marketplace
bun plugins/qsm-memory/scripts/install.ts
```

Compiles `qsm-memory` into `$QSM_BIN_DIR` (default `~/.local/bin`, must be on `PATH`); the hooks
call it from there. The plugin registers the hooks module and the MCP server. `--dry-run` prints
the plan.

Optional, changes a file you own: `qsm-setup activate qsm-memory -- --memory qsm` sets
`autoMemoryEnabled: false` and `cleanupPeriodDays: 36500` in `~/.claude/settings.json`, so Claude
Code never deletes a transcript (its default deletes after 30 days; a lower value is raised), and
records the choice `qsm` and the day in the archive: `pack` then runs, from 30 days on. `--memory
claude` records the choice `claude` and writes nothing to `settings.json`: Claude Code's own
retention applies and nothing is packed. `pack` needs `tar` and `zstd` on `PATH`.

Without the plugin loaded, register the server by hand:

```json
{ "mcpServers": { "qsm-memory": { "command": "qsm-memory", "args": ["mcp"] } } }
```
