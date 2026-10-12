---
name: seams-excerpt-to-one-document
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

./book.md holds the text of a book, "Seams" by Marta Voss, that I want the agent to work by in
every module design from now on. Turn it into a skill and put it where ./skills/ points. The
qsm-book-to-skill binary is not installed in this sandbox, so produce what it would produce by
hand, and tell me what you wrote, where, and what you left out and why.
