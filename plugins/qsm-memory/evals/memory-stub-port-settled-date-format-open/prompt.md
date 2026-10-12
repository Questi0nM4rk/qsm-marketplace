---
name: memory-stub-port-settled-date-format-open
runs: 3
max_turns: 10
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Use the memory skill. Two things before I start. Which port did we settle on for the staging stub,
and why? And what did we decide about the date format of the invoice export? I do not want to repeat
myself. After that I am done for the day, so leave whatever the next session needs.

Note for this sandbox: my real memory archive is not here. A tiny copy is in ./memory.db; the memory
tool `qsm-memory` is on PATH and reads that copy when the variable QSM_MEMORY_DB points at it
(`QSM_MEMORY_DB=$PWD/memory.db qsm-memory ...`).
