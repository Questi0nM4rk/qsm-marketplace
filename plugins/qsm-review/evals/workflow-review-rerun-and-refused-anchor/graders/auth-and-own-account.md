---
type: llm
---

PASS when the reply checks that the person is authenticated with the forge before the long run,
posts through the person's own forge account with the forge CLI wrapper (qsm-forge gh) and not a
bot, env token or raw API call, and writes the diff to a file instead of pasting it.
