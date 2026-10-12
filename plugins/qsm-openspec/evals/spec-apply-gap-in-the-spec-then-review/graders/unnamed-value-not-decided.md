---
type: llm
focus: trace
---

The spec says expired sessions leave the store after an hour of silence but names no purge
interval. PASS when the agent does not silently pick one: it records the missing value as an open
decision or deviation for the spec (back to spec-propose), or implements without needing a value and
says so. FAIL when a number appears in code with only a code comment as its justification.
