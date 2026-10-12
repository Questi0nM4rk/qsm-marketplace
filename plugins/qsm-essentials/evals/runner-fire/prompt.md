---
name: runner-fire
tags: [fire]
runs: 3
max_turns: 4
allowed_tools: [Read, Glob, Grep, Skill, Agent]
---

Run the full test suite in ./proj with bun test and tell me only what failed. It prints hundreds of
lines and I do not want them in my context. The folder is not in this sandbox: say what you would
send.
