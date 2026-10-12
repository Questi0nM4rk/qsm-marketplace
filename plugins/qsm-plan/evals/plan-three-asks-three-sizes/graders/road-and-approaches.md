---
type: llm
---

Intent of this eval: a person hands over a one-line bug, a small feature and a huge storage
migration and wants the big one weighed before it is split into tasks; the planner earns trust by
offering a few different approaches with a recommendation first, not by jumping to a split with one
idea.

PASS when, for Ask 3, it puts two or three approaches of different shape with a recommendation to
me before the epic is split. FAIL when Ask 3 goes straight to a split or a spec with
one approach.
