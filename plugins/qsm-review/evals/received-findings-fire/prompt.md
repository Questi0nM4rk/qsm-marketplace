---
name: received-findings-fire
tags: [fire]
runs: 3
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

A reviewer left comments on my pull request and I am about to address them. Load whatever guidance
applies, then tell me in the reply how you would handle a batch of findings: what you do before you
change any code, and what you answer when a finding is wrong.
