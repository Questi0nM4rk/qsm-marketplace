## Why

No qsm-uix skill feeds a UI worst-case data, so a bar that breaks on a long window title or a
panel that breaks on an empty list ships unnoticed; ux-audit only drives bad form input. And no
skill builds several variants of a piece to compare. Emil Kowalski's break-ui and prototype
(github.com/emilkowalski/skills, MIT, commit 2d22863) do both, and the person chose his skills as
qsm-uix's source of truth (epic qsm-d0c).

## What Changes

- break-ui, under his name: feeds a UI piece worst-case data (long names, unbreakable strings,
  one-letter names, missing fields, huge counts, zero items, non-Latin text, emoji, extreme
  numbers), shows it behind a demo / worst-case toggle, and reports each break with its fix.
- prototype, under his name: builds several genuinely different versions of one UI piece behind a
  switcher and promotes the chosen one. Fires only when invoked.
- Both name no stack syntax: they say what the toggle or switcher is and point to the families that
  build it (desktop-ui, qml-ui, cli-ui, tui-ui, web-harness).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `qsm-uix`: adds the stress and variants requirement.

## Impact

- `plugins/qsm-uix/skills/break-ui/SKILL.md`, `skills/prototype/SKILL.md`: new; the toggle and fix
  forms land in `skills/{desktop-ui,qml-ui,cli-ui,tui-ui,web-harness}/SKILL.md`.
- `plugins/qsm-uix/evals/`: a fire case each; README list.

## Critiques

- Devil's advocate: a QML shell has no browser toggle. Fixed: qml-ui builds the
  toggle as a debug property flipped over IPC, tui-ui as an environment variable, web-harness as a
  component.
- Future archaeologist: why does prototype not trigger on its own? Fixed: his design, kept, named
  in its description.
- Scope sniper: CATALOG.md and PICKER.md are extra files. Fixed: folded or cut to the 12 KB cap.
