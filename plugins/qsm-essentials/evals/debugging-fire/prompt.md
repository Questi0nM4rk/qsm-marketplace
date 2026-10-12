---
name: debugging-fire
tags: [fire]
runs: 3
max_turns: 2
allowed_tools: [Read, Glob, Grep, Skill]
---

Our integration test for the invoice export is flaky: it fails about one run in five on CI and
never on my laptop, and it worked before last week's merge. I have no idea why. What should I do?
