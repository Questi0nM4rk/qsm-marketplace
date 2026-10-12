#!/usr/bin/env bash
set -euo pipefail
mkdir -p src openspec/specs
cat > src/report.ts <<'EOF'
export function report(rows: { name: string; total: number }[]): string {
  return rows.map((r) => r.name + ": " + r.total).join("\n");
}
EOF
br init >/dev/null 2>&1
