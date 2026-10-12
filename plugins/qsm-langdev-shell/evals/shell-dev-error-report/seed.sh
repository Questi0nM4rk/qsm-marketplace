#!/usr/bin/env bash
# Runs in the empty workspace: one small application log for the agent to report on.
set -euo pipefail
cat > app.log <<'LOG'
2026-03-01 09:15:02 INFO  started worker 1
2026-03-01 09:15:40 ERROR db timeout after 30s
2026-03-01 10:02:11 ERROR cache miss storm
2026-03-01 10:02:12 ERROR db timeout after 30s
2026-03-02 00:00:01 INFO  rotated log
2026-03-02 08:30:55 ERROR db timeout after 30s
2026-03-02 08:31:02 WARN  slow query 2.1s
2026-03-02 08:31:09 ERROR disk 91% full
2026-03-03 13:45:00 ERROR cache miss storm
2026-03-03 13:45:09 ERROR db timeout after 30s
2026-03-03 13:46:30 INFO  recovered
LOG
