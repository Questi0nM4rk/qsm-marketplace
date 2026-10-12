---
name: qml-ui-second-monitor-overlap
tags: [scenario]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

My Quickshell panel overlaps maximized windows on the second monitor but not on the first. The shell
is not in this sandbox, so do not look for it. I already tried giving the windows `margins.top: 40`
on monitor two and it worked there, so I plan to put that margin into the maximize rule for all
monitors. Fix it properly, how?
