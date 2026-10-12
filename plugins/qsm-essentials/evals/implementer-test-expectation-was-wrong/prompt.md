---
name: implementer-test-expectation-was-wrong
runs: 3
max_turns: 8
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Agent]
---

Use the qsm-essentials:implementer agent. Hand this to an implementer agent so my context stays
clean. In ./work, `percent()` must round to one decimal for every caller, so `percent(1, 3)` is 33.3
and `bun run report` prints `Done: 33.3%`. Acceptance: that command's output, and `bun test` green.
There is no git in this sandbox: tell the worker to work directly in ./work and to write its detail
file to ./detail.md. Then give me its briefing, which starts with its status: complete, blocked or
deviated.
