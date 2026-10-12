# qsm-toolbox

One list of the command-line tools on this machine, kept in the agent's context, with a doctor that
says which are installed, for the person and the agent who share them.

## Why it exists

Every agent should know the same set of command-line tools this machine has,
and a tool nobody names is a tool nobody uses. qsm-toolbox exists to be that
one list, always in the agent's context at a fixed small cost, with the
install command, the health probe, and the one caveat `--help` cannot tell, a single call
away. It takes the stance that the index is the product and everything else
about a third-party binary belongs upstream. It refuses to document what a
tool does; the tool's own help does that. When the harness shows the agent
what is on PATH by itself, this plugin has no reason to exist.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `toolbox` | Keeps the whole tool list in context, with the install command, the version probe and one caveat per tool |
| CLI | `qsm-toolbox` | 1 verb (`doctor`), see [USAGE.md](USAGE.md) |

## Install

```bash
claude plugin install qsm-toolbox@qsm-marketplace
bun plugins/qsm-toolbox/scripts/install.ts
```

The install script compiles `qsm-toolbox` and links it into `~/.local/bin`. It then installs each
missing catalog tool through `bun`, `uv`, `pipx` or `go`. A tool that needs a system package manager
or `sudo` is reported with the line to type and never run. `--dry-run` prints the plan. More in
[INSTALL.md](INSTALL.md).

## Use

Ask: "which tool searches code by syntax?" or "is `jq` installed?". The skill fires and answers from
the list. To check the machine yourself:

```bash
qsm-toolbox doctor
qsm-toolbox doctor --json
```

Doctor prints `present <bin> <version>` or `missing <bin> (install: <line>)` for each tool. It
always exits 0, because every tool is optional.

## Caveats

- Install lines target this machine. Each row names the alternative when a prerequisite is missing.
- `br` is installed by the qsm-tasks plugin. Its row here only points there.
- The qsm CLIs in the second group are listed for discovery. They are never installed or probed
  here.
- `QSM_<TOOL>_SKIP=1` makes the install script skip one tool.
