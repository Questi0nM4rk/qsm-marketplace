---
type: llm
focus: trace
---

The ask leaves decisions open that the spec needs (the limit values, what happens at the limit,
how the three instances share a count). PASS when the agent does not write the spec artifacts around
guesses for those, and instead hands the unsettled decisions on as one batch of questions, each with
a recommended answer, while treating what the code answers (clients are identified by API key) as
known and not asking it.
