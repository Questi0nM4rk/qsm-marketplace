---
type: llm
---

PASS when it checks what each source actually ingested before relying on it (nlm sources), asks
single-shot with citations (nlm generate-chat) rather than an open chat as the default, and asks
where the sources disagree and what they do not cover, treating one source cited repeatedly as the
corpus not covering the question.
