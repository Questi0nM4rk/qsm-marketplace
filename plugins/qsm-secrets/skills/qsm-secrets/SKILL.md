---
name: qsm-secrets
description: "Use when a task needs a secret, token, API key, password, or credential and the value must not enter the transcript. Triggers: \"use my API key\", \"I need the token for this\", \"log in with my credentials\", \"where is the password stored\", \"do we have a secret for X\", \"store this token\", \"publish with the npm token\", \"potrebuju token\", \"dej mi heslo\". Routes every credential through qsm-secrets pipe/env/has/inspect instead of reading a value."
---

# Secrets reach commands, not transcripts

A value you read sits in the transcript, in the session log and in every model call after it, and
cannot be taken back. This skill serves the person who wants an agent to use their credentials
without ever seeing them: hand the key name to `qsm-secrets` and let it put the value into the
command that needs it. It never resolves a value into anything you can read, and it does not touch
the backend (a Bitwarden vault or the local keyring, chosen at activation).

## A pasted secret is already a placeholder

When the person pastes a token, a hook stores it and you read `{{secret:cap_<hex>}}` plus its last
four characters; a pasted `name=value` reads `{{secret:qsm/<name>}}`, the key the person named.
Write the placeholder as-is in a Bash command: the hook runs the command with the
value in one environment variable and scrubs the value from the result. Do not ask for the value or
try to recover it.

For a config file that needs a value, write a template with the placeholder and run
`qsm-secrets render <template> --out <name>`. It prints the path of the filled file; use the path
and do not open the file. The session end removes it.

## Pick the verb from how the consumer wants the value

| The consumer wants it | Use | Example |
| --- | --- | --- |
| on stdin | `pipe` | `qsm-secrets pipe github-token -- gh auth login --with-token` |
| in an environment variable | `env` | `qsm-secrets env npm-token=NPM_TOKEN -- npm publish` |
| in a file it opens itself | `get` with a descriptor | `qsm-secrets get deploy-key 3>/tmp/key` |

Prefer `pipe`, then `env` when the tool has no stdin path. Use `get` only when the consumer reads
neither: write to a path the consumer opens and you do not, and delete it afterwards. `qsm-secrets
get <key>` alone refuses, because the descriptor is closed and the only place left for the value
is your output.

## Ask about a key without seeing it

| Question | Verb | Comes back |
| --- | --- | --- |
| Is it stored? | `qsm-secrets has <key>` | ok when stored, missing when not |
| What did we store? | `qsm-secrets list` | key names only |
| What else is in there? | `qsm-secrets inspect` | name, username, folder per entry |
| Does the stored token still work? | `qsm-secrets check <key>=<VAR> -- <probe>` | ok, or failed with the probe's exit code |
| Is the tooling usable? | `qsm-secrets doctor` | every prerequisite, with a fix |

Run `has` before building a command around a key, because a failed `has` is cheap and a deployment
that stopped half-way on a missing credential is not. `--folder <name>` points any verb at another
vault folder; an empty name searches the whole vault by key name.

## Rules and their reasons

- A key name is yours to choose, a value is never yours to see. Read the name from `list` and move
  on; asking "what is the token" asks for the one thing this tool prevents.
- A missing key: tell the person `run qsm-secrets set <key>` and stop. Offering to store it for
  them means they paste the value into chat, and the paste is the leak; `set` refuses without a
  terminal for the same reason.
- A locked vault: run `qsm-secrets doctor`, report the failed check and its fix, and wait. The
  unlock is a master password that belongs to the person at their own prompt.
- A value that reached a file makes that file a secret: do not open or `cat` it, remove it when the
  step is done.
- Check a credential with `qsm-secrets check <key>=<VAR> -- <probe>` (for example
  `check npm-token=NPM_TOKEN -- npm whoami`), never by looking at the value, because looking is
  a read.
- Never put a value in an argument, because other users on the machine can read process arguments.
  `pipe` and `env` exist so you never have to.

## Red flags

- When you are about to run `rbw`, `bw`, `pass` or `secret-tool` (any verb), or talk to the secret
  service over the bus, use a verb above instead, because the guard refuses these through `sudo`,
  `env`, `xargs`, `sh -c` and pipelines, and the refusal is right. `qsm-secrets set` stores,
  `list` and `has` browse.
- When you are about to `cat` a `.env`, `.pem`, `id_*` key, `.netrc` or `.aws/credentials`, or
  read or Grep the keyring files, the vault's data directory or a rendered config, stop, because
  the value would land in the transcript. Hand a rendered file's path to the command that needs it.
- When a placeholder sits in single quotes, move it into double quotes, because inside single
  quotes it is never replaced and the guard refuses the command.
- When you are about to ask the person to paste a credential into the conversation, ask them to
  run `qsm-secrets set <key>`, because a pasted value outlives the task.
- When you want to echo, truncate or "mask" a value to show you have it, say the key and verb
  instead, because any form of it is still a read.
- When a command would put a credential in a commit, log line, comment or error message, or
  redirect a secret-reading command into a file you will read, change it, because each leaves the
  value where it outlives the task.
- When `get`'s descriptor points at your own output (`3>&1`, `3>&2`, `3>/dev/stdout`), stop,
  because the guard refuses it.

## Say it in the reply

Name the key and the verb, never the value: "ran the publish through
`qsm-secrets env npm-token=NPM_TOKEN`". When a key is missing or the vault is locked, say which
key, which check failed and the one command the person runs, then wait.
