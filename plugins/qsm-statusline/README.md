# qsm-statusline

One status line for Claude Code that shows the model, the context window, the rate limits and the
git state, for the person who watches what a session costs.

## Why it exists

Claude Code's default status line shows little beyond the model, so the human cannot see what the
session costs until it is too late to change course. qsm-statusline replaces it with one line that
is always on screen: model, context window used, five-hour and weekly rate limits, and git state.
It takes the stance that the human decides the pacing and can only do so with the numbers in front
of them. It refuses to be a dashboard or a notification system. When the harness shows these
numbers itself, this plugin can go.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `setup-statusline` | Installs, updates, fixes or removes the status line, and writes the settings key with your go |
| CLI | `qsm-statusline` | 3 verbs (`render`, `refresh`, `doctor`), see [USAGE.md](USAGE.md) |

The line shows the model, the context window used, the five-hour and weekly rate limits with reset
times, and the git state. A source that is not there drops its segment. The render never waits on
git.

```text
Opus 5 | 370k/1m
context: ██████░░░░░░░░░ 37% | git rewrite: +2 ~1 ?3
session: ██████░░░░ 62% resets in 2h | week: ██░░░░░░░░ 18% resets in 3d 11h
```

## Install

```bash
claude plugin install qsm-statusline@qsm-marketplace
bun plugins/qsm-statusline/scripts/install.ts
```

The install script compiles `qsm-statusline` and links it into `~/.local/bin`. It does not touch
your settings. Add this key yourself, then restart Claude Code:

```json
{ "statusLine": { "type": "command", "command": "qsm-statusline render", "padding": 1 } }
```

More in [INSTALL.md](INSTALL.md).

## Use

Ask: "set up the statusline" or "my statusline is broken". The skill fires and does the wiring. To
check it yourself:

```bash
qsm-statusline doctor
echo '{}' | qsm-statusline render --no-color
```

To remove it, delete the `statusLine` key and restart Claude Code.

## Caveats

- The first render in a directory has no git segment. It appears on the next frame.
- The limit bars need a subscription. Without one the line is two rows.
- Claude Code reads the status line once at startup, so every change needs a restart.
