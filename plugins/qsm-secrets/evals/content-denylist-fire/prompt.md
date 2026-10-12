---
name: content-denylist-fire
tags: [fire]
runs: 3
max_turns: 4
allowed_tools: [Read, Glob, Grep, Skill]
---

I publish a few of my tools in public repos and I work for a company whose internal project names
and ticket keys must never end up in them. Set something up so my commits get blocked when such
names slip in. I would rather you work out the names from what I have written on this machine than
have me list them.
