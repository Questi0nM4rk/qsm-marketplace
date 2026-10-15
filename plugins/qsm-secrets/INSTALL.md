# Installing qsm-secrets

```bash
claude plugin install qsm-secrets@qsm-marketplace
bun plugins/qsm-secrets/scripts/install.ts
```

Compiles `qsm-secrets`, links `qsm-askpass-sudo`, `-ssh`, `-git` and `-decide` to it in the bin
directory, copies the askpass pane to `$XDG_DATA_HOME/qsm/askpass/qml` (default
`~/.local/share/qsm/askpass/qml`), writes the default qsm palette to
`$XDG_CONFIG_HOME/qsm-marketplace/colors.json` when that file is absent, writes the fish completion, and runs
`cargo install rbw` when rbw is missing. `--dry-run` previews. Put `$QSM_BIN_DIR` (default
`~/.local/bin`) on `PATH`.

Then choose the backend; nothing works until you do (it asks at a terminal, and
`QSM_SECRETS_BACKEND=bitwarden|libsecret` overrides the stored choice):

```bash
qsm-setup activate qsm-secrets -- --backend bitwarden   # or libsecret
```

For bitwarden, point rbw at your vault and set an editor (storing a secret opens one):

```bash
rbw config set email you@example.com
rbw login
export EDITOR=nvim
qsm-secrets doctor
```

The askpass pane needs Quickshell (`qs`) and a Wayland session. Its colours come from
`~/.config/qsm-marketplace/colors.json`: edit any key there and an open pane takes it at once; a key
you delete falls back to the default. To use it for sudo, ssh or git, run
`qsm-secrets askpass enable --sudo --ssh --git` and put the lines it prints in your fish config;
sudo then needs `sudo -A`, and a cached sudo timestamp skips the pane (`sudo -k` or
`Defaults timestamp_timeout=0`).

For libsecret, a Secret Service provider (GNOME Keyring, KeePassXC) must run on the session bus.

The compiled binary parses commands with `@questi0nm4rk/shell-ast`, a dependency of the plugin
(`package.json`); the install script runs `bun install --frozen-lockfile` in the plugin before it
compiles, so the WebAssembly module is embedded and the binary runs from any directory.
