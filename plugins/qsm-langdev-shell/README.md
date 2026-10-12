# qsm-langdev-shell

A skill that teaches an agent to write Bash scripts that run unattended, for a developer who
wants the agent's shell to match theirs.

## Why it exists

A model left alone writes shell that leans on external tools and forgets the portable shebang, and
the strict-mode traps are the part shellcheck cannot decide. qsm-langdev-shell holds one skill,
`shell-dev`, with only those traps and the style a bash script is judged on: `#!/usr/bin/env bash`
and builtins before external tools. It refuses to be the shell's manual or a substitute for
shellcheck, which qsm-langdev runs on the result. When the agent's unprompted bash is the bash we
would write ourselves, the plugin has no reason to exist.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `shell-dev` | The Bash header, builtins before external tools, the traps strict mode sets, quoting, retry with backoff |

## Install

```bash
claude plugin install qsm-langdev-shell@qsm-marketplace
```

Installs the skill only. Brings `qsm-langdev` with it: the checkers (shellcheck, shfmt,
checkbashisms) and the gate profile live there, so installing the language brings its gate.

## Use

The skill fires on a Bash ask. You do not call it.

- ask: "write a bash script that backs up a directory and cleans up on exit"
- ask: "why does `set -e` not stop on this arithmetic?"
- ask: "add a retry with backoff to this curl call"
- ask: "why does my while-read loop lose its variable?"

## Caveats

- The plugin ships no hooks, linter, or type checker. The gate is `qsm-langdev`'s.
- No zsh or fish guidance. Those are `qsm-langdev-zsh` and `qsm-langdev-fish`.
