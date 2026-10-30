# Usage

`qsm-ccr <verb> [args]`; `--help` lists options. Verbs: `lead`, `sync`, `doctor`.

```bash
qsm-ccr lead                    # the catalog's default model
qsm-ccr lead gpt-6.1 -- --resume   # a slug from the allowlist; arguments after -- go to claude
qsm-ccr sync --if-stale --detach
qsm-ccr doctor
```

- `lead [slug] [-- claude args]` ensures the router, then runs an interactive Claude Code on the
  slug with `CLAUDE_CODE_TEAMMATE_COMMAND` naming this binary, so its teammates route by name. A
  Claude model is refused. It never writes user settings; a `model` change it finds after the exit
  is `failed`, named, never undone.
- `sync [--if-stale] [--detach]` refreshes codex's catalog, copies codex's tokens into CCR, sets the
  allowlist to every listed slug, and reloads the daemon only when a field changed. `--if-stale`
  does nothing when the last good sync is under 24 hours old; `--detach` starts the sync in a
  detached process and returns at once.
- `doctor` reports every seam and starts nothing.
- Teammate mode: `qsm-ccr --agent-id <id> --agent-name <name> [claude arguments...]`. Claude Code
  runs it when `CLAUDE_CODE_TEAMMATE_COMMAND` names the binary. A name with a registered prefix
  (`gpt-`) runs on its provider, any other name runs plain `claude`; a `--model` argument is dropped
  for a routed teammate and kept for any other.
- `--json` on a verb prints one envelope: `{ code, exit, reason, message, warnings, data }`.
- Exit codes: `ok` 0, `failed` 1, `usage` 2, `worse` 3 (a token expires within 24 hours), `missing`
  4, `blocked` 5.
- State is `$XDG_STATE_HOME/qsm-ccr` (default `~/.local/state/qsm-ccr`): `launch.log` (one line per
  launch), `sync.log`, `sync.out`, `ccr.out`, `bootstrap.out`, `router.lock`, `custom-router.js`.
- The session-start hook (function hook in `hooks/register.tsx`) calls
  `$.ccr.sync({ ifStale: true, detach: true })`. A failure is a log line and a toast that reads
  `qsm-ccr ERROR: session.start: <reason>`; the session goes on.
- Environment read: `PATH`, `HOME`, `XDG_STATE_HOME`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`,
  `CCR_INTERNAL_HOME_DIR`.
