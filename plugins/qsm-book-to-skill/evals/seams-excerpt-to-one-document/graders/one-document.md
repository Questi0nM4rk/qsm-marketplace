---
type: llm
focus: trace
---

PASS if the agent wrote exactly one skill document (one SKILL.md with frontmatter whose
description says when to use it) and no per-chapter or per-topic files beside it, and the document
contains no reference to the book's inner structure: no chapter or page numbers, no "see chapter",
no "as the book says in". The book and its author may appear as the source, by name. FAIL
otherwise.
