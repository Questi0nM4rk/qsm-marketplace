## ADDED Requirements

### Requirement: Stress and variant skills test a UI piece against worst cases and alternatives

The plugin SHALL provide break-ui and prototype, adapted from emilkowalski/skills (MIT) under his
names. break-ui SHALL feed a UI piece worst-case data (long and unbreakable strings, one-letter
names, missing fields, huge counts, zero items, non-Latin script, emoji, extreme numbers), SHALL
render it behind a toggle between demo and worst-case data, and SHALL report every break with its
fix. prototype SHALL build several genuinely different versions of one UI piece behind a switcher
and SHALL fire only when invoked. Both SHALL say how the toggle or switcher is built on Quickshell
QML, CSS/React, and TUI, and SHALL fit 12 KB with no extra file.

#### Scenario: A bar module meets a long window title

- **WHEN** break-ui runs on a Quickshell bar module that shows the active window title
- **THEN** it SHALL feed a title longer than the module's width and an empty title, and SHALL
  report whether the text elides and whether the bar's layout holds

#### Scenario: prototype is not asked for

- **WHEN** the user asks to build one UI piece without asking for variants
- **THEN** prototype SHALL NOT fire
