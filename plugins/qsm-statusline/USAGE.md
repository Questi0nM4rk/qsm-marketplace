# Usage

`qsm-statusline <verb> [options]`. All verbs exit 0 (`usage` 2 for a bad verb or flag).
`--json` prints one envelope `{ code, exit, reason, message, warnings, data }`.

```bash
qsm-statusline render [--cwd <dir>] [--no-color]   # the harness runs this; payload on stdin
qsm-statusline refresh [--cwd <dir>]               # warm the git cache for a directory
qsm-statusline doctor [--settings <file>]          # report the wiring, never gates
```

Try a payload by hand: `echo '{}' | qsm-statusline render --no-color`.

Git segment: `git <branch>: +2 ~1 ?3 !1` counts staged, modified, untracked, unmerged, or
`clean`. It comes from a cache; one older than two seconds triggers a background `refresh`.
Delete the cache directory to force a reread.

| Variable | Effect |
| --- | --- |
| `QSM_STATUSLINE_CACHE_DIR` | where the git cache lives |
| `CLAUDE_CONFIG_DIR` | Claude Code's home; `doctor` reads the `settings.json` in it, else `~/.claude` |
