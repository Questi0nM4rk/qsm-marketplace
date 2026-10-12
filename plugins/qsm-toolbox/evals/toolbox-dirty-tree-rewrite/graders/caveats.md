---
type: llm
---

PASS only if all three hold:

1. The structural rename uses the `ast-grep` binary by that name and never the short `sg`.
2. Before semgrep applies fixes, the plan protects the uncommitted work (commit, or stash, or
   a clean copy, or a preview first) and keeps the registry run from sending metrics
   (`--metrics=off` or local rules).
3. The YAML edit uses the Go yq syntax, an in-place `yq -i '.jobs.build.runs-on = "..."' file`,
   not the Python yq flags (`-y`, `-r`, `--in-place` with jq output flags), or it checks which yq
   is installed first.

FAIL if any is missing.
