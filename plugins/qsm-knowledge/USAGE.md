# Usage

`qsm-knowledge validate <note>` and `qsm-knowledge doctor`; `--help` prints them.

```console
$ qsm-knowledge validate ~/vault/tils/draft.md
fail /home/user/vault/tils/draft.md
  error: missing required frontmatter field: tags
  warn:  no [[wikilink]] in the body
```

- `validate` requires `title`, `created` (`YYYY-MM-DD`), `type` (`til`, `concept`, `project`,
  `debug`, `research-summary`, `index`) and lowercase-hyphenated `tags`. A missing wikilink is a warning.
- `doctor` checks that `nlm` is on PATH and answers `--help`. It skips your session: use `nlm list`.
- `--json` prints one envelope: `{ code, exit, reason, message, warnings, data }`.
- Exit codes: `ok` 0, `failed` 1 (note has errors), `usage` 2, `missing` 4 (`nlm` absent).
- Hooks and dependent plugins call the same verbs as `$.knowledge.validate({ note })` and
  `$.knowledge.doctor()`.
- `nlm` verbs the skills use: `generate-chat`, `chat`, `add`, `sources`, `check-source`,
  `refresh-source`, `critique`, `verify`, `auth`, `refresh`. See `nlm --help`.
