## ADDED Requirements

### Requirement: Motion skills build and judge animation to one craft bar

The plugin SHALL provide six motion skills adapted from emilkowalski/skills (MIT) under his names:
animate (build one animation), review-animations (judge motion code, default to flagging),
improve-animations (survey a codebase's motion and write prioritized plans, never edits source),
find-animation-opportunities (propose motion where it helps and reject the rest, read-only),
animation-vocabulary (turn a vague description into the exact term), and animation-performance
(keep motion inside the frame budget). Each SHALL state its rules once with their values, SHALL name
no stack syntax, and SHALL end with a pointer to the families that write each rule on a stack:
desktop (desktop-ui, qml-ui), terminal (cli-ui, tui-ui), web (css-ui, react-ui, web-motion).
Each SHALL fit 12 KB with no extra file and SHALL name its source
file and licence.

#### Scenario: An enter animation is built

- **WHEN** the user asks to animate a popout, dropdown, or panel opening on any stack
- **THEN** animate SHALL pick an ease-out curve, a duration under 300 ms, transform and opacity
  only, a start from a scale near 0.95 and never from 0, and SHALL leave writing the curve to the
  family skill of the stack (desktop-ui, tui-ui, web-motion), which holds it in the stack's form

#### Scenario: A keyboard action is animated

- **WHEN** motion code animates an action started from the keyboard or repeated many times a day
- **THEN** review-animations SHALL flag it and SHALL recommend no animation

#### Scenario: Motion on a terminal

- **WHEN** motion is asked about a TUI or a command's output
- **THEN** tui-ui and cli-ui SHALL give only the rules that apply to a redraw-based surface
  (spinner cadence, no animation on a pipe) and SHALL say the rest do not apply

## MODIFIED Requirements

### Requirement: UI audit skill reports measured visual findings

The plugin SHALL trigger the ui-audit skill when asked to audit, review, or critique the static
visual design of a UI: layout, spacing, geometry, colour, contrast, typography, iconography,
elevation and layer order, reserved space, theme and variant parity, or multi-monitor consistency.
The skill SHALL require measured evidence, a captured image, live UI geometry from an
introspection surface, and a design source, before filing any finding, and SHALL NOT file a finding
based on visual impression alone. It SHALL cite WCAG 2.2 for contrast and non-text contrast. It
SHALL leave motion to review-animations and every other accessibility criterion to a11y-audit,
pointing to
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
interruption cost, gesture-vocabulary consistency, reversibility, error recovery, or forms.
The skill SHALL require an enumerated state-space map and traced interactions as evidence, and
SHALL NOT judge behaviour from a single resting screenshot. It SHALL hand every motion
judgement to review-animations and SHALL NOT judge timing, curve, or interruption itself. It SHALL
point to a11y-audit for the
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
