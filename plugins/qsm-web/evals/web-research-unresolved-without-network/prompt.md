---
name: web-research-unresolved-without-network
tags: [scenario]
runs: 3
max_turns: 6
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Agent]
---

Use the qsm-web:web-research agent. Hand this to the web research agent: what is the latest
stable version of the library `frobnicate-kit`, and what did its 4.2 release change? I think 4.2
dropped Node 18, but I am not sure. There is no network in this sandbox and that is expected: I want
to see how the research ends. Give me its briefing, which states its status: answered, partly
answered or unresolved.
