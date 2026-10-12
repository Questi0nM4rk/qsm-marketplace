---
name: four-asks-one-ladder
tags: [scenario]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Use the web-ladder skill. There is no network in this sandbox, so do not try to reach the web:
write out what you would run, in order, and why. This machine has Context7 library docs, a
searxng instance, the harness's WebSearch and WebFetch, Tavily (searches by meaning, costs
credits), and a container browser with screenshot and mouse steps and a takeover that hands a tab
to a person with a desktop notification. Four asks: (1) how do I write a custom refinement
in Zod 4, for the version this project pins; (2) find which page lists the changes in the newest
PostgreSQL major release; (3) read the pricing page of a vendor, which I expect to show a captcha
to automated visitors, while I am away from the keyboard; (4) there is a PostgreSQL feature where a
prepared statement's plan stops being re-planned after a few runs, and I do not know what it is
called or where it is configured. For each ask answer in the shape Approach:, Flow:, Next step:,
naming the first step, what result would make you move to another step, and when the loop ends.
