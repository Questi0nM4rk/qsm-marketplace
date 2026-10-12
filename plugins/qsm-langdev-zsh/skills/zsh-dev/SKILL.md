---
name: zsh-dev
description: "Use when writing a Zsh script or rc file, or translating bash to zsh: unmatched globs are fatal, no word splitting, 1-indexed arrays, =word expansion, parameter expansion flags, glob qualifiers, zmodload, and keeping compinit interactive. Triggers: writing a zsh script, zsh vs bash, zsh strict mode, zsh arrays, ${(L)var}, glob qualifiers, extended_glob, zmodload, zshrc, compinit. Bash is shell-dev, fish is fish-dev."
---

# Writing Zsh

The Bash tool and the user's rc files run zsh. Zsh is close enough to bash to mislead, so this skill
holds the differences that change behaviour silently and the user's header. Bash is shell-dev, fish
is fish-dev.

## Rules

- Open a script with this header, because `/bin/sh` is dash on Arch and does not know `setopt`:

  ```zsh
  #!/usr/bin/env zsh
  setopt err_exit no_unset pipe_fail warn_create_global
  ```

- Add `setopt local_options err_return` inside a function, because `err_exit` does not propagate a
  failure out of a function body and `err_return` does.
- Guard a glob with `*.json(N)` or `setopt null_glob`, because an unmatched glob is fatal
  (`nomatch`).
- Index arrays from 1. `$arr[1]` is the first and `${arr[0]}` is empty.
- Split on purpose with `${=var}` or an array, because `$var` never word-splits.
- Quote a value that can start with `=`, because `=word` expands to a command path.
- Set `extended_glob` at the top when a pattern uses `^`, `~` or `#`, because it is off by default
  and the script then depends on the session that sourced it.
- Use expansion flags and glob qualifiers instead of `tr`, `find` and `eval`: `${(L)name}`,
  `${(j:,:)parts}`, `${(P)varname}`, `*(.om[1])` newest file. They run in the current shell.
- `zmodload zsh/datetime`, `zsh/regex` or `zsh/mathfunc` before using `$EPOCHSECONDS`, `$MATCH` or
  the math functions, because a script without it works here and fails in CI.
- Load a plugin manager and `compinit` only under `[[ -o interactive ]]`, because they cost 50 to
  500 ms and assume a TTY. Gate zsh-only syntax in a file bash also sources on
  `[[ -n $ZSH_VERSION ]]`.

## Red flags

- When a script forks `tr`, `sed` or `find` for something a flag or qualifier does, replace it,
  because the fork is slower and splits differently.

## Say it in the reply

When you translate from bash, name the zsh difference that forced each change (glob, index,
splitting), so the user sees why the line is not a copy.
