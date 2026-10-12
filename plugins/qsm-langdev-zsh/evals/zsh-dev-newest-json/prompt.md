---
name: zsh-dev-newest-json
tags: [scenario]
runs: 3
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Write ~/bin/newest-json, a zsh script that prints the newest *.json file in a directory given as
$1 and then the current epoch seconds, and exits non-zero on any failure. Put a helper function
in it too. Also tell me what to put in my .zshrc so compinit does not slow down scripts. The
files are not in this sandbox, so do not look for them: reply with the exact script and the
.zshrc lines.
