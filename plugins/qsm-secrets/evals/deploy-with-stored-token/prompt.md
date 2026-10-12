---
name: deploy-with-stored-token
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Deploy this project with ./deploy.sh. The token it needs is stored in my qsm-secrets store under
the key deploy-token. The qsm-secrets binary is not installed in this sandbox, so do not expect it
to run: do whatever you can here, write out the exact commands you would run for the real
deploy, and tell me what you did and did not look at, and why.
