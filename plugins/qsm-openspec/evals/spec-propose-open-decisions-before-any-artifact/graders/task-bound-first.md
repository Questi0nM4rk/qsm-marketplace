---
type: llm
focus: trace
---

PASS when no task is created in the task store while the spec is still blocked on open decisions
(a task comes with its spec, never before), and the reply says the task will be created, with the
external reference openspec: followed by the change id, once the spec is written.
