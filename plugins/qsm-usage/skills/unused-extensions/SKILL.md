---
name: unused-extensions
description: "Use when the user wants to know which extensions they never use or what they cost: unused skills, which plugins do I need, do I need all these MCP servers, unused agents, unused commands, what loads every session, context-heavy extensions, remove what I do not use. Lists every MCP server, skill, plugin, agent, and command with its uses and resident cost, and offers the unused ones for removal."
---

# Unused extensions

Unused extensions still load their names and descriptions every session. This skill lists every
installed extension with its uses and resident cost, and offers the unused ones for removal, each
by a switch that one key or one revert undoes. Never a command that deletes configuration or
credentials (no `claude mcp remove`, no plugin uninstall). Two extensions that do one job are
`duplicates`; here each item is judged on its own use. Shared reading and apply rules are in
the `usage` skill.

## Inventory, every item

- Resident cost: `mcp__qsm-usage__breakdown`; repeat its line about what it may miss. A file
  outside the session: `qsm-usage count <file>`.
- Plugins: `jq '.enabledPlugins'` on user, project and local settings.
- MCP servers: `jq '.mcpServers | keys'` on `~/.claude.json` and `.mcp.json`; plugin servers come
  from the breakdown.
- Skills, agents, commands: `~/.claude/` and the project's `.claude/`, and each enabled plugin's.

## Uses

- `mcp__qsm-usage__ledger` has every use of a skill, command, agent and tool by name. A skill the
  person typed as `/plugin:skill` is counted under `commands` by its full name, never under
  `skills`: read both before calling a skill unused. Older sessions: count the same names in the
  transcripts.
- MCP uses are `mcp__<server>__<tool>` calls; characters outside `[a-zA-Z0-9_-]` in the server name
  become `_`, plugin servers are `mcp__plugin_<plugin>_<server>__`. Match that form, switch off by
  the configured name.
- `skillUsage` and `pluginUsage` in `~/.claude.json` are totals since install, never recent use.
  A plugin's `lastUsedAt` is no signal, because install sets it.

## Verdicts

| Item | Verdict |
| --- | --- |
| no use in the window | offered for removal |
| rare use at high cost | take a position with one reason ("2 uses in 50 sessions for 1.1k tokens: remove") |
| no usage signal (theme, output style, monitor) | offered, the person decides |
| built-in or enabled by managed policy | listed, never offered |
| used | keep |

A deferred MCP server costs about 0: offer it with saving 0 and "one less connection to maintain".
A thin window (few sessions, fresh install): withhold every verdict, because absence proves nothing.
The skill listing budget is about 1% of the window; say so when close, because past it routing
gets worse.

## Switches

| Item | Switch | Undo |
| --- | --- | --- |
| skill in the project | `"skillOverrides": {"<name>": "off"}` in `.claude/settings.local.json` | remove the key |
| skill in `~/.claude/skills` or a plugin | same key in `~/.claude/settings.json` | revert |
| plugin, user scope | `"enabledPlugins": {"<name>@<marketplace>": false}` in `~/.claude/settings.json` | revert |
| plugin from checked-in settings | same key in `.claude/settings.local.json` | remove the key |
| agent or command in `~/.claude` | rename `<name>.md` to `<name>.md.off` | rename back |
| MCP server, user or local scope | `/mcp disable <server>`, typed by the user | `/mcp enable <server>` |
| MCP server from `.mcp.json` | name in `"disabledMcpjsonServers"` in `.claude/settings.local.json` | remove the name |

## Findings

One per item, used ones included. Offered: `verdict: "remove"`, `question: "removal"`, the switch
as the change. Kept or never offered: `verdict: "keep"`, `question: "none"`, `change.kind:
"none"`, `savingNote` says why.

## Red flags

- When asked to remove something, give the switch and its undo, not the delete, because the undo
  must be one step.

## Say it in the reply

One table: Item, Type, Scope, Uses in window, Total since install, Resident tokens, Verdict; the
largest costs called out; the picked items with switch and undo; the window it rests on; then the
`usage` skill's removal question.
