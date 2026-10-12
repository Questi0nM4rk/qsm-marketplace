---
type: llm
---

PASS only if all three hold:

1. The failure handling is written out: fish has no `set -e`, so the `gzip` and the empty-list
   case are checked with `or exit 1`, `or return 1` or a `$status` check, and the glob is
   captured into a `set -l` list and its `count` tested before use, because an unmatched glob as a
   command argument is an error.
2. The first element is `$files[1]`, never `[0]`, and every variable is declared with `set -l`.
3. The `--on-variable theme` handler is in its own file under `conf.d/`, not in `config.fish`.

FAIL if any is missing, or if `set -U` is used for the script's variables.
