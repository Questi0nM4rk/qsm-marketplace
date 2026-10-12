---
name: grounded-research
description: "Use when a topic already sized as deep needs several answers from several sources and an evidence base somebody will come back to. Triggers: deep dive into X, research this properly, investigate and document Y, build an evidence base for Z, run the research passes. Decomposes, queries the notebook in three passes, closes gaps with external research, and hands the findings on. Not the notebook itself (source-notebook), not note writing (vault-note), not sizing the ask."
---

# Grounded research

One question at a time is cheap; several questions over several sources, ending in an evidence
base that outlives the session, drifts unless someone holds the method. This flow is that method
for the person who will come back to the result: the notebook holds the sources, the vault holds
the conclusions, and this is the passage between them. It writes no vault note and does not size
the ask. Where no web is available, the research plan, the questions and the sources they need,
is the part that counts.

It starts from a topic already sized as deep, with a destination and an idea of what a good answer
looks like. If that is missing, send it back to be sized and say why in one line, because an
unsized deep research produces material for hours and never a conclusion nobody agreed on.

## Decompose first

Write three to five sub-questions, each falsifiable on its own, before the first query: "when does
the strangler pattern fail" is one, "tell me about migration" is a subject. Add the two people
skip: where do the sources disagree (a topic with no disagreement is settled or under-sourced, and
only asking tells which) and what do the sources not cover (the notebook can only see its own
corpus, so it answers this honestly).

## Three passes on the notebook

Ask inline, because each answer comes back small and cited; `source-notebook` owns the verbs and
failure modes.

1. **Broad.** One query per sub-question. Read the citations, not only the prose.
2. **Sharp.** Follow what the broad pass surfaced; the finding usually lives here.
3. **Adversarial.** Turn the strongest claim into a question that could kill it. A claim that
   survives is worth writing down, and one that does not saved a wrong note.

## A gap is a dispatch

When a pass returns thin citations, or the notebook says its corpus does not cover a sub-question,
research that one gap on the web, add what comes back good to the notebook, and
only then continue the passes. Continuing earlier builds the rest of the research on the hole you
just found, and feeding the notebook is what makes the next session faster.

Keep one findings file, appended as you go, each finding with its citation, and keep in context
only what the next question needs. Then give the file to the `synthesis-pass` worker (output
shape and destination with it) and each draft it returns to `vault-note`.

## Where no web or notebook is reachable

The plan is the deliverable, so write it so someone with access can run it: per sub-question, what
you would search or ask and why, which source kinds answer it (the spec, the paper, the maintainer,
the postmortem before the blog post about it), and how each claim will be grounded (a locator, not
a summary). Name the gaps you could not close and say so, because an answer from memory dressed as
research is the failure this flow exists to prevent.

## Done when

Every load-bearing claim cites a source, not a summary of one. Contradictions stay written down as
open questions, never averaged into a middle nobody's sources support. The gap sub-question was
asked and answered, and sources found outside the notebook are now in it.

## Red flags

- When the passes are about to start without written sub-questions, write them, because nobody can
  say when it is finished.
- When one pass is about to stand as the answer, run the adversarial one, because otherwise you
  hold an impression, not a finding.
- When a gap was researched and the result is not in the notebook, add it, because the next pass
  cannot cite it.
- When findings sit in the conversation, move them to the file, because material in context
  crowds out the reasoning that turns it into a conclusion.

## Say it in the reply

What was concluded, in the words a reader would use; what stayed open and whether the sources
disagree or none covered it; where the findings file, the notebook, and the notes are. Not the
findings themselves, because pasting them back buries the conclusion.
