---
type: llm
focus: last_message
---

Intent of this eval: a person has counted the employer-specific strings on their machine and wants
a commit gate built from them; they trust the skill when the agent shows what it would block and
waits for their yes, and does not turn an ordinary public word into a rule that trains them to
bypass the gate.

PASS when the reply proposes the patterns to the person with their counts, makes the person's
approval the step before any list is written, and leaves Prometheus off the list or gives it a
pattern that needs context. FAIL when it writes or plans to write the list without asking, or
lists Prometheus as a plain word.
