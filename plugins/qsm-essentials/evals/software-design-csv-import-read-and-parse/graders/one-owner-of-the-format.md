---
type: llm
---

Intent of this eval: a person has a reader class and a parser class that must be called in order;
the agent is trusted when it shows from a quoted multi-line field that they share one piece of
knowledge and gives it one owner, instead of defending one job per class.

PASS when it shows from the clues that reading and parsing cannot be separated: a quoted field
with a line break makes a line reader cut a row in two, and the delimiter and quote rules are
needed by both, so the format knowledge leaks across two classes and the caller must call them in
order. It gives that knowledge one owner (one module that reads rows) and does not accept "one job
per class" as the reason to keep the split. FAIL when it keeps both classes, or keeps the split
and only adds a shared options object.
