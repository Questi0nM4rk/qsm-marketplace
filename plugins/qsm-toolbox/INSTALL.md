# Install

```bash
bun plugins/qsm-toolbox/scripts/install.ts
```

Needs `bun`. The installer compiles `qsm-toolbox` into `QSM_BIN_DIR` (default `~/.local/bin`), then
installs each missing catalog tool through its language package manager (`bun`, `uv`, `pipx`, `go`).
Tools owned by a system package manager or `sudo` are reported with the line to type, never run.
`--dry-run` prints the plan. A link of a tool's name that points outside the Go bin directory is not
replaced unless you pass `--force`.

- `QSM_<TOOL>_SKIP=1` skips one tool (`QSM_AST_GREP_SKIP=1`).
- `error` exits 1, a missing prerequisite exits 4, anything else exits 0.
- Rerunning is safe: each row is decided by a live `command -v`.
