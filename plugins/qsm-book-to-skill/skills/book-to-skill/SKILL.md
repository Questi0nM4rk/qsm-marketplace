---
name: book-to-skill
description: "Use when a book, paper, or long document should become one self-contained skill, naming the book only as its source: turn this PDF or EPUB into a skill, extract the frameworks and rules from a document, build on-demand guidance from a book. Triggers: turn this book into a skill, make a skill from this PDF, extract the frameworks from this document, convert this EPUB, knihu na skill."
---

# Book to skill

A book holds rules, ideas and abstractions the agent cannot carry into a session. This turns it
into ONE self-contained skill document: the summary, rules, ideas and abstractions as instructions
the agent can act on, in the author's own names. Once written, the document stands without the
book. It names the book once, as its source ("we follow the X architecture, as AAA does"), and
never a chapter or a page. It is not a book report or an index: a book is worth converting only
when it changes how the agent works, so a book the model already knows by heart gets a short
document or none. The binary `qsm-book-to-skill` does the mechanical stages; reading each chapter
and deciding what the agent must keep is yours, because that is judgement.

## The flow

```bash
qsm-book-to-skill validate <path-or-directory-or-glob>... --work <dir>
qsm-book-to-skill extract --work <dir>
qsm-book-to-skill analyze --work <dir>
qsm-book-to-skill draft --work <dir>
#   fill every <dir>/draft/chapters/NN-*.md from its NN-*.source.md
qsm-book-to-skill assemble --description "<when to load it>" --out <skills-dir> --work <dir>
qsm-book-to-skill scan --work <dir>
```

`assemble` merges every filled chapter summary into one `SKILL.md`; the `.source.md` files and the
chapter files stay in the work directory. Each stage reads the previous one's files, so a stage
that went wrong is re-run alone. Name `--work` for anything longer than one sitting, because
without it the run lands in a temporary directory a later session cannot find. `qsm-book-to-skill
doctor` reports which optional converters are missing: PDF needs `pdftotext`, EPUB, DOCX and RTF
need `pandoc`, MOBI and AZW need `ebook-convert`. When one is missing say so and let the person
decide; do not convert the source to another format behind his back.

## How to fill a chapter

- Read the chapter's own `.source.md`, one chapter at a time, never the whole extracted text,
  because a model summarising a chapter it can hold beats one summarising a book it cannot.
- Write the rule or the framework, not where the book said it. No page numbers, no "see chapter",
  no cross-references: the reader of the skill never holds the book beside it, and a reference is
  a pointer to nothing. `scan` fails on a page or chapter reference.
- Keep the author's exact names ("the 5 Whys", not "asking why several times"), because the name
  is how the person recognises the idea later.
- Write each rule with its reason and, where the book gives one, its edge case, because a rule
  without a reason is applied too wide or not at all.
- Delete a section the chapter has nothing for, because a section padded to look full teaches the
  reader to skip the full ones.
- Retitle a chapter heading that is only a chapter number or the book's own outline ("Part 2:
  Ch. 4") to the idea it teaches, because the heading becomes a section of the document.
- When `analyze` reports a chapter far larger than the rest, check the source before summarising
  it: it is usually a boundary that was missed (a PDF whose headings extracted as body text comes
  back as one chapter).

## After assemble

The result is one document the agent loads whole, so read it once as the reader will, and cut.

- Open it with the source line: the book and author named once, and the stance the person takes
  from it, as one sentence. That is the only place the book appears.
- Merge a rule two chapters repeat into one place, and drop the chapter order when the ideas read
  better grouped by the decision they serve.
- Keep it under 8 KB, 12 at the most. A book that needs more holds two subjects: build two
  documents with two descriptions, because an oversized skill is skimmed.

## Decisions

- Ask once where the skill goes and pass it as `--out`, because the destination depends on which
  agent loads it and a guess lands where nothing looks. `QSM_SKILLS_DIR` also works.
- Write `--description` as the trigger: when to use the skill and what the person would be saying
  then. `assemble` refuses to run without one, because a description of the book instead of the
  occasion means the skill never loads.
- A source `validate` or `extract` could not read is named in the reply and the others go on; do
  not restart the run for one file.
- A placeholder left anywhere, or a failed scan, means the run is not done: fill it or delete the
  section that holds it.

## Red flags

- When you are about to read the whole extracted text into context, run `analyze` and `draft`
  instead, because a chapter at a time is what fits.
- When a summary would fit any book on the subject, go back to the chapter and take its named
  frameworks, because a generic summary changes nothing about how the agent works.
- When you cannot point at a framework in the chapter's own text, drop it, because it is yours,
  not the author's.
- When you want to write the skill by hand because the binary is slower, run `assemble`, because
  the scan is bound to what it builds.

## Say it in the reply

The skill's location and slug, its size, any source that failed to extract with the reason, and
the scan result: clean, or each finding on a line. Last line: done, or the one thing still
unfilled.
