#!/usr/bin/env bash
set -euo pipefail
mkdir -p plugins/qsm-changelog/skills/changelog/references plugins/qsm-changelog/.claude-plugin
cat > plugins/qsm-changelog/.claude-plugin/plugin.json <<'EOF'
{ "name": "qsm-changelog", "version": "0.1.0", "description": "Changelog entries", "author": { "name": "qsm" }, "keywords": ["changelog"] }
EOF
cat > plugins/qsm-changelog/skills/changelog/SKILL.md <<'EOF'
---
name: changelog
description: "Helps with changelogs"
---
# Changelog

1. NEVER write entries in past tense.
2. NEVER include commit hashes.
3. NEVER group by author.
4. NEVER skip the date.
5. NEVER use the word "various".
6. NEVER list more than ten entries per release.
7. NEVER put internal refactors in the user-facing section.
8. NEVER forget the version heading.
9. NEVER mix added and fixed entries.
10. NEVER leave an entry without a link to its ticket.
EOF
echo "long background material" > plugins/qsm-changelog/skills/changelog/references/style.md
