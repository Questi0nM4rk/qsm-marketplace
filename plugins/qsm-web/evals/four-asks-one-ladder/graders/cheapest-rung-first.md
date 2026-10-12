---
type: llm
focus: last_message
---

Grade asks 1 and 2 only; asks 3 and 4 are graded elsewhere.
PASS if ask 1 starts at the Context7 library docs for the pinned Zod version (read from the
lockfile or manifest), not at a web search or a browser, and ask 2 starts at a searxng search
(WebSearch only when searxng fails) and plans at least one more search round with sharper keywords
before settling on a page.
FAIL if ask 1 or ask 2 starts with the browser, if ask 1 is answered from memory, or if ask 2
settles on the first search result with no further round.
