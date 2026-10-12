---
type: llm
focus: last_message
---

Intent of this eval: a person asks what earlier sessions decided and does not want to repeat
themselves; the agent is trusted when it says plainly that nothing was settled about the date
format, asks once, and does not present a look-alike hit as the decision.

No session settled the invoice export date format. The archive's only date-like hit is the audit
log's ISO 8601 timestamp, a different thing.
PASS if the reply says no session settled the invoice date format and asks the question once,
naming no format as decided.
FAIL if it states a format as settled (ISO 8601 included) or drops the question.
