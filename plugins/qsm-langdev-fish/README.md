# qsm-langdev-fish

A skill that teaches an agent to write fish 4 scripts, functions, and config, for a developer
whose login shell is fish.

## Why it exists

A model left alone writes fish as if it were bash: `set -e`, a `$status` read twice, a bare `set`
that leaks scope. The harness default is whatever the model remembers, and that is bash. This
skill keeps only the caveats a model gets wrong, measured against fish 4.8, and nothing a fish
tutorial has. It refuses to be the shell's manual or a substitute for running the script. When the
agent's unprompted fish is the fish we would write ourselves, the skill has no reason to exist.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `fish-dev` | The fish 4 caveats a model gets wrong: `$status`, scope, indexes, globs, what loads from `conf.d` |

## Install

```bash
claude plugin install qsm-langdev-fish@qsm-marketplace
```

Installs the skill only. Brings `qsm-langdev` with it: the checkers and the gate profile for
`.fish` files live there, so installing the language brings its gate.

## Use

The skill fires on a fish ask. You do not call it.

- ask: "write a fish function that rotates a port list"
- ask: "edit my config.fish to add a path"
- ask: "port this bash script to fish"
- ask: "why does my fish variable vanish after the script ends?"

## Caveats

- The plugin ships no hooks, linter, or type checker. The gate is `qsm-langdev`'s.
- No bash or zsh guidance. Those are `qsm-langdev-shell` and `qsm-langdev-zsh`.
