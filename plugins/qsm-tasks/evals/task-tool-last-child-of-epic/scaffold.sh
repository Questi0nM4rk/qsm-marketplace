#!/usr/bin/env bash
# An epic whose last spec-change task was just finished: the work is done, the task store is not
# told, and the epic still has its open test-it task and nothing pushed.
set -euo pipefail
for tool in br jq; do command -v "$tool" > /dev/null || { echo "scaffold needs $tool on PATH" >&2; exit 1; }; done
printf 'month,total\n2026-08,120\n2026-09,95\n' > sample.csv
cat > export.sh <<'J'
#!/usr/bin/env bash
# prints the report as csv
cat "$1"
J
br init --prefix rpt > /dev/null
EPIC=$(br create "Report export v2" -t epic -d "Ship the monthly CSV export the accountant asked for." --json | jq -r .id)
A=$(br create "Add the month column" -t task --parent "$EPIC" -d "Export has a month column." --json | jq -r .id)
B=$(br create "Quote totals as numbers" -t task --parent "$EPIC" -d "Totals are plain numbers." --json | jq -r .id)
br close "$A" --reason "month column added to sample.csv and export.sh output" > /dev/null
br close "$B" --reason "totals are bare numbers, checked in sample.csv" > /dev/null
br create "Header row is printed twice" -t task --parent "$EPIC" -d "export.sh prints the header row twice. Done when 'bash export.sh sample.csv | head -3' shows the header once." > /dev/null
br create "Test it" -t task --parent "$EPIC" -d "Run bash export.sh sample.csv end to end and read the output." > /dev/null
br sync --flush-only > /dev/null
