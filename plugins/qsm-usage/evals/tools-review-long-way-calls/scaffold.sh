#!/usr/bin/env bash
# Seeds transcripts of calls done the long way, a large JSON file, and the saved output of the two tool listings.
set -euo pipefail
H=claude-home
P=$H/projects/-home-dev-shop
mkdir -p "$P" data
jq -n '[range(0;300) | {id: ., sku: ("SKU-" + tostring), qty: (. % 7 + 1), customer: {name: ("Customer " + tostring), city: "Brno"}, status: "paid"}]' > data/orders.json
cat > tools-output.txt <<'EOF'
$ qsm-setup tools --json   (summarised)
qsm-usage    installed   verbs: count, toon encode, toon size, filter, report
qsm-web      installed   verbs: opensrc get, searxng search
qsm-index    missing     install: qsm-setup install qsm-index
qsm-forge    installed   verbs: gh, gl

$ qsm-toolbox doctor --json   (summarised)
ast-grep     missing     install: cargo install ast-grep
jq           present
EOF
n=0
# call <session> <tool name> <input json>
call() {
  n=$((n + 1))
  jq -cn --arg id "t$n" --arg tool "$2" --argjson input "$3" \
    '{type:"assistant",message:{role:"assistant",content:[{type:"tool_use",id:$id,name:$tool,input:$input}]}}' >> "$P/$1.jsonl"
}
for s in s1 s2 s3 s4; do
  jq -cn '{type:"user",message:{role:"user",content:"work on the order totals"}}' > "$P/$s.jsonl"
done
call s1 Bash '{"command":"cat data/orders.json"}'
call s2 Bash '{"command":"cat data/orders.json"}'
call s3 Bash '{"command":"cat data/orders.json"}'
call s4 Bash '{"command":"cat data/orders.json"}'
call s1 Bash '{"command":"grep -rn \"parseTotal\" src"}'
call s1 Bash '{"command":"grep -rn \"parseTotal(\" src --include=*.ts"}'
call s2 Bash '{"command":"grep -rn \"calcTax\" src"}'
call s3 Bash '{"command":"grep -rln \"calcTax\" src"}'
call s4 Bash '{"command":"grep -rn \"formatMoney\" src"}'
call s2 WebFetch '{"url":"https://docs.example.com/api/invoices","prompt":"the pagination section"}'
