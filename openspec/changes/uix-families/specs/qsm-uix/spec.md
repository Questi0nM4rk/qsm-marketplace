## ADDED Requirements

### Requirement: Each UI family owns its stack and the general skills stay general

The plugin SHALL group its stack skills into three families: desktop (desktop-ui for shell surfaces,
Hyprland config and desktop rules; qml-ui for QML code and layer-shell mechanics: tokens, exclusive
zone, per-output windows, scale, Accessible and the gates), terminal (cli-ui for commands that print
and exit; tui-ui for full-screen interactive programs), and web (css-ui, react-ui, mobile-native,
pick-ui-library, web-motion for motion on a page, web-harness for the break-ui toggle and the
prototype picker). A family skill SHALL hold its stack's syntax, libraries and design rules, taken
as the strictest rule its named sources give; libraries live in qml-ui for desktop and in cli-ui and
tui-ui for terminal, and the web list in pick-ui-library. The general skills (ui-design, ui-audit,
ux-audit, a11y-audit, a11y-conformance, the motion skills, break-ui, prototype, apple-design) SHALL
hold principles and values only and SHALL point to the family skills for stack syntax.

#### Scenario: A TUI task loads no desktop or web syntax

- **WHEN** the user asks for a keybinding bar in a ratatui program
- **THEN** tui-ui SHALL answer with terminal rules, and no general skill loaded on the way SHALL
  carry QML, Hyprland or CSS syntax

#### Scenario: A secret reaches a command

- **WHEN** a command needs a token
- **THEN** cli-ui SHALL read it from a file, stdin or the credential store, and SHALL NOT accept
  it as a flag or an environment variable

#### Scenario: A destructive action in a shell surface

- **WHEN** a popout offers an action that deletes data
- **THEN** desktop-ui SHALL require undo when the action can be undone, and a confirm naming the
  verb only when it cannot

#### Scenario: A hover popout holds an action

- **WHEN** a bar module opens a popout on hover
- **THEN** desktop-ui SHALL require every action and fact in it to be reachable by click and by
  keyboard as well

## MODIFIED Requirements

### Requirement: Stack skills build on their stack and expose it to the audits

The plugin SHALL provide stack skills, grouped into the three families above, each triggered by
building or fixing a UI on its stack: desktop-ui (shell surfaces, the KDE and GNOME human interface
guidelines, Hyprland config), qml-ui (Quickshell and QML on Hyprland), cli-ui (commands that print
and exit, per clig.dev), tui-ui (full-screen terminal programs), css-ui (framework-free CSS and
HTML, Tailwind as a short section), and react-ui (React components). Each SHALL implement the design
source's tokens on its stack, SHALL say how to expose geometry and state so the audits can measure
it (an item-tree dump for QML, the DOM and its accessibility tree for web, none for a terminal), and
SHALL point to the core skills for the reasons instead of restating them. react-ui SHALL cover only
what React leaves to the author (focus, announcements, forms, loading, URL state, hydration,
feedback, gestures, a virtualisation pointer, layout reads in render) and point to css-ui for the
CSS half. Each SHALL name the maintained libraries for its stack (css-ui and react-ui by pointing to
pick-ui-library, the one owner of the web list) and SHALL carry its stack's conventions, paraphrased
from named sources: the Vercel web interface guidelines for css-ui and react-ui; Qt's QML coding
conventions and the qt-qml-review rules for qml-ui; the KDE and GNOME guidelines and the Hyprland
wiki for desktop-ui (the one owner of the Hyprland animation syntax); clig.dev for cli-ui; the
tui-design rules for tui-ui. Text under a share-alike licence SHALL be paraphrased, never copied. A
stack skill SHALL NOT contain audit procedure; it MAY state the numbers a builder must hit (target
size, contrast ratio, focus ring) and points to the core skills for criteria and design-system
content.

#### Scenario: Building a QML panel

- **WHEN** the user asks for a Quickshell panel or popout
- **THEN** qml-ui SHALL take colours, spacing and radius from the Theme singleton and durations and
  curves from the Motion singleton when the shell has one, else from Theme, and not from literals,
  and SHALL name qmllint and qmlformat as the gate

#### Scenario: A CLI prints to a pipe

- **WHEN** the user asks for coloured or progress output from a command line tool
- **THEN** cli-ui SHALL require the non-TTY and NO_COLOR fallback, and SHALL delegate the result
  envelope and exit codes to the outcome system instead of redefining them

#### Scenario: A TUI list needs a library

- **WHEN** the user asks for an interactive list in a terminal tool
- **THEN** tui-ui SHALL name the maintained library for the project's language before writing a
  hand-rolled one
