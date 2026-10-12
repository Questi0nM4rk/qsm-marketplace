---
name: writing-bypassed-hook-fix-and-rename
tags: [scenario]
runs: 3
max_turns: 2
allowed_tools: [Skill]
---

Use the writing skill. Answer the way you would a hard interview question. There is no repository
here; answer from what I tell you and write the texts as you would hand them over.

I fixed the login loop: an expired refresh token made the app retry forever, so it now refreshes the
token before it expires (auth/session.ts, auth/refresh.ts). While in session.ts I also renamed the
variable `tok` to `token` across the file, no behaviour change. The pre-commit lint hook failed on 3
old warnings in legacy/ that I did not touch, so I committed with --no-verify. Ticket AUTH-412.
Staging check: log in, wait past the token lifetime, the next request succeeds without a second
login.

Reply in this shape:

```text
Approach: <who reads each text, what they do after, what they must not miss>
Commits: <every commit you would make, each message in full>
MR: <title and description>
```
