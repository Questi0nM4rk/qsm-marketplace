---
name: add-lib-fire
tags: [fire]
runs: 3
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Two plugins here both wrote their own function that writes a file through a tmp file and a
rename. I want one shared helper in lib/ for it. What do I need to do before and after adding it?
