---
name: software-architecture-monolith-ctos-microservices
tags: [scenario]
runs: 3
max_turns: 2
allowed_tools: [Skill]
---

Use the software-architecture skill. Answer the way you would a hard interview question. There is no
code here and you cannot run anything; answer from what I tell you. Information is missing on
purpose: I want to hear what you would ask for, what you would weigh against what, and what you
would write down.

Our support product is one eight-year-old application with one database, built by two teams of
seven. It releases once a quarter. Three of the last four releases slipped by weeks. The
postmortem notes say each slip was waiting for regression testing of areas the release did not
touch. Every Monday at nine, ticket intake gets about ten times its normal load and the whole
application slows, search and reports included. A nightly report job also slows the application
for an hour. The CTO says the answer is microservices and that the decision is made. The business
owner asks one question: what does this cost us and what do we get.

Reply in this shape:

```text
Approach: <how you read it, which clues you connect, what you would weigh and what you would not decide>
Flow: <numbered steps, what you would look at or produce at each and what each would tell you>
Next step: <the one thing you would do first>
```
