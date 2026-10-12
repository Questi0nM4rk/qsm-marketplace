---
name: shell-dev-fire
tags: [fire]
runs: 3
max_turns: 2
allowed_tools: [Skill]
---

Write a bash script that reads lines from a command, collects the ones containing ERROR into an
array, prints the count, and cleans up its temp file when it exits.
