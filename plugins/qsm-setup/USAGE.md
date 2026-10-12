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

`activate qsm-setup` writes `CLAUDE.md` (a block between `<!-- qsm-setup-begin -->` and
`<!-- qsm-setup-end -->`), `rules/implementation.md`, `rules/context.md`, `rules/git.md` and
`output-styles/qsm.md` into `~/.claude` (or `$CLAUDE_CONFIG_DIR`), and selects the `qsm` output
style.

`--instructions` sets how `CLAUDE.md` is written. `replace` rewrites only the block and keeps
text outside it. `overwrite` rewrites the whole file. `skip` leaves it alone.

`activate` removes the block qsm-essentials wrote before. First it makes the Claude home a local
git repository (never a remote), completes its `.gitignore`, and commits what is uncommitted as
`before qsm-setup activate`. It commits what it wrote as `qsm-setup activate: <files>`.
