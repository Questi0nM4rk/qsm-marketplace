# Usage

```bash
qsm-setup install qsm-langdev qsm-secrets
qsm-setup activate qsm-setup -- --instructions replace
qsm-setup relink --check
qsm-setup tools --fetch
```

Verbs: `install`, `activate`, `doctor`, `relink`, `build-bins`, `tools`; `qsm-setup --help` lists
flags.

Exit codes: 0 done, 1 a plugin failed or doctor found a FAIL (or `relink --check` found it stale),
2 usage, 4 no marketplace root or no `origin/main`.

## What `activate` does

`activate qsm-setup` writes `CLAUDE.md`, `rules/implementation.md`, `rules/context.md`,
`rules/git.md` and `output-styles/qsm.md` into `~/.claude` (or `$CLAUDE_CONFIG_DIR`), and selects the
`qsm` output style. In every file the generated text sits between a `<!-- qsm-setup-begin: ... -->`
and a `<!-- qsm-setup-end: ... -->` line: qsm-setup owns that area and rewrites it; text outside it is
yours. The output style keeps its frontmatter first, above the area.

`--instructions` applies to every file. `replace` rewrites only the marked area and keeps every byte
outside it. `overwrite` rewrites the whole file. `skip` leaves every file alone. A file without
markers that a past activation wrote (or that equals the source) is replaced by the area; any other
text in it is kept above the area, and the result says `kept your text`. Broken markers are an
error naming the file, and nothing is written.

`activate` removes the block qsm-essentials wrote before. First it makes the Claude home a local
git repository (never a remote), completes its `.gitignore`, and commits what is uncommitted as
`before qsm-setup activate`. It commits what it wrote as `qsm-setup activate: <files>`.
