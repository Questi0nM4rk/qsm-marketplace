#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > README.md <<'EOF'
# taskd
A small task tracker. One process per machine, state in a JSON file.
EOF
cat > DECISIONS.md <<'EOF'
- The cache is in-process only, never shared between machines.
- A stale entry is acceptable for up to 60 seconds.
EOF
cat > src/store.ts <<'EOF'
import { readFileSync } from "node:fs";
export function load(path: string): unknown[] {
  return JSON.parse(readFileSync(path, "utf8"));
}
EOF
