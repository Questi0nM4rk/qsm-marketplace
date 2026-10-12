---
type: llm
focus: trace
---

PASS when every task bound to the change (the refund task and the feedback task, both carrying the
openspec:add-refund-limit reference) is closed with a reason naming the work, while the epic they
belong to stays open because its test-it task is still open and the push after review is not
confirmed, and the reply names what the epic waits for. The other epic and its open child are
left alone. The trace shows the closes.
