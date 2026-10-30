# Install

```bash
claude plugin install qsm-ccr@qsm-marketplace
bun plugins/qsm-ccr/scripts/install.ts
```

Compiles `qsm-ccr` into `$QSM_BIN_DIR` (default `~/.local/bin`, must be on `PATH`); the hooks module
and the teammate command call it from there. `--dry-run` prints the plan. Install runs no `ccr`
command, because any CCR invocation can start the daemon before activation's guard holds.

Prerequisites, each reported as `missing-prereq` with its install when absent:

- `claude`: <https://docs.anthropic.com/en/docs/claude-code/setup>
- `ccr`: `bun add -g @musistudio/claude-code-router`
- `codex`: `bun add -g @openai/codex`, then `codex login`

Then, once, with `-- --dry-run` first to read what it would change:

```bash
qsm-setup activate qsm-ccr
```

Activation changes files you own, in six steps, each named in its output:

1. `ccr profile guard`: every CCR profile gets scope `ccr` and disabled; on a machine with no CCR
   config, CCR creates one in a throwaway `HOME` first.
2. `codex-api provider`: detected in CCR config; when missing, import Codex in CCR's own UI under
   that name and activate again.
3. `custom router`: writes `custom-router.js` into the state directory.
4. `codex native config`: removes what CCR wrote into `~/.codex/config.toml` after copying it to
   `config.toml.qsm-ccr.bak`.
5. `teammate command`: writes `CLAUDE_CODE_TEAMMATE_COMMAND` into `env` of
   `~/.claude/settings.json`, every other key kept.
6. `first sync`: runs `qsm-ccr sync`, unless an earlier step did not complete.

A second run answers `already` for each step and writes nothing.
