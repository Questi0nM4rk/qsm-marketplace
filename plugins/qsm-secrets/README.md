# qsm-secrets

Lets the agent use a credential without ever reading it: the value goes from your secret store to
the command that needs it.

## Why it exists

A token that enters the agent's context is a token in a transcript, a log, and
every model call after it. qsm-secrets exists so the agent can use a
credential without ever reading it: the secret flows from the store into the
command's environment or pipe, and the agent sees only that it was there. It
takes the stance that the agent has no need to know a secret's value, only
that the task ran. It refuses to be a password manager or a place where
secrets are typed. When the harness carries secrets to commands on its own,
this plugin can go.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `qsm-secrets` | Fires when a task needs a secret, and routes it through the wrapper. |
| Skill | `content-denylist` | Builds a machine-local gitleaks rule list of employer, client and internal names, after you approve it. |
| Hook | `tool.call` (guard) | Denies a Bash command that reads a stored value outside the wrapper, and names the wrapper to use. |
| Hook | `tool.call` (use by id) | Runs a command holding `{{secret:<id>}}` with the value in one environment variable, and masks the result. |
| Hook | `prompt.submit` | Stores a pasted secret under `cap_<hex>` and gives the model a placeholder. |
| Hook | `session.end` | Scrubs captured values from the transcript and removes rendered files. |
| CLI | `qsm-secrets` | 14 verbs, see [USAGE.md](USAGE.md). |

## Install

```bash
claude plugin install qsm-secrets@qsm-marketplace
bun plugins/qsm-secrets/scripts/install.ts
qsm-setup activate qsm-secrets -- --backend bitwarden   # or libsecret
qsm-secrets doctor
```

Install compiles `qsm-secrets` into `$QSM_BIN_DIR` (default `~/.local/bin`) and runs
`cargo install rbw` when `rbw` is missing (minutes). The backend is Bitwarden through
[rbw](https://github.com/doy/rbw), or libsecret through `secret-tool`, strictly local. Nothing
works until you choose one. See [INSTALL.md](INSTALL.md).

## Use

```bash
qsm-secrets set github-token                                 # you type the value at the backend's prompt
qsm-secrets pipe github-token -- gh auth login --with-token  # value on stdin
qsm-secrets env npm-token=NPM_TOKEN -- npm publish           # value in one variable
qsm-secrets list                                             # key names, never a value
qsm-secrets render ./app.env.tpl --out app.env               # fills {{secret:<id>}}, prints the path
```

Paste a token into a prompt and the hook stores it. The model reads `{{secret:cap_<hex>}}`
instead of the value.

## Caveats

- A guardrail, not a sandbox: the guard matches commands by name.
- A rendered file is plaintext while the session lives. Another process of the same user can read
  it. An environment variable is visible to the process that holds it.
- Capture: the terminal already showed the text, and a secret sent before the hook existed is not
  recalled. A failed capture lets the prompt in unchanged, with an error toast. A hex-only secret
  is not caught by the entropy floor.
- `get <key> 3>FILE` is a last resort and leaves a secret on disk until you remove it.
- `set` needs a terminal and stores one line only.
- The default namespace is the folder `qsm` (`--folder` or `QSM_SECRETS_FOLDER`).
- libsecret needs a Secret Service on the session bus (GNOME Keyring, KeePassXC). Without one the
  call answers `missing`. It never falls back to Bitwarden.
- The content denylist is only as good as the names you approved. A name never written down on
  this machine is not found.
- Capture catches a known token shape (`ghp_`, `sk-`, `AKIA`, `xox`, JWT) or a 32-character token of
  high entropy. The model also sees the last four characters when the secret has 20 or more.
- `render` writes to `$XDG_RUNTIME_DIR/qsm-secrets/<session>/<name>` (directory 0700, file 0600).
  The session end removes it.
- The content denylist lives at `${XDG_CONFIG_HOME:-~/.config}/qsm/content-denylist.toml`, never in
  a repository.
