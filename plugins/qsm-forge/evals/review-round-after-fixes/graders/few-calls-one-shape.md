---
type: llm
focus: trace
---

PASS if the planned commands use the qsm-forge gh verbs (threads, reply, resolve, resolve-all,
status) and no raw gh api, graphql query or curl, and the whole round is planned in a handful of
calls without a hand-made lookup of thread ids from comment ids. FAIL otherwise.
