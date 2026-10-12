#!/usr/bin/env bash
# Seeds a Claude home with installed extensions, install-time usage totals and ten sessions that use only some of them.
set -euo pipefail
H=claude-home
P=$H/projects/-home-dev-shop
mkdir -p "$P" $H/skills/changelog
cat > $H/settings.json <<'EOF'
{
  "enabledPlugins": {
    "pdf-tools@market": true,
    "figma-helper@market": true,
    "review-kit@market": true
  }
}
EOF
cat > $H/managed-settings.json <<'EOF'
{
  "enabledPlugins": { "corp-guard@market": true }
}
EOF
cat > $H/.claude.json <<'EOF'
{
  "mcpServers": {
    "github": { "command": "gh-mcp" },
    "figma": { "command": "figma-mcp" }
  },
  "skillUsage": {
    "pdf-tools:extract": { "usageCount": 41, "lastUsedAt": 1790000000000 },
    "review-kit:review": { "usageCount": 12, "lastUsedAt": 1790000000000 }
  },
  "pluginUsage": {
    "pdf-tools@market": { "usageCount": 41, "lastUsedAt": 1790000000000 }
  }
}
EOF
printf -- '---\nname: changelog\ndescription: Write a changelog entry.\n---\nWrite the entry.\n' > $H/skills/changelog/SKILL.md
n=0
# call <session> <tool name> <input json>
call() {
  n=$((n + 1))
  jq -cn --arg id "t$n" --arg tool "$2" --argjson input "$3" \
    '{type:"assistant",message:{role:"assistant",content:[{type:"tool_use",id:$id,name:$tool,input:$input}]}}' >> "$P/$1.jsonl"
}
for i in $(seq 1 10); do
  s="s$i"
  jq -cn '{type:"user",message:{role:"user",content:"continue with the shop work"}}' > "$P/$s.jsonl"
  call "$s" mcp__github__list_prs '{"repo":"shop"}'
  call "$s" Bash '{"command":"npm test"}'
done
for i in 2 5 8; do call "s$i" Skill '{"skill":"review-kit:review"}'; done
