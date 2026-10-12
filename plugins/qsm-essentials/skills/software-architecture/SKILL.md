---
name: software-architecture
description: "Use when choosing an architecture style, weighing quality attributes, recording an architecture decision, judging whether a system can evolve, or explaining a technical decision to non-engineers. Triggers: which architecture, monolith or microservices, trade-off analysis, quality attributes, write an ADR, fitness function, technical debt, is this architecture right, explain this to the business. Where a service boundary falls is distributed-systems."
---

# Software architecture

The person must defend a technical choice to engineers and to the business, and a choice nobody
wrote down gets argued again. This skill makes the trade-off visible, the choice deliberate, and the
reason recorded. It does not draw the boxes and does not decide what the user has not decided.

## Decide

- Name the two or three quality attributes that matter here first, then the style. A style named
  first is a fashion.
- Give at least two real options plus doing nothing, each with what it gives, what it costs and what
  kills it. One option is a default, and defaults hide the dear mistakes.
- Prefer the reversible option. One that cannot be undone goes to the user with your recommendation,
  because it is his decision.
- Start with one deployable and clear modules. Split into services only when the boundary passes the
  distributed-systems checks, and say which.

## Record

- Write an ADR for every decision that is expensive to change: context, options with the rejected
  ones, decision, cost accepted, date. One page, next to the code. The what is in the code, so the
  ADR holds the why.
- End it with the assumption that reopens the decision ("one database because one team, revisit at
  three teams"), because that turns the decision into a tripwire.
- A changed decision gets a new ADR that supersedes the old one. Never edit the old one to match the
  present.
- Turn each rule the decision depends on into a build check (domain does not import the database
  layer, no cycles, a latency budget), because an unchecked rule drifts.
- Debt is a decision with a record, a reason and a date. Without those it is a bug: fix or delete
  it.

## Explain

Give the engineer the mechanism, the trade-off and the check that guards it. Give the business what
it lets us do, what it costs and what happens without it. If you can write only one, you do not
understand the decision yet.

## Red flags

- When a record lists no rejected option, ask what else was possible, because nobody looked.
- When the architecture lives only in a slide, add a build check, because it has already drifted.
- When the analysis ends without a choice and a date, end it with both, because it was a
  conversation.

## Say it in the reply

Five lines, no more: the constraint, the options (doing nothing included), the choice, the cost we
accept, the tripwire that reopens it. If it needs more, it is more than one decision. Name the build
check on a sixth line when one exists.
