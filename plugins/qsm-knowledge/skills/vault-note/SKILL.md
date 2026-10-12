---
name: vault-note
description: "Use when distilled knowledge is ready to save into a markdown vault: a TIL, an atomic concept, a project note, a debug note, or a research summary. Triggers: write this to my vault, add a TIL, save this as a note, atomic note, create a vault note about X, validate this note. Writes one note with the frontmatter the vault needs, links it, and validates it before reporting it done. Not research (grounded-research, source-notebook)."
---

# Vault note

Knowledge not written down is re-derived next month. This skill saves one concept as one note,
where the vault already keeps that kind of note, and validates it. It does not import in bulk,
reorganise a vault, or research.

## Ask first

- Ask the vault path every time and store it nowhere, because a remembered path writes into the
  wrong vault once there are two.
- Ask the type: `til`, `concept`, `project`, `debug`, `research-summary`, `index`.
- Put the note where notes of that type already live. If no directory matches, ask, because a new
  top-level directory is invisible to the vault's queries.

## The note

- Write your conclusion in plain words, with a pointer to the source. Pasted output is a pile, not
  a note.
- One concept per note. Two concepts are two notes, plus an index note if the pair matters.
- Link with `[[wikilinks]]`, because they survive a rename. A note nothing links to is an island.

| Frontmatter | Required | Holds |
| --- | --- | --- |
| `title` | yes | matches the H1 and the file name |
| `created` | yes | `YYYY-MM-DD` |
| `type` | yes | one of the six |
| `tags` | yes, one or more | lowercase, hyphenated, in the form the vault already uses |
| `aliases`, `source` | no | other names; where the material came from |

## Validate

```bash
qsm-knowledge validate <path-to-note.md>
```

On exit 1, fix every listed error and run it again, because a note is not done on a failed or
missing validation. A missing wikilink target is only a warning: the note is written and the gap is
a follow-up you name.

## Red flags

- When the vault path came from memory or an earlier session, ask again, because it may be another
  vault.
- When the draft is a transcript with a heading, distil it, because the vault exists to replace the
  pile.

## Say it in the reply

The note's path, one line on what it says, and the validation output as printed. Name each
wikilink whose target does not exist. If validation found errors, say what they were and that they
are fixed.
