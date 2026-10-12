# qsm-uix Specification

## Purpose

qsm-uix designs and verifies user interfaces: a stack-neutral design source (ui-design), measured
audits against it (ui-audit, ux-audit, a11y-audit with a11y-conformance), stack skills that build
it correctly (qml-ui, css-ui, react-ui, tui-ui), a capture kit that supplies the measurements, and
a visualizer that renders findings for a human.

The skills hand off in one direction. ui-design produces the design source; the audits and the
stack skills read it. a11y-audit owns every accessibility criterion, so ui-audit and ux-audit point
to it instead of repeating one. A stack skill owns the how-to on its stack and points back to the
core skill for the why. Terms (design source, token, on-pair, theme parity, introspection surface)
mean one thing in every skill.

## Requirements

### Requirement: UI design skill produces a stack-neutral design source

The plugin SHALL trigger the ui-design skill when asked to design, specify, or restyle a UI before
it is built: choosing a look, defining colours, spacing, or typography, setting up dark mode, or
writing a design system. The skill SHALL produce one design source: tokens with fill and on-pair
colours, scales for spacing, type, radius, elevation, layer order, icon size, motion, and density,
light and dark themes designed separately, a style stated as a constraint set with the
accessibility requirements it brings, and a master with per-surface overrides in which the
override wins. It SHALL put accessibility first among the concerns it orders. It SHALL NOT ship
palettes, font pairings, or style catalogues, SHALL NOT name a framework, and SHALL NOT audit a
running UI.

#### Scenario: A colour is defined without its on-pair

- **WHEN** the design source defines a fill colour
- **THEN** it SHALL define the on-pair that sits on it in both themes, and SHALL state the contrast
  ratio the pair reaches, so the pair is checked and not the single colour

#### Scenario: Dark theme requested

- **WHEN** the design asks for a dark theme
- **THEN** the skill SHALL design the dark values as their own column, not as an inversion of the
  light ones, and SHALL require borders, dividers, and states to be visible in both

### Requirement: UI audit skill reports measured visual findings

The plugin SHALL trigger the ui-audit skill when asked to audit, review, or critique the static
visual design of a UI: layout, spacing, geometry, colour, contrast, typography, iconography,
elevation and layer order, reserved space, theme and variant parity, or multi-monitor consistency.
The skill SHALL require measured evidence, a captured image, live UI geometry from an
introspection surface, and a design source, before filing any finding, and SHALL NOT file a finding
based on visual impression alone. It SHALL cite WCAG 2.2 for contrast and non-text contrast. It
SHALL leave motion to ux-audit and every other accessibility criterion to a11y-audit, pointing to
them. It SHALL output one severity-ranked findings table (blocker, major, minor, polish), a
separate Hypotheses list, and a Not examined list.

#### Scenario: No live geometry source is reachable

- **WHEN** the UI exposes no introspection surface to read real item geometry
- **THEN** the skill SHALL state this explicitly and file any geometry claim under Hypotheses,
  never as a measured finding

#### Scenario: Two design sources disagree

- **WHEN** a spec and the live UI imply different expected values for the same element
- **THEN** the skill SHALL file one finding citing both sources, tagged source-conflict, and SHALL
  NOT silently prefer one

#### Scenario: A UI has a light and a dark theme

- **WHEN** the audited UI ships more than one theme or variant
- **THEN** the skill SHALL capture each, run the same checks on each, and file a theme-parity
  finding for any border, divider, or state visible in one and not the other

### Requirement: UX audit skill reports measured interaction findings

The plugin SHALL trigger the ux-audit skill when asked to evaluate how a UI behaves or feels:
discoverability, affordance and feedback, target ergonomics, mode and state visibility,
interruption cost, gesture-vocabulary consistency, motion, reversibility, error recovery, or forms.
The skill SHALL require an enumerated state-space map and traced interactions as evidence, and
SHALL NOT judge behaviour from a single resting screenshot. It SHALL own all motion: timing,
meaning, interruptibility, and exit against enter. It SHALL point to a11y-audit for the
keyboard-only path, focus, and reduced-motion criteria. It SHALL output one severity-ranked
findings table, a Needs human trial list carrying the exact trial to run, and a Not examined list.

#### Scenario: A hidden surface was never opened

- **WHEN** the audit has not driven a surface into the state a discoverability claim is about
- **THEN** the skill SHALL NOT file that claim as a finding

#### Scenario: An interaction needs a live hand

- **WHEN** an interaction requires real hover, drag, or touch input the audit cannot synthesize
- **THEN** the skill SHALL list it under Needs human trial with the trial script, never skip it
  silently

#### Scenario: A destructive action has no way back

- **WHEN** a traced action destroys user data and the UI offers neither undo nor a confirmation
- **THEN** the skill SHALL file a reversibility finding naming the action and the missing recovery
  path

### Requirement: Accessibility audit skill reports a per-criterion conformance table

The plugin SHALL trigger the a11y-audit skill when asked whether a UI is accessible, usable
without a mouse, readable by a screen reader, or compliant with WCAG or the European Accessibility
Act. The skill SHALL drive the keyboard-only path, check focus visible and not obscured, read name,
role, and state from the platform accessibility tree (AT-SPI or the DOM), check that colour is
never the only carrier of meaning, and test reduced motion. It SHALL output a conformance table
with one row per WCAG 2.2 AA criterion with the verdict pass, fail, not applicable, or not tested,
and the evidence, and SHALL NOT mark a criterion pass without evidence. It SHALL take criteria and
legal status from a11y-conformance and SHALL NOT restate them.

#### Scenario: Keyboard-only path cannot reach a control

- **WHEN** the audit drives the UI with the keyboard alone and a control cannot be reached or
  operated
- **THEN** the skill SHALL file a fail on the matching criterion with the key sequence tried

#### Scenario: No accessibility tree is reachable

- **WHEN** the UI exposes no platform accessibility tree
- **THEN** the skill SHALL mark name, role, and state criteria not tested and say so in the first
  line of the reply, never pass them from the screenshot

### Requirement: Accessibility conformance skill states criteria and law

The plugin SHALL trigger the a11y-conformance skill when asked which accessibility criteria apply,
what the law requires, or whether a gap is covered by the European Accessibility Act: WCAG 2.2 AA
success criteria, the Act, and EN 301 549. The skill SHALL list each A and AA criterion with its
number, level, and the test that decides it (the pointer and motion criteria 2.5.1 to 2.5.4
included), and SHALL state the legal chain without overclaiming: Annex I of the Act (Directive (EU)
2019/882) is functional and names no WCAG number; EN 301 549 V3.2.1 maps WCAG 2.1; its citation in
the Official Journal under the Directive is unconfirmed; so the six criteria new in 2.2 and at A or
AA (2.4.11, 2.5.7, 2.5.8, 3.2.6, 3.3.7, 3.3.8) are not in it. It SHALL never call a criterion
"legally enforceable" as a fact, name who the Act covers and who it exempts, SHALL NOT run an audit
and SHALL NOT give legal advice beyond the mapping; a case that turns on the law's reading goes to
a lawyer.

#### Scenario: A criterion is asked about by number

- **WHEN** the user asks about a criterion such as 2.5.8 or 2.4.11
- **THEN** the skill SHALL answer with the criterion's level, the test that decides it, and whether
  EN 301 549 V3.2.1 carries it

### Requirement: Stack skills build on their stack and expose it to the audits

The plugin SHALL provide four stack skills, each triggered by building or fixing a UI on its stack:
qml-ui (Quickshell and QML on Hyprland), css-ui (framework-free CSS and HTML, Tailwind as a short
section), react-ui (React components), and tui-ui (terminal output). Each SHALL implement the design
source's tokens on its stack, SHALL say how to expose geometry and state so the audits can measure
it (an item-tree dump for QML, the DOM and its accessibility tree for web, none for a terminal), and
SHALL point to the core skills for the reasons instead of restating them. react-ui SHALL cover only
what React leaves to the author (focus, announcements, forms, loading) and point to css-ui for the
CSS half. A stack skill SHALL NOT contain audit procedure, criteria, or design-system content.

#### Scenario: Building a QML panel

- **WHEN** the user asks for a Quickshell panel or popout
- **THEN** qml-ui SHALL take colours, spacing, radius, and motion from the Theme singleton and not
  from literals, and SHALL name qmllint and qmlformat as the gate

#### Scenario: A CLI prints to a pipe

- **WHEN** the user asks for coloured or progress output from a command line tool
- **THEN** tui-ui SHALL require the non-TTY and NO_COLOR fallback, and SHALL delegate the result
  envelope and exit codes to the outcome system instead of redefining them

### Requirement: Capture kit supplies the measured evidence on demand

The plugin SHALL provide a capture command with one verb each for a full-monitor screenshot, a
zoomed crop of a region, a similarity diff between two captures, a timed burst of frames, a
single-pixel color sample, a WCAG contrast ratio between two pixels, and region color and
brightness statistics. Each verb SHALL answer with its whole result as the outcome's data, printed
as one envelope under `--json`. Every failure SHALL carry a distinct outcome code per cause: a call
written wrong, a required external capture or image tool missing from PATH, and any other capture
failure SHALL each be distinguishable from one another, and none SHALL print a result.

#### Scenario: A required external tool is missing

- **WHEN** the screenshot, crop, or diff verb runs and its underlying capture or image tool is
  absent from PATH
- **THEN** the command SHALL report the prerequisite missing, naming that tool, and print no result

#### Scenario: Doctor names a missing key sender or a silent accessibility bus

- **WHEN** `wtype` is absent from PATH, or the AT-SPI address does not answer a call on the registry
  root
- **THEN** the verdict SHALL be `missing`, exit 4, naming `sudo pacman -S wtype` or `systemctl
  --user restart at-spi-dbus-bus.service`

#### Scenario: The accessibility tree is read with the a11y-tree verb

- **WHEN** a user runs `qsm-uix a11y-tree <app>`
- **THEN** it SHALL print each node's indent, role, name, and focused, focusable and showing states
  for that application, `failed` when no application matches

#### Scenario: Doctor names a missing external tool

- **WHEN** a user runs `qsm-uix doctor` and the screenshot or image tool is absent from PATH
- **THEN** the verdict SHALL be `missing`, exit 4, naming that tool and the package that installs
  it

#### Scenario: An unrecognized verb is given

- **WHEN** the capture command is invoked with a verb it does not implement
- **THEN** the command SHALL report a usage error with a line listing the valid verbs, and print no
  result

### Requirement: Visualizer agent

The plugin SHALL provide an agent that renders structured data (a research summary, an audit
finding set, a comparison table, a diff, a dashboard) as a single self-contained interactive HTML
file with sortable tables, collapsible sections, filters, and search, and SHALL return the saved
file's path rather than inlining the rendering. For a non-technical audience it SHALL write plain
language with an honest status per flow.

#### Scenario: Rendering a comparison for a human reader

- **WHEN** an agent is about to present structured, multi-section, or comparison data to the user
- **THEN** the visualizer SHALL save one self-contained HTML file and return its path instead of
  the data being pasted into chat
