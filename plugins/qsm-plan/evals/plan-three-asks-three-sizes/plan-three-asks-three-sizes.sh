#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > src/cli.ts <<'EOF'
export function printJson(items: string[]): string {
  let out = "[";
  for (const i of items) out += JSON.stringify(i) + ",";
  return out + "]";
}
EOF
cat > src/report.ts <<'EOF'
export function report(rows: { name: string; total: number }[]): string {
  return rows.map((r) => r.name + ": " + r.total).join("\n");
}
EOF
br init >/dev/null 2>&1
br create "Add CSV export to the report command" -t task --slug csv-export -d "Customers asked for it twice." >/dev/null
