---
name: readability-reviewer-fire
tags: [fire]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill, Agent]
---

Score the readability of this codebase for a developer seeing it for the first time, out of ten,
with a breakdown. It is small, look at what is in the working directory.
