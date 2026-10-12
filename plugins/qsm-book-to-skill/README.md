# qsm-book-to-skill

Turns a book or a long document into one self-contained skill, for a person who wants the agent to
work by the book's methods.

## Why it exists

A book holds rules, ideas and abstractions the agent could work by, but in a format it cannot carry
into a session. This plugin turns a book or a long document into one self-contained skill, written
as instructions the agent can act on, after which the skill has nothing to do with the book. It
converts a source only when it changes how the agent works, and the skill names the book only as its
source, never its chapters or pages. It refuses to be a document reader, a search index, or a
library of book reports. When every method we care about already lives in a skill, it has done its
work and can go.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `book-to-skill` | Drives the stages. The agent reads and writes each chapter, the CLI does the mechanical work. |
| CLI | `qsm-book-to-skill` | 7 verbs: `validate`, `extract`, `analyze`, `draft`, `assemble`, `scan`, `doctor`. See [USAGE.md](USAGE.md). |

## Install

```bash
claude plugin install qsm-book-to-skill@qsm-marketplace
bun plugins/qsm-book-to-skill/scripts/install.ts
```

Install compiles `qsm-book-to-skill` into `$QSM_BIN_DIR` (default `~/.local/bin`). See
[INSTALL.md](INSTALL.md).

## Use

Ask the agent: "turn this PDF into a skill" or "extract the frameworks from this EPUB".

```bash
qsm-book-to-skill validate ~/books/book.pdf --work /tmp/run
qsm-book-to-skill extract  --work /tmp/run
qsm-book-to-skill analyze  --work /tmp/run
qsm-book-to-skill draft    --work /tmp/run
# fill every scaffold in /tmp/run/draft
qsm-book-to-skill assemble --work /tmp/run --out ~/skills --description "Use when ..."
qsm-book-to-skill scan     --work /tmp/run
```

Each stage reads the previous one's output from the run directory, so any stage re-runs alone.

## Caveats

- Markdown, AsciiDoc, reStructuredText, HTML and plain text are built in. `.pdf` needs `pdftotext`
  (poppler). `.epub`, `.docx` and `.rtf` need `pandoc`. `.mobi`, `.azw` and `.azw3` need
  `ebook-convert` (calibre). `qsm-book-to-skill doctor` shows which are present.
- A PDF whose headings extract as body text comes back as one chapter.
- `assemble` merges every chapter summary into one `SKILL.md` and overwrites it: edit the draft.
- The skill states rules, not where the book said them. `scan` fails on a page or chapter
  reference.
