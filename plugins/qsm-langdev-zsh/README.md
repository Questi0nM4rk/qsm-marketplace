# qsm-langdev-zsh

A skill that teaches an agent to write Zsh and where it differs from bash, for a developer
whose scripts and rc files are zsh.

## Why it exists

A quality gate only checks a language the project says it speaks, and zsh is close enough to bash
that a model writes it wrong without noticing. qsm-langdev-zsh tells qsm-langdev that this project
speaks zsh, and its skill holds only the places where zsh silently differs from bash. It takes the
stance that a session carries only the caveats of the shells it touches. It refuses to be the
shell's manual or a substitute for running the script. When the agent's unprompted zsh is the zsh we
would write ourselves, the plugin has no reason to exist.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `zsh-dev` | The places zsh silently differs from bash: fatal globs, no word splitting, 1-indexed arrays, expansion flags |

## Install

```bash
claude plugin install qsm-langdev-zsh@qsm-marketplace
```

Installs the skill only. Brings `qsm-langdev` with it: it carries the zsh profiles and checkers,
and zsh is gated only through it.

## Use

The skill fires on a zsh ask. You do not call it.

- ask: "write a zsh script that lists the newest JSON files"
- ask: "translate this bash script to zsh"
- ask: "add a function to my zshrc"
- ask: "why does this glob abort the script in zsh?"

## Caveats

- The plugin ships no hooks, linter, or type checker. The gate is `qsm-langdev`'s.
- No bash guidance. That is `qsm-langdev-shell`.
