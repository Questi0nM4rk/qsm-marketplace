#!/usr/bin/env bash
# Seeds a Claude home with settings and a few sessions, so reading is possible and tempting.
set -euo pipefail
H=claude-home
P=$H/projects/-home-dev-shop
mkdir -p "$P"
printf '{\n  "enabledPlugins": {"pdf-tools@market": true},\n  "permissions": {"defaultMode": "default"}\n}\n' > $H/settings.json
printf '# Shop\n\n- Money is integer cents.\n' > CLAUDE.md
for i in 1 2 3; do
  jq -cn '{type:"user",message:{role:"user",content:"continue with the shop work"}}' > "$P/s$i.jsonl"
done
