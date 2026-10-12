---
name: shell-dev
description: "Use when writing a Bash script: strict mode and where it bites, arithmetic under set -e, the subshell that eats a while-read loop, local with command substitution, traps, process substitution, safe dynamic construction. Triggers: writing a bash script, bash strict mode, quoting rules, bash arrays, mapfile, (( )) arithmetic, trap EXIT, process substitution, retry with backoff, printf %q. Zsh is zsh-dev, fish is fish-dev."
---

# Writing Bash

Bash for scripts that run unattended: `#!/usr/bin/env bash` first, builtins before external tools.
shellcheck reports mistakes; this skill holds what it cannot decide and the traps strict mode sets.
It is not a tutorial, and a script that needs more than bash gives is a program in another language.

## The header

```bash
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'
```

Use `env bash`, because bash is not at a fixed path on NixOS or Alpine. Drop to `#!/bin/sh` only
where bash is absent: POSIX-only syntax under a bash shebang buys no portability and gives up
`[[ ]]`, `mapfile` and `(( ))`.

## Builtins before external tools

Every `sed`, `awk`, `cut`, `tr`, `expr` or `cat file |` is a fork per call and a dependency the
target machine may lack (BSD against GNU flags). Reach for the builtin first, and call an external
tool only where no builtin does the job (`sort`, `uniq` over a stream, `date`):

| Job | Builtin |
| --- | --- |
| trim, strip a prefix or suffix, replace | `${x#pre}`, `${x%suf}`, `${x//a/b}` |
| split on a character | `IFS=, read -ra parts <<< "$x"` |
| match and capture | `[[ $x =~ ^([0-9]{4})-([0-9]{2}) ]]`, then `${BASH_REMATCH[1]}` |
| read a file by line | `while IFS= read -r line; do ...; done < file` |
| count, add | `(( n++ ))` and `${#arr[@]}` |
| count by key | `declare -A seen; (( seen[$key]++ ))` |

## Style

A script is a few small functions and a `main "$@"` at the bottom, so it can be sourced and read
top-down. Declare `local` in every function, `readonly` for constants, use `printf` instead of
`echo` (its flags differ by shell), and send errors to stderr with a non-zero exit
(`die() { printf '%s\n' "$*" >&2; exit 1; }`). Check the arguments first and print a usage line,
because a script that fails on a missing `$1` three screens later is hard to read.

## Traps strict mode sets

- `(( expr ))` exits 1 when the expression is zero, so a bare `(( count > 0 ))` at zero kills the
  script under `set -e`. Write `(( count > 0 )) || true` where zero is legal.
- `local out=$(cmd)` discards `cmd`'s status, because `local` returns 0. Declare, then assign:
  `local out; out=$(cmd) || return 1`.
- Every side of a pipe is a subshell, so `generate | while read ...; do arr+=("$l"); done` leaves
  the array empty. Feed the loop with `done < <(generate)`, or use `mapfile -t arr < <(generate)`.
- Cleanup written after a failing command never runs under `set -e`. Use `trap '...' EXIT`, which
  runs however the script leaves.
- Resolve the script's own path from `${BASH_SOURCE[0]}`, not `$0`, which is the invoking shell
  when sourced.

## Quoting

Quote every expansion and forward arguments with `"$@"`, because `$*` joins them with the first
character of `IFS`. Use `[[ ]]`, which does not word-split its operands.

## Process and building commands

Redirect all three streams before backgrounding a job (`worker < /dev/null > log 2>&1 &`), because
an inherited descriptor delays pipe EOF, holds a lock, or leaks to the terminal. Use `<(cmd)` to
give a command's output a filename instead of a temp file.

Avoid `eval`. Where construction from data is unavoidable, pass the value through
`printf '%q'` first. Check a path before `$(<file)` unless it is a fixed location, since it can
name `/dev/stdin` and hang the script.

## Retry with backoff

Double the delay between attempts, because a fixed delay ties your recovery time to the failing
service's and synchronises every retrying client:

```bash
retry() { local max=$1 delay=$2; shift 2; local n=1
  while (( n <= max )); do "$@" && return 0; sleep "$delay"; (( n++, delay *= 2 )); done
  return 1; }
```

## Say it in the reply

When a script uses one of the traps above, name which one, so the next reader does not "simplify"
it back.
