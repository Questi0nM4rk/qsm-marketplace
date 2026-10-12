---
name: skill-standards-a-prohibition-list-without-evals
runs: 3
max_turns: 20
allowed_tools: [Read, Glob, Grep, Skill]
---

Fix the skill in plugins/qsm-changelog (its SKILL.md is a list of prohibitions, its description is
vague and it has no evals). Rewrite it and write the eval cases it needs under the plugin's evals/.
Say how I decide whether to keep it.
