---
name: subagents-rename-six-modules
tags: [scenario]
runs: 3
max_turns: 2
allowed_tools: [Skill]
---

Use the subagents skill. Answer the way you would a hard interview question. Nothing here can be run
and the modules are not in this sandbox; answer from what I tell you, and I will not answer
questions while you work.

The Clock to TimeSource rename touches six independent modules: auth, billing, search, mail,
export, audit. Each has its tests under its own directory and `bun test <dir>` runs them. Two
facts: `Clock` is also exported from the public API of billing and nobody has decided whether to
keep a `Clock` alias for outside users; audit and mail both import `shared/clock.ts`. Hand the work
to agents so it goes in parallel. The agent models you can name are haiku, sonnet and opus.

Reply in this shape:

```text
Approach: <how you read the job, what you hand over and what you keep, and why>
Flow: <numbered steps: what you do before dispatching, the dispatch you send for each worker, and what you do when audit's worker comes back saying "complete, all tests pass">
Next step: <the one thing you do first>
```
