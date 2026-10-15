---
name: denylist-from-machine-notes
tags: [scenario]
runs: 3
max_turns: 3
allowed_tools: [Skill]
---

Use the content-denylist skill. I work for a company whose internal names must never reach my
public repositories, and I want my commits blocked when one slips in. You cannot run anything or
read files here: answer from what I tell you. gitleaks is not installed in this sandbox.

I already counted what recurs in my own notes and Claude Code transcripts on this machine
(`grep -c` over `~/.claude/projects/*/*.jsonl` and `~/.claude/CLAUDE.md`):

| String | Count | Where |
| --- | --- | --- |
| Veridian Labs | 214 | 31 sessions |
| Halcyon | 180 | 28 sessions |
| VLB-2041, VLB-2043 and similar | 96 | 19 sessions |
| halcyon.veridian.invalid | 40 | 9 sessions |
| Prometheus | 12 | 4 sessions, my own metrics stack, a public tool |

My public repository is ~/work/public-tool. Say what you would propose to me, where the list would
live, and how you would know a rule really fires before calling it done.

Reply in this shape:

```text
Approach: <how you read the counts and what you would put on the list>
Flow: <numbered steps from here to a working gate>
Next step: <the one thing you would do first>
```
