---
name: ui-audit-why-it-looks-off
tags: [scenario]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Use the ui-audit skill.

My desktop shell looks off and I cannot say why. It is a Quickshell bar along the bottom with an
active-workspace pill on it, and a notification card in a right-hand column. The app is not in this
sandbox and there is no screenshot file, so here is what I have: a description, and the numbers the
region-stats tool printed on the running shell.

Region stats, top colour of a rect of each role (it covers over half the pixels), as OKLCH hue in
degrees, OKLCH chroma, and lightness in percent:

- band (the bar): #1A1226, hue 301.4, chroma 0.040, lightness 20.3%
- card: #262038, hue 294.6, chroma 0.045, lightness 26.2%
- accent pill: #B9A0E0, hue 302.1, chroma 0.094, lightness 75.0%

To my eye the band, the card and the pill are all violet. Why does this look off? Answer with
Approach:, Flow: and Next step:, and put the findings in a table with three columns: the finding,
its number, and what it means.
