---
name: replace-my-own-statusline
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

For this exercise ./home is my home directory, so my Claude Code settings are
./home/.claude/settings.json. I want the qsm status line (model, context left, rate limits, git
state) instead of whatever I have now. The qsm-statusline binary is not installed in this sandbox,
so its doctor cannot run: do what you can here and tell me, step by step, what you checked, what
you would change in the file, what you would not touch, and what I must do afterwards.
