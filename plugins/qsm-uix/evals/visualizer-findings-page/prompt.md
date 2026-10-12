---
name: visualizer-findings-page
tags: [scenario]
runs: 3
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill, Agent]
---

Render these audit findings as a page I can sort and filter. Do not paste them back into the chat.

id,severity,owner,file,summary
F1,blocker,ana,src/bar.qml,popup under dock on monitor 2
F2,major,ana,src/theme.qml,separator vanishes in dark
F3,major,ben,src/tray.qml,close button 14 px
F4,minor,ben,src/tray.qml,two hover styles
F5,polish,cy,src/clock.qml,baseline off by 2 px
