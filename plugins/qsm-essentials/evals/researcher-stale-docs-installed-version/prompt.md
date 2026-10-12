---
name: researcher-stale-docs-installed-version
runs: 3
max_turns: 6
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Agent]
---

Use the qsm-essentials:researcher agent. Hand this to the researcher agent: in ./project, how many
times does `retry-kit`'s `fetchWithRetry` retry by default, and how does it back off? I want file
and line for each claim. Have it write its notes to ./notes/retry.md and give me its briefing.
