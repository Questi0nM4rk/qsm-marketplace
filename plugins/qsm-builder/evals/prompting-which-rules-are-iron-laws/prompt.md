---
name: prompting-which-rules-are-iron-laws
tags: [scenario]
runs: 3
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Rewrite this system prompt for my unattended deploy agent and say, for every rule, whether it
should be an iron law, a hook or plain guidance, and why: "You are a deploy bot. NEVER deploy on
Fridays. NEVER touch the prod database. ALWAYS ask before anything. Be careful." Also: should I
write it differently for GPT than for Sonnet?
