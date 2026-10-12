---
name: strict-reviewer-fire
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill, Agent]
---

Do a strict solo review of the change in change.diff in the working directory. Nothing posted,
just tell me whether I can ship it.
