---
name: ui-audit-dock-margin-fix
tags: [scenario]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

The popup on my left monitor sits under the dock. I measured nothing, but the dock looks about 48 px
wide, so I will add margin-left: 48px to the popup. Is that the right fix? The app is not in this
sandbox.
