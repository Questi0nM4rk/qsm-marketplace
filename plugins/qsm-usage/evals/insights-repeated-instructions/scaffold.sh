#!/usr/bin/env bash
# Seeds six short transcripts in which some standing instructions repeat and some do not.
set -euo pipefail
P=claude-home/projects/-home-dev-shop
mkdir -p "$P"
cat > CLAUDE.md <<'EOF'
# Shop

- Run the tests before saying a change works.
- Money is integer cents.
EOF

# u <session> <text>: a user turn; a <session> <text>: an assistant turn
u() { jq -cn --arg t "$2" '{type:"user",message:{role:"user",content:$t}}' >> "$P/$1.jsonl"; }
a() { jq -cn --arg t "$2" '{type:"assistant",message:{role:"assistant",content:[{type:"text",text:$t}]}}' >> "$P/$1.jsonl"; }

u s1 "add csv export to the invoice list"
a s1 "Done, I ran npm install csv-stringify and added the export."
u s1 "use bun, not npm, in this repo. perfect otherwise, thanks"
a s1 "Switched to bun add."

u s2 "the totals test fails after the tax change"
a s2 "I changed tax.ts and committed it."
u s2 "run the tests before you say it works, and show me the diff before committing"
a s2 "Understood, here is the diff."

u s3 "add a customers endpoint"
a s3 "Added it with npm run build."
u s3 "bun, not npm. how many times"
a s3 "Sorry, using bun."

u s4 "why is the migration slow"
a s4 "It is the missing index."
u s4 "run the tests before you tell me it works"
a s4 "Running them now."

u s5 "scaffold a settings page"
a s5 "Created the page and ran npm test."
u s5 "we use bun here. also split this into two tasks, you mixed the page and the api"
a s5 "Splitting."

u s6 "write release notes"
a s6 "Here they are, with emoji for each section."
u s6 "no emoji please. and show me the diff before committing next time"
a s6 "Removed the emoji."
