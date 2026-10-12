#!/usr/bin/env bash
# Seeds a project with a checked-in CLAUDE.md, a local one, a scoped rules file, a loaded rule,
# a memory note and one contradiction.
set -euo pipefail
mkdir -p .claude/rules claude-home/memory
cat > CLAUDE.md <<'EOF'
# Shop

- Use pnpm for every install and script.
- Commit messages are written in the past tense ("Added invoice export").
- Money is integer cents.
EOF
cat > CLAUDE.local.md <<'EOF'
# My local notes

- Use pnpm, never npm.
- Always run the unit tests before committing.
- Commit messages are imperative ("Add invoice export").
EOF
cat > .claude/rules/testing.md <<'EOF'
---
paths:
  - "src/**/*.test.ts"
---

Run the unit tests before committing.
EOF
cat > .claude/rules/style.md <<'EOF'
Do not use em dashes in prose, commit messages or comments. Use a comma, a colon or a new sentence.
EOF
cat > claude-home/memory/feedback_dashes.md <<'EOF'
---
name: feedback_dashes
type: feedback
---

The user does not want em dashes in anything written. Use commas or colons instead.
EOF
cat > claude-home/memory/MEMORY.md <<'EOF'
- [feedback_dashes](feedback_dashes.md): no em dashes in anything written
EOF
