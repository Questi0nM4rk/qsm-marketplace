---
name: redis-cache-decision
runs: 3
max_turns: 14
allowed_tools: [Read, Glob, Grep, Agent]
---

My qsm-memory session archive for this exercise is ./memory.db: run qsm-memory with
QSM_MEMORY_DB=./memory.db in front of it, from this directory. Question: does billing-api still
keep a Redis cache in front of the invoice totals, since when and why did that change, and who
approved the change? Answer from the archive and show, for every claim, where in the archive it
comes from.
