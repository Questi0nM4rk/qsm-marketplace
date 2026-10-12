---
name: software-design-fire
tags: [fire]
runs: 3
max_turns: 2
allowed_tools: [Read, Glob, Grep, Skill]
---

I have a PaymentService class with 14 public methods and a 9-parameter constructor, and most of
the methods just forward to another class. Is this abstraction right, and how would you reshape
it?
