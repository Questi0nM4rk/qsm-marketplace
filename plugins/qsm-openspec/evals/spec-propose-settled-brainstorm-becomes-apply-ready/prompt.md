---
name: spec-propose-settled-brainstorm-becomes-apply-ready
runs: 3
max_turns: 22
allowed_tools: [Read, Glob, Grep, Skill]
---

The brainstorm is finished; these decisions are settled, do not reopen them:

- the report command gets --csv; stdout only, one header row name,total, one row per entry;
- fields containing a comma or a quote are quoted RFC 4180 style;
- an empty report prints the header row only and exits 0;
- the existing text format stays the default and does not change.

Make this change apply-ready as a spec. The openspec CLI is not in this sandbox, so write the files
by hand in the layout it uses under openspec/changes/csv-export/ (proposal, design, delta spec under
specs/report/spec.md, tasks). The repository task store is initialised here. Then tell me the
next step.
