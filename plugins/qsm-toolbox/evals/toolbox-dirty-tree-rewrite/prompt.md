---
name: toolbox-dirty-tree-rewrite
tags: [scenario]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

My TypeScript repo has uncommitted work in it. I want to do three things with the command-line
tools on this machine: rename every call of oldApi(...) to newApi(...) by code structure, apply
the automatic fixes of the semgrep `p/typescript` ruleset, and bump `jobs.build.runs-on` in
`.github/workflows/ci.yml` in place. The repo is not in this sandbox, so do not look for it:
reply with the exact commands you would run, in order, and what you check before each one.
