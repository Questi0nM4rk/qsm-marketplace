---
name: grilling
description: "Use when a plan, design, or idea still carries decisions the user has not settled, when a business request has to become an epic with its intent and acceptance criteria, or when any flow reaches an unresolved branch. Triggers: grill me on this, ask me what you need, interview me about this, what is still undecided, zeptej se me, settle these decisions, write the epic. Asks the whole answerable frontier in one batch, each question with a recommendation, and writes the epic after the person's yes. Not sizing an ask (plan), and not writing the spec."
---

# Grilling

A plan with an unsettled decision ships that decision as a guess. This skill serves the person who
owns the decisions, as product owner: it asks only what only he can answer, in as few round trips
as possible, and with the analysis already done so he confirms or corrects. It works at the level
of what the work does, how it behaves and how it looks, not where code goes (that is the spec).
It ends by writing the epic's intent and acceptance criteria, after his yes. It does not size the
ask or write the spec. It sits between the business request and plan in the qsm flow, and any flow
that reaches an unresolved branch comes here.

## Rounds

- **One round is the whole frontier.** The frontier is every open question whose prerequisites
  are settled. Send them together, wait for the batch, because one question at a
  time costs a round trip each. A question that depends on an open one waits for the round that
  settles its parent; asking a child early buys an answer the next round invalidates.
- **Every question carries a recommendation.** It hands over your analysis, so the user confirms
  in one word or corrects with context you lacked. A question without one hands your work back.
  When a trade-off is the question, say what each side costs.
- **Facts are fetched, decisions are asked.** What the code, the spec tool, memory, the task tool
  or the documentation answers is not a question; fetch it and do not hold the round for it.
  What was already settled this session, or in the task or spec, is not asked again, because
  re-asking invites a second answer that contradicts the first.
- **Done is an empty frontier,** not a question count. A cap ends the interview at an arbitrary
  depth and ships the unasked branch as a guess.

Each round: recompute the frontier from the answers, one line of context per question, the one
that unlocks the most first, and drop a question an answer made pointless without explaining.

**Every round goes through the ask tool** (AskUserQuestion), never as prose, because named options
let the person answer in one click and the free-text answer still arrives through its Other field.
Per question two to four named options, the recommended one first and marked as recommended, up to
four questions per call; more than four in the frontier means the rest go in the next call of the
same round.

**An explanation is one short, simple reply that ends with "Understand?"** (in Czech "Chápeš?"),
in the chat language. Give it when the person needs it before he can answer. On yes, the next
round goes through the ask tool again. An answer that asks for clarification or changes the frame
is handled first, then the round is recomputed, because a question asked on a stale frame buys a
guess.

When the ask sounds like a solution, ask for the constraint under it (why this, why can that not
change). The bottom of that chain is often the better project; the recommendation says which level
to attack. For a system or feature design with a thin frontier, also cover purpose, who uses it,
what it touches, what data it owns, what may change, how it ships and breaks, and how success is
measured, and say out loud which of these you skip.

## Decisions too big for this session

When the frontier is too wide to empty in one session, record each open decision as a child task
of the epic, of kind decision, through the task tool, and settle one per session. A settled one is
closed with a line recording the decision. If a decision contradicts the epic's intent, return the
conflict to the person; never edit the intent yourself.

## End: write the epic

When the frontier is empty, show the person three things in one reply: the settled decisions, one
line each; the intent of the work (who it is for, what they do with it, what it is not); and the
acceptance criteria, each one a thing a run can show. The criteria are the contract the final
test-it task checks, so a criterion that no run can show is rewritten until one can.

Ask for the yes through the ask tool. Only after the yes, write the intent and the criteria into
the epic through the task tool: create it, or update the existing one. No yes, no epic. Then hand
to plan to split it. A fix has no epic: if the work turns out to be a fix, say so and stop.

## Red flags

- When you ask one question while four more are answerable, send all five, because a lone
  question wastes a round trip.
- When the repository would answer it in one search, search, because asking hands your work to
  the user.
- When the interview wants to end because it felt long, check the frontier instead, because only
  an empty frontier is done.
- When you are about to write the epic before the yes, stop, because the epic is the contract
  everything after it is checked against.
- When a criterion reads "works well" or "is clean", rewrite it as something a run shows.

## Say it in the reply

The round as an ask-tool call, recommendations included, or the one-reply explanation ending
"Understand?". When the frontier empties, the decisions, the intent and the criteria for the yes;
after it, the epic id written and plan as the next step.
