#!/usr/bin/env bash
# A stand-in for the person's machine: a home with instruction files and a session log, and a public repo.
mkdir -p machine/.claude/projects/p1 machine/.config machine/work/public-tool/src
cat > machine/.claude/CLAUDE.md <<'MD'
# Notes
I work at Veridian Labs on the Halcyon billing platform. Tickets are VLB-2041 style.
Prefer small commits. Prometheus is our metrics stack (public tool, fine to mention).
MD
for n in 1 2 3 4 5 6; do
  printf '{"role":"user","text":"fix VLB-20%d in Halcyon, deploy to halcyon.veridian.invalid"}\n' "$n"
done > machine/.claude/projects/p1/session1.jsonl
printf '{"role":"user","text":"the Prometheus alert rule for Halcyon fires too often"}\n' >> machine/.claude/projects/p1/session1.jsonl
printf 'export function add(a: number, b: number) { return a + b; }\n' > machine/work/public-tool/src/add.ts
printf '# public-tool\n\nA small public helper.\n' > machine/work/public-tool/README.md
