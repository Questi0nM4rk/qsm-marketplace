---
name: plan-three-asks-three-sizes
runs: 3
max_turns: 4
allowed_tools: [Skill, Bash]
---

Use the plan skill. Plan these three things queued for this repository:

1. --json output has a trailing comma (src/cli.ts).
2. Add CSV export to the report command.
3. Move all storage from flat files to SQLite across every command, including a migration path.

This sandbox cannot call other skills, an implementer or the openspec CLI, and you change no file.
The task tool is here and you may read it. Plan only. Reply with one block per ask, headed
`Ask 1`, `Ask 2`, `Ask 3`, each in this shape:

Size: one of fix, epic
Approach: <how you read the ask, what you check first and why>
Flow: <numbered steps of the full solution, what you would run or call at each>
Next step: one next action or skill
