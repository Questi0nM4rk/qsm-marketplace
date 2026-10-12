# Install

```bash
claude plugin install qsm-usage@qsm-marketplace
bun plugins/qsm-usage/scripts/install.ts
qsm-usage doctor
```

The installer compiles `qsm-usage` into `QSM_BIN_DIR` (default `~/.local/bin`). It is idempotent;
`--dry-run` prints the plan.

The Bash hook needs the `rtk` output filter and stays inert without it (output is unfiltered,
nothing fails). The installer builds it when missing. Never `cargo install rtk` from crates.io:
that name is a different package. Use:

```bash
cargo install --git https://github.com/rtk-ai/rtk --rev 5d32d0736f686b69d1e8b9dc45c007d4eb77a0a2 --locked
```

Add `~/.cargo/bin` to `PATH`. `QSM_FILTER_BIN` names another filter.

`qsm-usage count --mode exact` needs `ANTHROPIC_API_KEY` (one network call per input); the default
estimate needs none.
