---
name: implementer-fire
tags: [fire]
runs: 3
max_turns: 4
allowed_tools: [Read, Glob, Grep, Skill, Agent]
---

Here is a bounded task with a clear check, no design decision left: make the --upper flag of
./work/cli.ts print the greeting in capitals, proven by running `bun work/cli.ts --upper Ada`. Hand
it to a worker so my context stays clean. The folder is not in this sandbox: say what you would
send.
