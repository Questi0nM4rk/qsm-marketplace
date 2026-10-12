#!/usr/bin/env bash
# Seeds transcripts with repeated permission denials and the settings that were active.
set -euo pipefail
H=claude-home
P=$H/projects/-home-dev-shop
mkdir -p "$P" .claude
cat > $H/settings.json <<'EOF'
{
  "permissions": {
    "defaultMode": "default",
    "allow": ["Bash(ls *)"],
    "deny": ["Bash(docker exec *)"]
  }
}
EOF
printf '{}\n' > .claude/settings.json
n=0
# den <times> <denial kind> <tool name> <input json>
den() {
  local times=$1 kind=$2 tool=$3 input=$4 i
  for i in $(seq 1 "$times"); do
    n=$((n + 1))
    jq -cn --arg id "t$n" --arg tool "$tool" --argjson input "$input" \
      '{type:"assistant",message:{role:"assistant",content:[{type:"tool_use",id:$id,name:$tool,input:$input}]}}' >> "$P/s$(((n % 4) + 1)).jsonl"
    jq -cn --arg id "t$n" --arg kind "$kind" \
      '{type:"user",toolDenialKind:$kind,message:{role:"user",content:[{type:"tool_result",tool_use_id:$id,is_error:true,content:"Permission to use this tool was denied."}]}}' >> "$P/s$(((n % 4) + 1)).jsonl"
  done
}
den 5 permission-rule Bash '{"command":"docker ps --format {{.Names}}"}'
den 4 permission-rule Bash '{"command":"kubectl get pods -n shop"}'
den 6 permission-rule Bash '{"command":"bun run typecheck"}'
den 6 permission-rule Bash '{"command":"python scripts/stats.py"}'
den 4 permission-rule Bash '{"command":"curl -s localhost:3000/health"}'
den 4 permission-rule Bash '{"command":"cat package.json | jq .scripts"}'
den 3 permission-rule Bash '{"command":"docker exec api sh -c ls"}'
den 3 user-rejected Bash '{"command":"git push origin main"}'
den 5 permission-rule mcp__docs__search_docs '{"query":"invoices"}'
den 4 permission-rule mcp__docs__get_page '{"id":"payments"}'
