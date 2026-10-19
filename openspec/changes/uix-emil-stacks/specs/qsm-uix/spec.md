## ADDED Requirements

### Requirement: Web-only skills fire only on web and React work

The plugin SHALL provide mobile-native and pick-ui-library, adapted from emilkowalski/skills (MIT)
under his names. mobile-native SHALL make a web app feel native on a phone (hover on touch, tap
highlight, viewport height, input zoom, safe areas, scroll behaviour). pick-ui-library SHALL pick a
maintained library for a React or web task instead of a hand-rolled one, and SHALL fire only when
invoked. Their descriptions SHALL name web or React first, so neither fires on QML, Hyprland, or TUI
work. Each SHALL fit 12 KB with no extra file and SHALL name its source and licence.

#### Scenario: A QML task does not load a web skill

- **WHEN** the user asks for a Quickshell popout
- **THEN** neither mobile-native nor pick-ui-library SHALL fire

## MODIFIED Requirements

### Requirement: Stack skills build on their stack and expose it to the audits

The plugin SHALL provide stack skills, grouped into the families of uix-families, each triggered by
building or fixing a UI on its stack: qml-ui (Quickshell and QML on Hyprland), css-ui
(framework-free CSS and HTML, Tailwind as a short section), react-ui (React components), and tui-ui
(terminal programs). Each SHALL implement the design
source's tokens on its stack, SHALL say how to expose geometry and state so the audits can measure
it (an item-tree dump for QML, the DOM and its accessibility tree for web, none for a terminal), and
SHALL point to the core skills for the reasons instead of restating them. react-ui SHALL cover only
what React leaves to the author (focus, announcements, forms, loading, URL state, hydration,
feedback, gestures) and
point to css-ui for the
CSS half. Each SHALL name the maintained libraries for its stack (css-ui and react-ui by pointing to
pick-ui-library, the one owner of the web list) and SHALL carry its stack's
conventions, paraphrased from named sources: the Vercel web interface guidelines for css-ui and
react-ui; Qt's QML coding conventions, the qt-qml-review rules, a pointer to desktop-ui
(the one owner of the Hyprland animation syntax), and KDE and GNOME desktop rules for
qml-ui; the tui-design rules and clig.dev for tui-ui. Text under a share-alike licence SHALL be
paraphrased, never copied. A stack skill SHALL NOT contain audit procedure; it MAY state the
numbers a builder must hit (target size, contrast ratio, focus ring) and points to the core skills
for criteria and design-system content.

#### Scenario: Building a QML panel

- **WHEN** the user asks for a Quickshell panel or popout
- **THEN** qml-ui SHALL take colours, spacing and radius from the Theme singleton and durations and
  curves from the Motion singleton when the shell has one, else from Theme, and not from
  literals, and SHALL name qmllint and qmlformat as the gate

#### Scenario: A CLI prints to a pipe

- **WHEN** the user asks for coloured or progress output from a command line tool
- **THEN** cli-ui SHALL require the non-TTY and NO_COLOR fallback, and SHALL delegate the result
  envelope and exit codes to the outcome system instead of redefining them

#### Scenario: A TUI list needs a library

- **WHEN** the user asks for an interactive list in a terminal tool
- **THEN** tui-ui SHALL name the maintained library for the project's language before writing a
  hand-rolled one
