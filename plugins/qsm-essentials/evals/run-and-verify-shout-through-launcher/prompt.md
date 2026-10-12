---
name: run-and-verify-shout-through-launcher
runs: 3
max_turns: 12
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Use the run-and-verify skill. In ./app, add a --shout flag to the greeting CLI so that it prints the
greeting in capitals. Tell me when it works.
