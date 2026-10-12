---
name: fish-dev-port-rotate
tags: [scenario]
runs: 3
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Port this bash script to fish with the same behaviour, and add a handler that reruns my prompt
setup whenever the variable `theme` changes. My fish config is not in this sandbox, so do not look
for it: reply with each file path and its exact contents.

```bash
#!/usr/bin/env bash
set -euo pipefail
dir=${1:-/var/log/app}
files=("$dir"/*.log)
[[ ${#files[@]} -gt 0 ]] || { echo "no logs" >&2; exit 1; }
first=${files[0]}
gzip -c "$first" > "$first.gz"
echo "rotated $first"
```
