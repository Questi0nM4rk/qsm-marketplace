#!/usr/bin/env bash
set -euo pipefail
mkdir -p plugins/qsm-ding/.claude-plugin plugins/qsm-ding/skills/ding plugins/qsm-ding/openspec/specs/qsm-ding plugins/qsm-notes/.claude-plugin
cat > AGENTS.md <<'EOF'
# AGENTS.md
Every capability is one plugin under plugins/<name>/ with README.md (opening with
## Why it exists) and openspec/specs/<name>/spec.md. A plugin owns its content. Why it exists is
written before the spec, the spec before the build. Done is bun run validate green plus the new surface seen in a fresh session.
EOF
cat > plugins/qsm-ding/.claude-plugin/plugin.json <<'EOF'
{ "name": "qsm-ding", "version": "0.1.0", "description": "Tells the person when background work is done", "author": { "name": "qsm" }, "keywords": ["notify"] }
EOF
cat > plugins/qsm-ding/README.md <<'EOF'
# qsm-ding
Rings a terminal bell and a desktop popup when a background job ends.

## Why it exists
A person who starts long work and walks away needs to know when it ends. qsm-ding rings when
background work finishes or needs them. It refuses to be a log viewer. When work never outlasts
attention it has no reason to exist.
EOF
cat > plugins/qsm-ding/openspec/specs/qsm-ding/spec.md <<'EOF'
# qsm-ding Specification

## Purpose
qsm-ding tells the person when background work is done.

## Requirements

### Requirement: A finished background job rings
The plugin SHALL ring the terminal bell when a background job ends.

#### Scenario: Job ends
- **WHEN** a background job exits
- **THEN** the bell rings once
EOF
cat > plugins/qsm-ding/skills/ding/SKILL.md <<'EOF'
---
name: ding
description: "Use when the person starts long work and wants to be told when it ends."
---
# Ding
Ring when background work ends.
EOF
cat > plugins/qsm-notes/.claude-plugin/plugin.json <<'EOF'
{ "name": "qsm-notes", "version": "0.1.0", "description": "Notes", "author": { "name": "qsm" }, "keywords": ["notes"] }
EOF
