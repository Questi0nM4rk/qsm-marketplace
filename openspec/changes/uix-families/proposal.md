## Why

A terminal, a desktop shell and a web page are three UI systems with their own rules: a TUI has
no hover and no pixels, a Hyprland shell has layer surfaces and a compositor, a web page has a
browser. qsm-uix mixes them: every general skill carries an "On each stack" section, so a TUI
task loads QML and CSS syntax and a desktop task loads terminal rules. The person wants the
strictest, most polished and modern rules per family, each family kept apart, and only general
UI/UX knowledge in the general skills (epic qsm-d0c).

## What Changes

- Three families, each owning its stack's syntax, libraries and design rules:
  - desktop: qml-ui (QML code, the Qt review checklist) and a new desktop-ui (shell surfaces: bar,
    popout, OSD, notifications, tray, launcher; Hyprland config for animation, blur and layer
    rules; desktop rules from the KDE and GNOME HIGs).
  - terminal: a new cli-ui (command output: streams, colour, exit codes, errors, signals, per
    clig.dev) and tui-ui narrowed to full-screen interactive apps (frameworks, keys, layout).
  - web: css-ui, react-ui, mobile-native, pick-ui-library, and two new skills for the web lines
    the general skills held: web-motion (motion) and web-harness (break-ui toggle, picker).
- **BREAKING** The general skills (ui-design, the audits, a11y, the motion skills, break-ui,
  prototype, apple-design) keep principles and values only; their per-stack sections move into
  the family skills, and they point to the family by name.
- Decisions taken by the person, written as rules: no secret in a flag or environment variable;
  hover may open a surface but everything in it is reachable by click and keyboard; undo first,
  a confirm naming the verb only when undo is impossible; feedback from 1 s, a progress bar with
  a count past about 10 s when the length is known; a dark overlay gets a soft shadow plus a
  1 px low-alpha light edge; an icon alone only where everyone reads it the same, never icon and
  label on one button.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `qsm-uix`: adds the families requirement; the motion, apple-design and stress requirements
  point to the families instead of carrying stack syntax.

## Impact

- New: `plugins/qsm-uix/skills/desktop-ui/SKILL.md`, `plugins/qsm-uix/skills/cli-ui/SKILL.md`.
- Changed: qml-ui, tui-ui, css-ui, react-ui, and every general skill with an "On each stack"
  section; plugins/qsm-uix/README.md.
- Sources: the digests of the Qt review checklist, the KDE and GNOME HIGs, clig.dev and the TUI
  skills, kept under the session scratchpad and cited by repository path in each skill.

## Critiques

- Devil's advocate: moving per-stack lines out of animate means an agent building a QML popout
  must load two skills. Fixed: the family skill holds the whole stack form of each motion rule,
  so the agent loads the family skill and reads values from animate only when it judges them.
- Future archaeologist: why two terminal skills? Fixed: design names the cut (a command that
  prints and exits versus a program that owns the screen), which is the cut clig.dev and the TUI
  frameworks make themselves.
- Scope sniper: Reddit gave no rules. Waived: it stays out; only sourced rules enter.
