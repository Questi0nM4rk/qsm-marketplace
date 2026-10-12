---
name: fish-dev
description: "Use when writing or editing fish scripts, functions or config (fish 4): no set -e, $status overwritten by every command, set -l against bare set, set -U shadowing set -g, index 0 an error, where an unmatched glob does and does not abort, and what loads from conf.d and functions. Triggers: writing a fish script, editing config.fish, how does X work in fish, fish functions, fish vs bash, conf.d, universal variables, prepis to do fish. Bash scripts are shell-dev, zsh is zsh-dev."
---

# Writing fish

The user's login shell is fish, so the config and small scripts are fish. This skill keeps only the
caveats models get wrong in fish 4; qsm-langdev's checkers catch the rest as a file lands, so
nothing here restates what they report. Bash is shell-dev, zsh is zsh-dev.

## Rules

- Check every failure yourself, because fish has no `set -e`: `mkdir -p $dir; or return 1`. Use
  `or exit 1` to abort a whole script.
- Capture `$status` with `set -l rc $status` before a second use, because every command, `test`
  included, overwrites it. After a pipeline `$pipestatus` holds every stage.
- Write `set -l` for every local, because bare `set` modifies a global of the same name when one
  exists.
- Do not use `set -U` in scripts, because a universal variable outlives the script and shadows a
  later `set -g`. When a value "will not change", look for a `set -U` of the same name.
- `$l[0]` is an error, not empty, and `$l[-1]` is the last. Lists start at 1.
- Guard a glob that feeds a command: `set -l files *.log; test (count $files) -gt 0; or return 1`.
  Unmatched, a glob in a `for` header or `set` is empty with status 0; as a command argument it is
  an error and the command never runs.
- Put an `--on-variable` or `--on-event` handler in `conf.d/`, because it must exist before the
  event fires. A file in `functions/` defines one function named like the file.
- Keep interactive setup in `config.fish` under `status is-interactive`, because a script or CI
  sourcing it needs no TTY and should stay fast.

## Red flags

- When you write `[[ ]]`, `${var:-x}`, `export` or `local`, rewrite it in fish (`test`, `set -q`
  with `or set`, `set -gx`, `set -l`), because it does not parse or means something else. `$(...)`
  and `VAR=value cmd` are fine in fish 4, so leave them.

## Say it in the reply

When you translate from bash or zsh, name the fish behaviour that forced each change, so the user
sees why the line changed shape.
