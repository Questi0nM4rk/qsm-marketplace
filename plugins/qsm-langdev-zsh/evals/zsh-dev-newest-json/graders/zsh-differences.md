---
type: llm
---

PASS only if all three hold:

1. The script starts with `#!/usr/bin/env zsh` and sets its failure options with `setopt`
   (`err_exit`, `no_unset`, `pipe_fail`), and the helper function also sets `err_return`, because
   `err_exit` alone does not carry a failure out of a function.
2. The newest file comes from a glob qualifier (`*.json(.om[1])` or with `N`), not `ls -t` or
   `find`, and the empty directory is handled, because an unmatched glob is fatal in zsh.
3. `$EPOCHSECONDS` is preceded by `zmodload zsh/datetime`, and `compinit` is placed under
   `[[ -o interactive ]]` in the .zshrc advice.

FAIL if any is missing.
