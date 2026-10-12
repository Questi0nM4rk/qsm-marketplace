---
name: insights
description: "Use when the user asks about patterns across their past sessions: how am I using Claude Code, recurring friction, what keeps going wrong, what do I keep repeating to the agent, my prompting mistakes, habits, what should I make permanent. Reads recent sessions, extracts facets per session, and reports what works, what hinders, and instructions worth making permanent."
---

# Insights

One session shows a mistake, fifty show a habit. The output that matters is the instruction given
in two or more sessions: the person should not give it a third time. Nothing is added to a file
unless the person confirms. Shared reading and apply rules are in the `usage` skill. A subagent
cannot start subagents, so the main agent runs this pipeline.

## 1. Collect

The ~50 newest sessions. Counts (turns, tokens, tools, skills, agents) come from
`mcp__qsm-usage__ledger`. What was asked and what went wrong exists only in the transcripts,
`~/.claude/projects/*/*.jsonl`: skip sessions with fewer than 2 user messages. For sessions before
the ledger, count with `jq`, not a model: messages, tool calls and errors, `[Request interrupted by
user` markers, `git commit` and `git push` in Bash calls.

## 2. Facets per session

Haiku workers (`model: haiku`), about ten sessions each. A session over ~30,000 characters is
summarised in chunks first, keeping file names and error text. Each writes
`<scratchpad>/facets/<session>.json` with:

| Field | Holds |
| --- | --- |
| `underlying_goal` | what the user fundamentally wanted |
| `outcome` | `fully_achieved`, `mostly_achieved`, `partially_achieved`, `not_achieved`, `unclear_from_transcript` |
| `friction_counts` | `{type: count}`: `misunderstood_request`, `wrong_approach`, `buggy_code`, `user_rejected_action`, `excessive_changes` |
| `friction_detail` | one sentence, or empty |
| `prompting_issues` | what in the user's request caused rework: missing context, two tasks in one, a goal stated after work began |
| `user_instructions` | standing instructions the user gave ("always run tests", "no em-dash") |
| `brief_summary` | one sentence: wanted, got it or not |

Satisfaction and outcome come from explicit signals only ("perfect", "thanks", "try again", "I give
up"); no signal means `unclear_from_transcript`.

## 3. Synthesis

One sonnet worker (`model: sonnet`) reads the counts and all facet files and writes, in second
person, with examples: project areas with session counts; 3 workflows worth keeping; 3 friction
categories, each with 2 examples, splitting the agent's fault from the user-side cause and naming
prompting mistakes plainly; **make it permanent**; an at-a-glance block with no raw numbers.

Make it permanent: each instruction given in 2 or more sessions, as the exact line to add, where
it goes (a rule, an instruction file, a skill, or a hook when it must be enforced) and why, after
checking it is not already in a loaded file.

## Findings

A new line costs tokens in every session: count it with `qsm-usage count`. Its finding has
`savingTokens` 0 and a `savingNote` with the cost and the reason ("adds ~25 tokens; given in 6 of
50 sessions"). "Make it permanent" is `change.kind: "edit"` with the target file and the line in
`detail`, `verdict: "fix"`, `question: "cleanup"`. Friction and prompting findings are `verdict:
"warn"`, `change.kind: "none"`, `question: "none"`, examples in `evidence`.

## Red flags

- When a facet claims satisfaction or a goal with no explicit signal, mark it unclear, because
  inferred feelings make the habits look false.
- When a "make it permanent" line is already in a loaded file, drop it, because it would be paid
  for twice.

## Say it in the reply

The at-a-glance block, the path of the Markdown file holding every section, and the "make it
permanent" list, since those are the lines the person can act on today. `/insights` is the
harness's own HTML version.
