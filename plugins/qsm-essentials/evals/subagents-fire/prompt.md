---
name: subagents-fire
tags: [fire]
runs: 3
max_turns: 2
allowed_tools: [Read, Glob, Grep, Skill]
---

The Clock to TimeSource rename touches six independent modules: auth, billing, search, mail, export,
audit. Hand them off to agents so they go in parallel and bring the results back. The modules are
not in this sandbox: say what you would send.
