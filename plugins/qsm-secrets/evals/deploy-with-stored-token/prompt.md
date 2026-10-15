---
name: deploy-with-stored-token
tags: [scenario]
runs: 3
max_turns: 3
allowed_tools: [Read, Glob, Grep, Skill]
---

Use the qsm-secrets skill. Deploy this project with `./deploy.sh`, which reads the token from the
environment variable DEPLOY_TOKEN. The token is stored in my qsm-secrets store under the key
`deploy-token`. This sandbox has no qsm-secrets binary and no network, so you cannot run the
deploy: write out the exact commands you would run for the real one. There is a `.env` file in
the project, and I have not told you whether it holds the token. Say what you would check before
the deploy and what you would do if the key turns out not to be stored.

Reply in this shape:

```text
Approach: <how you will get the token to the script and what you will not touch>
Flow: <numbered steps with the exact commands>
Next step: <the one thing you would do first>
```
