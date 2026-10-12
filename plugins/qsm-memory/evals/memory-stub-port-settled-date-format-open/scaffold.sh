#!/usr/bin/env bash
set -euo pipefail
command -v qsm-memory > /dev/null || { echo "scaffold needs qsm-memory on PATH" >&2; exit 1; }
mkdir -p seed
turn() { # turn <file> <type> <uuid> <iso time> <text>
  printf '{"type":"%s","uuid":"%s","parentUuid":null,"isSidechain":false,"cwd":"/work/shop","sessionId":"%s","timestamp":"%s","message":{"role":"%s","content":[{"type":"text","text":"%s"}]}}\n' \
    "$2" "$3" "$(basename "$1" .jsonl)" "$4" "$2" "$5" >> "$1"
}
A=seed/aaaaaaaa-0000-4000-8000-000000000001.jsonl
turn $A user a1 2026-10-01T09:00:00.000Z "The staging stub keeps colliding with the grafana agent. Pick a port for it."
turn $A assistant a2 2026-10-01T09:00:05.000Z "Port 7400 is the grafana agent's. Use 7410 for the stub, set STUB_PORT=7410 in compose.staging.yaml."
turn $A user a3 2026-10-01T09:01:00.000Z "Good, 7410 it is."
B=seed/bbbbbbbb-0000-4000-8000-000000000002.jsonl
turn $B user b1 2026-10-03T14:00:00.000Z "Why did we remove the retry from the sync job?"
turn $B assistant b2 2026-10-03T14:00:05.000Z "The upstream is not idempotent: a retry double-posted invoices. The retry was removed and failures go to a dead-letter table."
C2=seed/cccccccc-0000-4000-8000-000000000003.jsonl
turn $C2 user c1 2026-10-05T10:00:00.000Z "Rename the banner component and fix the padding on mobile."
turn $C2 assistant c2 2026-10-05T10:00:05.000Z "Renamed Banner to PageBanner and set the mobile padding to 12px."
D=seed/dddddddd-0000-4000-8000-000000000004.jsonl
turn $D user d1 2026-10-02T08:00:00.000Z "Which timestamp format should the audit log use?"
turn $D assistant d2 2026-10-02T08:00:05.000Z "ISO 8601 in UTC, for example 2026-10-02T08:00:00Z, set in audit/log.ts."
for f in seed/*.jsonl; do QSM_MEMORY_DB="$PWD/memory.db" qsm-memory save "$f" --cwd /work/shop > /dev/null; done
rm -rf seed
QSM_MEMORY_DB="$PWD/memory.db" qsm-memory doctor
