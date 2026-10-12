---
type: llm
focus: last_message
---

PASS if the reply says a non-empty NO_COLOR turns colour off even with FORCE_COLOR set, an empty
NO_COLOR is ignored, FORCE_COLOR turns colour on for a non-TTY, and otherwise colour is on only for
a TTY. FAIL if FORCE_COLOR beats NO_COLOR or an empty NO_COLOR disables colour.
