# Installing qsm-secrets

```bash
claude plugin install qsm-secrets@qsm-marketplace
bun plugins/qsm-secrets/scripts/install.ts
```

Compiles `qsm-secrets`, writes the fish completion, and runs
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

For libsecret, a Secret Service provider (GNOME Keyring, KeePassXC) must run on the session bus.
