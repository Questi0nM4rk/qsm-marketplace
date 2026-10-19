## Why

The person builds one project across Quickshell QML, Hyprland, web CSS/React and TUI, and the
qsm-uix stack skills hold syntax rules but no libraries, conventions or tips from the people who
know each stack best. Emil Kowalski's mobile-native and pick-ui-library (MIT, commit 2d22863) cover
the web side; a web search found rule sets for the other stacks (epic qsm-d0c).

## What Changes

- mobile-native and pick-ui-library arrive under Emil's names; mobile-native fires only on web
  work and pick-ui-library only when invoked, so they cost no context elsewhere.
- Each family skill gains a short "Libraries" and "Conventions" part, its rules paraphrased from
  the sources below, and the web-only rules of Emil carried over where they apply to the stack
  (the families requirement in uix-families holds the stack assignment):
  - css-ui and react-ui: vercel-labs/web-interface-guidelines (MIT): keyboard, targets, forms,
    URL state.
  - qml-ui: Qt's QML coding conventions and TheQtCompanyRnD/agent-skills qt-qml-review (BSD-3).
  - desktop-ui: desktop layout, navigation and feedback rules paraphrased from the KDE and GNOME
    HIGs (CC-BY-SA-4.0, paraphrase only), and the Hyprland wiki (BSD-3).
  - cli-ui: clig.dev (CC-BY-SA-4.0, paraphrase only).
  - tui-ui: pageton/tui-design-skill (MIT) for bubbletea, ink, ratatui and textual.
- Where a source contradicts Emil (ibelick/ui-skills: never add animation unless asked), Emil wins
  and the source is not used for that rule.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `qsm-uix`: a web-only skills requirement is added. The stack skills requirement is modified once,
  in uix-families.

## Impact

- `plugins/qsm-uix/skills/{css-ui,react-ui,qml-ui,desktop-ui,cli-ui,tui-ui}/SKILL.md`: sections
  added.
- `plugins/qsm-uix/skills/{mobile-native,pick-ui-library}/SKILL.md`: new.
- `plugins/qsm-uix/evals/`: a fire case each for the two new skills, plus a negative case that
  pick-ui-library does not fire on a QML task.

## Critiques

- Devil's advocate: CC-BY-SA text copied into an MIT repository would carry share-alike. Fixed:
  HIG and clig.dev rules are paraphrased in our words and the source named, never copied.
- Future archaeologist: why are KDE and GNOME rules in desktop-ui? Fixed: the design says
  desktop-ui owns what a shell surface is and does, and ui-design stays stack-neutral.
- Scope sniper: pageton's skill is 25 KB and tui-ui is 7.7 KB. Fixed: only rules a TUI breaks
  without (resize, colour fallback, keybinding display, layout by width) are taken.
