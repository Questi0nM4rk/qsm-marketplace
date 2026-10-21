# qsm-compuse

Sudo-free control of the real cursor, keyboard and screen on a live Hyprland session, for the
person who has an agent audit or exercise a desktop UI that only exists in a running compositor.

## Why it exists

An agent that checks a shell UI through its own dispatchers gets silent wrong answers: a
compositor warp emits no motion event so hover never fires, and an injected shortcut skips the
keybind table. qsm-compuse sends everything that must look like input through real input events
and reads the compositor only to confirm where the pointer landed, so a "no reaction" means the
UI did not react. It refuses to be a test framework, a screenshot judge or a general
remote-desktop tool; it only drives. When the compositor exposes a pointer and key injection
that observes the same input path, this plugin has no reason to exist.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Bin | `drive` | move, click, type, key, scroll, shot, mons, until, doctor |
| Skill | `compuse` | when to drive the real screen and the rules that keep the result true |

Setup and the measured traps are in `USAGE.md`; install is in `INSTALL.md`.
