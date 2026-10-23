# Install qsm-setup

```sh
export QSM_MARKETPLACE=/path/to/qsm-marketplace
bun "$QSM_MARKETPLACE/plugins/qsm-setup/scripts/install.ts"
```

Compiles `qsm-setup` into `$QSM_BIN_DIR` (default `~/.local/bin`); `--dry-run` previews. Other
variables: `QSM_SETUP_CONFIG` (`~/.config/qsm/setup.json`), `QSM_SETUP_STATE_DIR`
(`~/.local/state/qsm`).

The canonical checkout's refresh hook runs this same installer before `qsm-setup install --all`,
inside its refresh lock. A failed bootstrap stops installation and plugin cache updates.
