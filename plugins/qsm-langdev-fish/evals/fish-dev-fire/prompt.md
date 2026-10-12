---
name: fish-dev-fire
tags: [fire]
runs: 3
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Add ~/.local/bin to my PATH in fish, and make a function `rotate` that lists the *.log files in a
directory and returns 1 if there are none. The config is not in this sandbox, so do not look for
it: reply with each file path and its exact contents.
