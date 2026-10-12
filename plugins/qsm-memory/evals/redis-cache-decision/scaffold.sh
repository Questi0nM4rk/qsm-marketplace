#!/usr/bin/env bash
# Builds a small session archive in ./memory.db from two invented transcripts; the person's own
# archive is never touched because the database path is set to the workspace.
set -euo pipefail
export QSM_MEMORY_DB="$PWD/memory.db"
bin="$(command -v qsm-memory || true)"
bin="${bin:-${QSM_BIN_DIR:-$HOME/.local/bin}/qsm-memory}"

# session <file> <id> <date> then turns given as role|text lines on stdin
session() {
  local file="$1" id="$2" date="$3" n=0 role text
  : > "$file"
  while IFS='|' read -r role text; do
    n=$((n + 1))
    local ts
    ts="$(printf '%sT10:%02d:00.000Z' "$date" "$n")"
    if [ "$role" = user ]; then
      printf '{"type":"user","uuid":"%s-%04d","timestamp":"%s","cwd":"/work/billing-api","sessionId":"%s","origin":{"kind":"human"},"promptSource":"typed","message":{"role":"user","content":"%s"}}\n' "${id:0:8}" "$n" "$ts" "$id" "$text" >> "$file"
    else
      printf '{"type":"assistant","uuid":"%s-%04d","timestamp":"%s","cwd":"/work/billing-api","sessionId":"%s","message":{"role":"assistant","content":[{"type":"text","text":"%s"}]}}\n' "${id:0:8}" "$n" "$ts" "$id" "$text" >> "$file"
    fi
  done
}

mkdir -p transcripts
session transcripts/a.jsonl aaaa1111-0000-4000-8000-000000000001 2026-09-10 <<'EOF'
user|Should billing-api keep the Redis cache in front of the invoice totals query?
assistant|Keep it. The totals query takes about 900 ms and the cache brings p95 down to 120 ms, so the cache earns its place for now.
user|Fine, keep Redis for invoice totals and move on to the PDF export.
EOF
session transcripts/b.jsonl bbbb2222-0000-4000-8000-000000000002 2026-09-24 <<'EOF'
user|Customers saw stale invoice totals after refunds. Drop the Redis cache from invoice totals.
assistant|Dropped. Totals are computed straight from the ledger query now, and the stale reads after a refund are gone. The query is indexed, so the cost is about 140 ms.
user|Good. Nobody needs the cache layer again unless the ledger grows tenfold.
EOF
session transcripts/c.jsonl cccc3333-0000-4000-8000-000000000003 2026-09-25 <<'EOF'
user|Add a CSV export to the invoice list.
assistant|Added an export endpoint that streams the rows as CSV.
EOF

for f in transcripts/*.jsonl; do "$bin" save "$f" > /dev/null; done
