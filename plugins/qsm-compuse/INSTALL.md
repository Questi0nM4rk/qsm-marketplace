# Install

```bash
bun plugins/qsm-compuse/scripts/install.ts
```

Needs `bun`, and at run time `hyprctl`, `ydotool` with a running `ydotoold`, `grim`, `jq`, and
membership of the `input` group. The shared installer reads `qsm.links` in `qsm.json` and links
`drive` into `QSM_BIN_DIR` (default
`~/.local/bin`); `--dry-run` prints the plan. Run `drive doctor` afterwards. The plug-in itself
installs with `claude plugin install qsm-compuse@qsm-marketplace`.
