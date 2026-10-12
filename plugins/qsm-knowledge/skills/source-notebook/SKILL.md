---
name: source-notebook
description: "Use when work needs grounding in source material a person can open: deciding whether a topic earns a notebook at all, putting sources into one, asking it a question that comes back cited, and keeping it current. Triggers: ground this in sources, make a notebook for X, ask the notebook, what do my sources say about, add this paper to the notebook, is my notebook stale. Not the multi-pass research flow (grounded-research), not note writing (vault-note)."
---

# Source notebook

A notebook answers only from the sources you put in it, so every answer cites something a person
can open, or it does not come back. This skill decides whether a topic gets a notebook and which
`nlm` verb to run. `nlm --help` lists the verbs, so they are not restated. It does not run the
multi-pass flow (grounded-research) and does not write notes (vault-note).

Ask the notebook inline, never through a subagent, because the answer comes back short and cited
and a dispatch costs more than it.

## Does the topic earn a notebook?

Make one when three or more sources will be queried again across sessions, or decisions will cite
the topic for months. Otherwise do a one-off lookup, because gathering sources costs more than a
single answer. A notebook with three sources answers confidently and reads like the whole field.

## Sources

- Prefer the primary source (paper, spec, maintainer) over a post about it, because the notebook
  cannot tell a wrong source from a right one.
- Add one source that disagrees, because a corpus of agreement manufactures confidence.
- Run `nlm sources <notebook>` before relying on a source, because ingestion finishes after the add
  returns and a login page ingests as a login page.

## Asking

- Use `nlm generate-chat <notebook> "<question>"`, because it returns numbered references on a
  steadier path than the research verb. Use `nlm chat` only when the next question needs the last
  answer.
- Ask one named question at a time, and ask "where do my sources disagree about X" and "what would
  I need to answer X that these sources do not cover", because a summary hides both.
- An answer that cites one source repeatedly means the corpus does not cover the question. Add
  sources or report it unanswerable.

## Current

Run `nlm check-source` then `nlm refresh-source` before the notebook decides something, because a
changed source still answers from the version ingested.

## When a query fails

Never fill the gap from memory.

| Failure | Do |
| --- | --- |
| Service unavailable for that query type | retry with `generate-chat` |
| Authentication failure | `nlm refresh`, then `nlm auth`, then retry |
| Nothing answers | `qsm-knowledge doctor` |

## Red flags

- When a query failed and an answer appeared anyway, discard it, because it came from the model.
- When raw notebook output is headed for a note, distil it first, because a transcript is not a
  note.

## Say it in the reply

Name the notebook, the question as asked, and what the answer cited. When the corpus did not cover
it, say that first and what you would add. When a query failed, name the failure and what you did.
