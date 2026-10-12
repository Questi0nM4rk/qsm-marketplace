# qsm-langdev

Per-language quality checks for one developer and their agent: did this change make the tree's
findings worse than the reference commit.

## Why it exists

An agent cannot see the quality of what it wrote until something outside it
measures it, and by then the session is usually over. qsm-langdev exists so
the measurement happens inside the session, at the moment a file lands and
again before the agent hands the work back, for the language of the file and
for the shape of the whole tree. It never scores a tree alone; it compares the
tree being shipped against the tree it replaces, so the only question it ever
answers is whether this change made things worse. It refuses to be a linter
run for its own sake, a stored score, or a gate that blocks without saying
where. It is the floor under every other plugin's promise of quality; without
it, "the agent checked its work" is a sentence, not a fact.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| CLI | `qsm-langdev` | 10 verbs, see [USAGE.md](USAGE.md) |
| Hook | `tool.call` on Bash | Denies `git commit --no-verify` and `git push --no-verify` |
| Hook | `tool.check` on Bash | Asks you before a command that sets `QSM_LANGDEV_ALLOW` runs |
| Hook | `tool.call` on Write, Edit, NotebookEdit | Fixes the file, then tells the model its findings against HEAD. Never blocks |
| Hook | `SubagentStop` | Blocks a stop when the agent's edited tree got worse, a capped number of times |
| MCP server | `sentrux` | Architecture queries over the tree: scan, health, dsm, check_rules, test_gaps |

## Install

```bash
claude plugin install qsm-langdev@qsm-marketplace
bun plugins/qsm-langdev/scripts/install.ts
qsm-langdev init --profile general
```

The install script compiles `qsm-langdev` and the stop gate hook, and builds a patched `sentrux`
with `cargo` (minutes) when it is absent. Details in [INSTALL.md](INSTALL.md). `init` writes the
profile's per-tool configs and records the repository's languages in `.qsm-langdev/gates.json`.

## Use

```bash
qsm-langdev doctor                                   # which checker binaries are missing
qsm-langdev check                                    # working tree against HEAD
qsm-langdev check --against main --at pre-push       # a branch against main, as the push gate does
qsm-langdev install                                  # write the pre-commit and pre-push git hooks
```

The edit hook, the stop gate, and the installed git hooks do nothing in a repository that never ran
`qsm-langdev init`. `check` there says so and exits.

## Caveats

- Every checker with a safe fix mode is fixed before the check, on an edit and on staged files at
  commit. A staged file with unstaged changes is not fixed at commit; the block names it.
- A file `.gitattributes` marks `linguist-generated` or `export-ignore` is not scored by the quality
  checkers or `structure`; the security scanners and the secrets, entropy and denylist gates still
  read it.
- No warnings and no suppression comments: a rule fails or is off.
- A missing checker binary or missing scaffolded config fails `check`; `qsm-langdev doctor` names
  what to install.
- To let one measured regression pass: `QSM_LANGDEV_ALLOW="<why>" git commit`. `--no-verify` is
  denied in a session.
- semgrep Pro (cross-file) needs `semgrep login` and `semgrep install-semgrep-pro`; without it the
  community engine runs.
- Everything else: `qsm-langdev --help`.
