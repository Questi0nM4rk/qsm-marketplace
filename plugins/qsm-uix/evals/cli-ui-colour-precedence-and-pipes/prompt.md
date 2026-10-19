---
name: cli-ui-colour-precedence-and-pipes
tags: [scenario]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

My CLI (TypeScript on Bun) prints coloured status lines and a progress bar, and people pipe it into
files where it is garbage. We set FORCE_COLOR=1 in CI so logs keep colour, and one teammate has
NO_COLOR=1 exported in his shell, another has an empty NO_COLOR=. Tell me how the output must behave
in each case and what to change. The code is not in this sandbox.
