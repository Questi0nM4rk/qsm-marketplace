---
name: denylist-from-machine-notes
runs: 3
max_turns: 14
allowed_tools: [Read, Glob, Grep, Skill]
---

./machine is my home directory for this exercise (its .config is my config dir) and
./machine/work/public-tool is a public repository of mine. I work for a company whose internal
names must never reach public repos. Set up the block for my commits from what I have written in
./machine, and tell me what you looked at, what you propose, and what you would check before
saying it works. gitleaks is not installed in this sandbox.
