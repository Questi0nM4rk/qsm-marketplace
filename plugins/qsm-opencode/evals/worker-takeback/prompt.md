---
name: worker-takeback
tags: [scenario]
runs: 3
max_turns: 4
allowed_tools: [Read, Skill]
---

Use the driving-opencode skill if available. This sandbox has no OpenCode, git or tmux, so
describe the plan without executing it.

I want an OpenCode V2 implementation worker I can watch, using a model I will choose. Another
OpenCode session is already running on unrelated work. Our worker will change a CLI in its own
workspace. It later exits 0 and says “done”, but its named acceptance check fails. Give the
handoff, the exact continuation route and your take-back verdict.

Reply with Approach:, Flow:, Next step: and Report:.
