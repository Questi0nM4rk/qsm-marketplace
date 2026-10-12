---
name: refactoring-fire
tags: [fire]
runs: 3
max_turns: 2
allowed_tools: [Read, Glob, Grep, Skill]
---

This 800-line OrderProcessor.cs has no tests and I need to add a discount rule inside it. It is a
mess, and I also want to rename its public Process method. How should I go about it?
