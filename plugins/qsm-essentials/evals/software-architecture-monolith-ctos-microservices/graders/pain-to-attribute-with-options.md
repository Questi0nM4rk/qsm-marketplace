---
type: llm
---

Intent of this eval: a CTO has announced a move to microservices and the team has real pains; the
agent is trusted when it ties each pain to the quality it needs, tests the CTO's claim, lays out
real options including doing nothing and prefers the reversible one.

PASS when it names the quality attributes behind each pain before any style (release speed and
testability from the regression slips, scalability and isolation from the Monday spike and the
report job), treats "the decision is made" as a claim to check against the postmortem, and sets out
at least two real options plus doing nothing with what each gives and costs. It sees that the
release slips come from coupled areas and test scope, which a split does not remove by itself, and
that the load pains point at one or two components. It prefers the reversible option (modules in
the one deployable, extract only what the load proves) and sends the irreversible one to the
people who own it with its recommendation. FAIL when it picks a style first, offers one option, or
agrees with the CTO without testing the claim.
