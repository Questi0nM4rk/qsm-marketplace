# Install

```bash
claude plugin install qsm-book-to-skill@qsm-marketplace
bun plugins/qsm-book-to-skill/scripts/install.ts
```

Compiles `qsm-book-to-skill` into your bin directory. Needs `bun` on `PATH`, and the bin
directory already on `PATH`. `--dry-run` prints the plan.

| Variable | Effect |
| --- | --- |
| `QSM_BIN_DIR` | Binary location. Default `~/.local/bin`. |
| `QSM_BOOK_TO_SKILL_WORKDIR` | Default run directory. |
| `QSM_SKILLS_DIR` | Where `assemble` creates the skill. |

Check: `qsm-book-to-skill doctor`.
