# Install

```bash
bun plugins/qsm-uix/scripts/install.ts
```

Compiles `qsm-uix` into your bin directory (already on `PATH`) and probes the external tools.
`--dry-run` prints the plan.

| Variable | Effect |
| --- | --- |
| `QSM_BIN_DIR` | Binary location. Default `~/.local/bin`. |
| `QSM_UIX_DIR` | Where unnamed output files go. Default a `qsm-uix` temp directory. |

External tools, never installed for you: `magick` (imagemagick) is required; `wtype` is required
(the audit's key sender, `sudo pacman -S wtype`); `grim` is needed only for `screenshot` and
`burst`; `hyprctl` only when those run without `--output`.

Check: `qsm-uix doctor`, which also needs the AT-SPI bus to answer
(`systemctl --user restart at-spi-dbus-bus.service` when it does not).
