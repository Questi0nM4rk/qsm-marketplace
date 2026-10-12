---
name: domain-modeling-fire
tags: [fire]
runs: 3
max_turns: 2
allowed_tools: [Read, Glob, Grep, Skill]
---

In our insurance system a Customer means the buyer in sales but the payer in billing, and the
Customer class now has 40 fields and everyone edits it. We also have a CountryCode lookup table, and
a rule that a policy cannot be issued until its first premium is paid. How should I model this?
