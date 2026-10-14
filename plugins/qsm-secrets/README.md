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
| Hook | `tool.call` (guard) | Denies a Bash command that reads a stored value outside the wrapper, read from its syntax tree through `sudo`, `env`, `xargs`, `flock`, `find -exec`, `qsm-secrets env -- <cmd>`, `sh -c`, subshells and pipelines, with a code and the verb to use instead. It also denies a placeholder inside single quotes. |
| Hook | `tool.call` (Read, Grep) | Denies reading the keyring files, the vault's data directory and the rendered config directory. |
| Hook | `tool.call` (use by id) | Runs a command holding `{{secret:<id>}}` with the value in one environment variable. |
| Hook | `session.append` | Masks every stored value in every row the conversation keeps (tool results, file reads, responses) before it is stored; a row it cannot mask is withheld. |
| Hook | `prompt.submit` | Stores a pasted secret under `cap_<hex>` (or under `<name>` for a pasted `name=value`) and gives the model a placeholder; a prompt it cannot check is not sent. |
| Hook | `session.end` | Scrubs captured values from the transcript and removes rendered files. |
| CLI | `qsm-secrets` | 20 verbs, see [USAGE.md](USAGE.md). |
| Pane | `qml/askpass/` | A Quickshell pane that asks the person for a secret, a `sudo -A`, ssh or git answer, or an allow or deny, and returns it to the asker. |

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
qsm-secrets set github-token --gui                           # you type it in the askpass pane instead
qsm-secrets askpass enable --sudo --git                      # prints the fish lines for SUDO_ASKPASS and GIT_ASKPASS
qsm-secrets pipe github-token -- gh auth login --with-token  # value on stdin
qsm-secrets env npm-token=NPM_TOKEN -- npm publish           # value in one variable
qsm-secrets list                                             # key names, never a value
qsm-secrets check npm-token=NPM_TOKEN -- npm whoami          # does the stored token still work: ok or failed
qsm-secrets rename old-name new-name                         # value never printed, old name removed last
qsm-secrets prune --dry-run                                  # captures no transcript names; drop --dry-run to remove
qsm-secrets render ./app.env.tpl --out app.env               # fills {{secret:<id>}}, prints the path
```

Paste a token into a prompt and the hook stores it. The model reads `{{secret:cap_<hex>}}`
instead of the value. Paste `deploy-key=<token>` and it is stored as the key `deploy-key` in the
`qsm` namespace, and the model reads `{{secret:qsm/deploy-key}}`; a name that is already stored is
never overwritten, the value gets a `cap_<hex>` and the toast says why.

## Caveats

- A guardrail, not a sandbox: the guard reads a command's syntax tree and names the commands it
  runs, so it does not see a script file's body, a command built from a variable, a shell
  function, or a wrapper it does not know. It runs `qsm-secrets guard` once per Bash call, about
  90 ms with the compiled binary. A command it cannot parse (zsh-only syntax such as `*(.)`) is
  refused with the cause; rewrite it in bash syntax. A guard that cannot answer denies every Bash
  call except `qsm-secrets doctor` and the install script, so a broken install can be repaired.
- A placeholder goes in double quotes or bare: inside single quotes it is never replaced, so the
  guard refuses it.
- A rendered file is plaintext while the session lives. Another process of the same user can read
  it. An environment variable is visible to the process that holds it.
- Capture: the terminal already showed the text, and a secret sent before the hook existed is not
  recalled. A failed capture stops the prompt (it is dropped with the cause and the fix, and you
  send it again). A hex-only secret is caught only after a credential name (`token=`, `secret:`).
- Masking: every row is masked against every stored value of six or more characters, one process
  per row; a value printed re-encoded (base64, escaped) is not masked, and a row the mask cannot
  read is withheld, with a toast. Without a chosen backend every row is withheld.
- `prune` trusts the transcripts: run it after your sessions end, since a capture made in a live
  session is named in its transcript only once the prompt is rewritten.
- `get <key> 3>FILE` is a last resort and leaves a secret on disk until you remove it.
- `set` needs a terminal, or `--gui`, and stores one line only.
- The askpass pane runs on Quickshell (`qs` on PATH) as an instance of its own, started on demand and
  addressed by its config path. Without `qs` or the installed pane the call answers `missing`; there
  is no terminal fallback. 120 seconds without an answer, or Escape, is `failed` with the reason.
- The pane names the parent process that asked, with its executable and the first 12 hex of its
  sha256, so you see which binary wants the answer. It is not proof: the request's nonce is in the
  argv of `qs ipc call`, which any process of your user can read, so one outside the guard can write
  a forged answer to the reply socket. The guard refuses an agent's Bash that calls the pane's
  target, runs a `qsm-askpass-<kind>` link or `qsm-secrets askpass <kind>` itself, or names the
  socket directory; a determined agent can still route around it. Peer credentials on the reply
  socket are not checked.
- With `SSH_ASKPASS_PROMPT=confirm` ssh gets a yes or no (Allow is exit 0), with `none` the pane shows
  the prompt as a notice.
- The default namespace is the folder `qsm` (`--folder` or `QSM_SECRETS_FOLDER`).
- libsecret needs a Secret Service on the session bus (GNOME Keyring, KeePassXC). Without one the
  call answers `missing`. It never falls back to Bitwarden.
- The content denylist is only as good as the names you approved. A name never written down on
  this machine is not found.
- Capture catches a known token shape (`ghp_`, `glpat-`, `sk-`, `AKIA`, `xox`, JWT), a value after
  a credential name (a password from 6 characters), or a 32-character token that is random for its alphabet and is not a path, a
  name, an id, a hash or base64 of text. On a labelled corpus the test holds precision 1.0 and recall of at least 0.95; that guards a
  regression and is not the precision on your own text. The model also sees the last four characters when the secret
  has 20 or more.
- `render` writes to `$XDG_RUNTIME_DIR/qsm-secrets/<session>/<name>` (directory 0700, file 0600).
  The session end removes it.
- The content denylist lives at `${XDG_CONFIG_HOME:-~/.config}/qsm/content-denylist.toml`, never in
  a repository.
