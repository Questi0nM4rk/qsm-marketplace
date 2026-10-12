# Usage

`qsm-book-to-skill <verb> [options]`. Verbs in order: `validate`, `extract`, `analyze`,
`draft`, `assemble`, `scan`; plus `doctor`. `--help` lists each verb's options.

```bash
qsm-book-to-skill validate book.pdf --work /tmp/run
qsm-book-to-skill extract  --work /tmp/run
```

- `--work <dir>` names the run directory (default `QSM_BOOK_TO_SKILL_WORKDIR`, else a temp dir).
- `assemble --out` defaults to `QSM_SKILLS_DIR`.
- `--json` on any verb prints one envelope: `{ code, exit, reason, message, warnings, data }`.
- Exit codes: `ok` 0, `failed` 1, `usage` 2, `missing` 4.
- A stage that resolved some inputs but not all is `ok` with warnings on stderr.
- `assemble` needs `--description` (when to load the skill); `--name` overrides the slug taken from
  the text's first heading.
- `draft` writes `TODO(book-to-skill)` markers; `scan` fails until they are gone, and also on a
  page or chapter reference, a bad frontmatter, a broken link or a document over 12 KB. On a pass
  it prints where the skill is and its size.
