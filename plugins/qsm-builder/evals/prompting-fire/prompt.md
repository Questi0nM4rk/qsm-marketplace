---
name: prompting-fire
tags: [fire]
runs: 3
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Review this system prompt for my deploy agent and tell me what to change: "You are a deploy bot.
NEVER deploy on Fridays. NEVER touch the prod database. ALWAYS ask before anything. Be careful."
