---
name: spec-apply-gap-in-the-spec-then-review
runs: 3
max_turns: 22
allowed_tools: [Read, Glob, Grep, Skill]
---

Apply the change in openspec/changes/session-expiry. The openspec CLI, the implementer and the
review skill are not reachable from this sandbox: work from the files, run the code with bun test,
and tick tasks.md as tasks land. When you stop, tell me the state and what happens next.
