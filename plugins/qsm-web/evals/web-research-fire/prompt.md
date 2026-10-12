---
name: web-research-fire
tags: [fire]
runs: 3
max_turns: 4
allowed_tools: [Read, Glob, Grep, Skill, Agent]
---

Find out from the web whether the zod library changed the default of z.string().email() between
major versions, with sources. Keep the search noise out of my context. There is no network in this
sandbox: say what you would send.
