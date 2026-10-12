---
type: llm
---

Intent of this eval: a person's import call takes nine arguments and every caller pays for it; the
design is trusted when the caller writes less, with defaults pulled inside, and not when the same
nine arguments are only moved into one object.

PASS when it compares two interfaces by what the caller writes and picks the one with the shorter
call site: the nine arguments are not wrapped in an options object but pulled inside with defaults
(delimiter and encoding detected or defaulted, header handling decided once), and a knob stays only
where a real caller needs another value. It may keep a small number of named options. FAIL when
the signature is kept, or the same nine arguments only move into one object.
