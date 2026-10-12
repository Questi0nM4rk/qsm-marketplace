---
name: review-spec-gaps-hidden-in-a-small-diff
runs: 3
max_turns: 14
allowed_tools: [Read, Glob, Grep, Skill, Agent]
---

Review my change before I open the pull request. This sandbox has no git, so the change is the
file change.diff and what it was meant to do is ISSUE.md. Give me your verdict, the findings, and
say what happens with them next.
