# qsm-usage

A review of how you use Claude Code, measured in tokens: what to cut, what to make permanent, what
to reach for instead, for the person who pays for those habits.

## Why it exists

A developer who works beside an agent every day pays for habits nobody measures: the same
instruction typed into every session, context loaded on every turn and never read, a hook that
injects noise into every call, a tool on the machine the agent never reaches for. qsm-usage exists
to look at how this person actually uses Claude Code and hand back, in tokens, what to cut, what
to make permanent, and what to reach for instead. It takes the stance that token efficiency is the
measure of a good setup, that every proposal carries its saving as a number, and that nothing
changes without the user's choice and a way back. It refuses to be a dashboard, a billing tool, or
an optimiser that edits behind the user's back. When the harness reviews its own use and tunes
itself to the person in front of it, this plugin has no reason to exist.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `usage` | Reviews your setup in four stages, then gives one plan with each saving in tokens |
| Skill | `claude-md-trim` | Trims instruction files that have grown |
| Skill | `duplicates` | Finds the same guidance in two places |
| Skill | `hooks-review` | Finds slow or noisy hooks and what they inject |
| Skill | `insights` | Finds recurring friction across past sessions |
| Skill | `permissions-tune` | Proposes an allowlist for commands you keep approving |
| Skill | `tools-review` | Finds a better tool for what the agent does the long way |
| Skill | `unused-extensions` | Lists extensions you never use, with their cost |
| Command | `/qsm-usage` | Opens a pane on this session's context by category |
| Tools | `breakdown`, `ledger` | Give the agent the context breakdown and recorded sessions |
| Hook | `tool.call` on Bash | Runs the command through the `rtk` output filter |
| Hook | `tool.call` on wrapped tools | Hands large structured output to the model as TOON |
| Hook | session and turn events | Records a ledger of each session |
| CLI | `qsm-usage` | 10 verbs (`count`, `toon`, `filter`, `report` and more), see [USAGE.md](USAGE.md) |

## Install

```bash
claude plugin install qsm-usage@qsm-marketplace
bun plugins/qsm-usage/scripts/install.ts
qsm-usage doctor
```

The install script compiles `qsm-usage` and links it into `~/.local/bin`. It also builds the `rtk`
output filter with `cargo` when it is missing. More in [INSTALL.md](INSTALL.md).

## Use

Ask: "review my Claude Code usage", "which hooks are slow?" or "which plugins do I never use?". The
matching skill fires. Type `/qsm-usage` for a pane on why this session is expensive. The CLI:

```bash
qsm-usage count CLAUDE.md .claude/rules/*.md --total
qsm-usage toon size people.json
qsm-usage toon encode people.json
```

Every verb and flag is in [USAGE.md](USAGE.md).

## Caveats

- The default token count is characters / 4. `--mode exact` needs `ANTHROPIC_API_KEY`.
- The Bash hook is inert without `rtk`. Do not install `rtk` from crates.io by name, because that
  is another package ([INSTALL.md](INSTALL.md)).
- Prefix a command with `QSM_TOON=0` for raw output from the TOON hook.
- The ledger stores names, sizes and counts only, never prompt or tool text.
