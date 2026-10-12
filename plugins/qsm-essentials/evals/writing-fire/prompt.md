---
name: writing-fire
tags: [fire]
runs: 3
max_turns: 2
allowed_tools: [Read, Glob, Grep, Skill]
---

Write the commit message for this change: I fixed the login loop where an expired refresh token made
the app retry forever, by refreshing the token before it expires. Touched auth/session.ts and
auth/refresh.ts.
