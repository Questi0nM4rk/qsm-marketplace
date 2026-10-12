# Install

```bash
claude plugin install qsm-knowledge@qsm-marketplace
bun plugins/qsm-knowledge/scripts/install.ts
```

Compiles `qsm-knowledge` into `$QSM_BIN_DIR` (default `~/.local/bin`, must be on `PATH`). If `nlm`
is missing it runs `go install github.com/tmc/nlm/cmd/nlm@latest` (needs Go; keep the `cmd/`) and
symlinks it from the Go bin directory. A prebuilt `nlm` already on `PATH` is left alone.
`--dry-run` prints the plan.

Then:

```bash
nlm auth          # opens a browser; Chrome policy warnings are noise
qsm-knowledge doctor
nlm list          # confirms the session
```

When queries fail on authentication: `nlm refresh`, then `nlm auth`.
