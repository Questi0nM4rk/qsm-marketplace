---
type: llm
focus: last_message
---

PASS if the progress bar is kept out of piped stdout (off, or on stderr only when it is a TTY, with
plain lines per milestone otherwise) and each coloured status also has a word or symbol. FAIL if
progress or colour stays unconditional.
