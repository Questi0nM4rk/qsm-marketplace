# qsm-setup

The installer for this marketplace, for the one developer who owns the machine: it installs
plugins, checks them, and writes the instructions every agent reads.

## Why it exists

A marketplace is useful only when a machine reaches it in one step, and an agent works with it
properly only when it knows, in every session, who it works for, where things live and where
feedback goes. qsm-setup exists to set up this Claude for the marketplace: it brings the plugins to
the machine and writes the instructions every agent here reads before anything else. It takes the
stance that setup is repeatable and probes the machine instead of remembering it. It refuses to be
a package manager, a config generator for anything outside this marketplace, a judge of how the
person works, or a place where a plugin hides its own install. When every plugin installs itself
and the harness carries these instructions, this plugin has no reason to exist.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `setup` | Guided or direct install of plugins, with a go before anything is written |
| Hook | `session.start` | Relinks the bin farm when `autoRelink` in `setup.json` is on |
| Hook | `$.setup` noun | Gives other plug-in hooks the verbs as `$.setup.<verb>()` |
| CLI | `qsm-setup` | 6 verbs, see [USAGE.md](USAGE.md) |

## Install

```bash
export QSM_MARKETPLACE=/path/to/qsm-marketplace
bun "$QSM_MARKETPLACE/plugins/qsm-setup/scripts/install.ts"
qsm-setup install --profile general
qsm-setup activate qsm-setup -- --instructions replace
qsm-setup doctor
```

Compiles `qsm-setup` into `QSM_BIN_DIR` (default `~/.local/bin`). Details are in
[INSTALL.md](INSTALL.md).

Brings `qsm-essentials` with it: the instruction files it writes send every agent to its skills
and agents, and without it those pointers lead nowhere.

## Use

```bash
qsm-setup install qsm-langdev qsm-secrets
qsm-setup doctor --verbose
qsm-setup relink --check
qsm-setup tools --fetch
```

Or ask: "set up qsm on this machine" loads the `setup` skill.

## Caveats

- The bin directory must already be on `PATH`.
- `activate` is the only step that changes files you own. `install` never runs it.
- `activate` writes into `~/.claude` (or `$CLAUDE_CONFIG_DIR`). Details are in
  [USAGE.md](USAGE.md).
- Rerun `activate` after editing an instruction file.
- `doctor` reports and never fixes. Each FAIL names its fix.
- Completions are fish only.
- Optional `~/.config/qsm/setup.json` holds `marketplaceRoot`, `autoRelink` and `profiles`.
