# qsm-knowledge

Grounded knowledge work for one person: a NotebookLM notebook holds your sources and answers with
citations, and a markdown vault holds the notes you write from those answers.

## Why it exists

Knowledge gathered in one session is lost by the next, because the conversation's memory ends with
the session and a web search returns pages nobody can reopen as a set. qsm-knowledge puts it where
it can be asked and cited: NotebookLM holds the sources and answers with citations, the Obsidian
vault holds the notes written from those answers. It takes the stance that a note is worth writing
only when it is grounded in a source someone can open. It refuses to be a scratchpad, a bookmark
pile, or a second memory for the agent. When a session can be grounded in our sources without either
tool, this plugin has no reason to exist.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `source-notebook` | Decides whether a topic earns a notebook, adds sources, asks it cited questions, keeps it current. |
| Skill | `grounded-research` | Runs a deep topic in three passes against the notebook, then closes gaps with outside research. |
| Skill | `vault-note` | Writes one note with the frontmatter the vault needs, links it and validates it. |
| Agent | `synthesis-pass` | Turns a closed research stage's findings into note-ready drafts. Never fetches a source. |
| CLI | `qsm-knowledge` | 2 verbs: `validate` and `doctor`, see [USAGE.md](USAGE.md). |

## Install

```bash
claude plugin install qsm-knowledge@qsm-marketplace
bun plugins/qsm-knowledge/scripts/install.ts
nlm auth
qsm-knowledge doctor
```

Install compiles `qsm-knowledge` into `$QSM_BIN_DIR` (default `~/.local/bin`) and builds the
notebook binary `nlm` with `go install` when it is missing (needs Go). Brings `qsm-essentials`
with it: the research flow dispatches the `web-research` worker for a gap the notebook cannot
close. See [INSTALL.md](INSTALL.md).

## Use

Ask the agent: "make a notebook for these three papers and ask what they say about retries", or
"write this to my vault as a TIL".

```bash
qsm-knowledge validate ~/vault/concepts/strangler-fig.md
qsm-knowledge doctor
```

`validate` fails (exit 1) on a missing `title`, `created`, `type` or `tags`, an unknown type, a
date not `YYYY-MM-DD`, or tags not lowercase-hyphenated. A note without a `[[wikilink]]` is only a
warning.

## Caveats

- `nlm` is unofficial. It scrapes the web app with your session (<https://github.com/tmc/nlm>) and
  breaks when the app changes or the session expires: run `nlm refresh`, then `nlm auth`.
- The vault path is asked every time and stored nowhere. Validation checks the note, not where it
  lives.
- A failed query is never an answer: retry or sign in again, do not fill the gap from the model.
