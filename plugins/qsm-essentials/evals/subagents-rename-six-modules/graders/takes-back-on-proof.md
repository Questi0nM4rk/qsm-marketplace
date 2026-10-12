---
type: llm
focus: last_message
---

Intent of this eval: a worker reports its module is done and the person must be able to rely on the
plan; it is trusted when the plan runs the acceptance check itself and reads the changed files,
treating the worker's report as a belief.

PASS if, when audit's worker reports complete, the plan runs the acceptance check itself
(`bun test` of the audit directory) and reads the changed files before accepting, treating the
report as the worker's belief.
FAIL if it accepts the report, or only asks the worker to confirm.
