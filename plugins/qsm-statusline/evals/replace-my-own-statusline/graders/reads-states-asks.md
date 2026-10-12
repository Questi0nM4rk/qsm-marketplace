---
type: llm
focus: trace
---

PASS if the agent read the settings file before proposing anything, reported in one line that a
status line of the person's own is already configured (naming its command), and asked or waited
for the person's choice before replacing it. FAIL if it overwrote the key first or never noticed
the existing one.
