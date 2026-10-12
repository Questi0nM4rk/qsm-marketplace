---
name: bun-dev-fire
tags: [fire]
runs: 3
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

In my Bun project I need to spawn a child process from the HTTP server and stream a big file to
the response. How do I do both with Bun's own APIs?
