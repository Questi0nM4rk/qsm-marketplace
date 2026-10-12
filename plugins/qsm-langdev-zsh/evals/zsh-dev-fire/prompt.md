---
name: zsh-dev-fire
tags: [fire]
runs: 3
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Write a zsh script that prints the newest *.json file in the directory given as $1. The file is
not in this sandbox, so do not look for it: reply with the exact script.
