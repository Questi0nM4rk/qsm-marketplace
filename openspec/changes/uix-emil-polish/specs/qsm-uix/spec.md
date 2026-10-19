## ADDED Requirements

### Requirement: Apple design skill carries interface foundations for every stack

The plugin SHALL provide apple-design, adapted from emilkowalski/skills (MIT) under his name:
Apple's interface foundations (feedback, spatial consistency, materials and depth, typography by
optical size, tracking and leading, reduced motion), with no stack syntax. It SHALL point to
animate for curves, durations and springs, to the families for how each foundation lands on a stack
(desktop-ui, qml-ui, cli-ui, tui-ui, css-ui, react-ui), and SHALL fit 12 KB with no extra file.

#### Scenario: A translucent panel is designed

- **WHEN** the user asks for a translucent or blurred panel on Hyprland
- **THEN** apple-design SHALL give the material and depth rule and SHALL point to desktop-ui,
  which holds how it lands as the Hyprland blur setting (a shell surface's blur set at runtime and
  never as a standing layer rule) and as the QML surface's colour and opacity

## MODIFIED Requirements

### Requirement: UI design skill produces a stack-neutral design source

The plugin SHALL trigger the ui-design skill when asked to design, specify, or restyle a UI before
it is built: choosing a look, defining colours, spacing, or typography, setting up dark mode, or
writing a design system. The skill SHALL produce one design source: tokens with fill and on-pair
colours, scales for spacing, type, radius, elevation, layer order, icon size, motion, and density,
light and dark themes designed separately, a style stated as a constraint set with the
accessibility requirements it brings, and a master with per-surface overrides in which the
override wins. It SHALL carry the polish rules of emilkowalski/skills emil-design-eng (pressed
states, hover only for a fine hovering pointer, tooltip delay, popover origin, defaults over
options, one component personality) and the shadow-over-solid-border rule of emilkowalski/skills
README.md as its own rules, and SHALL state the wait values (no busy indicator under 150 to 300 ms,
feedback over 1 s, an indicator kept at least 300 to 500 ms, a progress bar with a count past about
10 s when the length is known), the icon rule (alone only where everyone reads it the same, never
icon and label on one button) and the touch target (44 px on touch, 24 px as the WCAG 2.5.8 floor)
as its own rules. It SHALL
put accessibility first among the concerns it orders. It SHALL NOT ship
palettes, font pairings, or style catalogues, SHALL NOT name a framework, and SHALL NOT audit a
running UI.

#### Scenario: A spacing or type scale is chosen

- **WHEN** ui-design defines the product's spacing and typography
- **THEN** it SHALL use the existing design source or name the adopted system, and SHALL treat
  numeric examples from other systems as choices rather than universal requirements

#### Scenario: A colour is defined without its on-pair

- **WHEN** the design source defines a fill colour
- **THEN** it SHALL define the on-pair that sits on it in both themes, and SHALL state the contrast
  ratio the pair reaches, so the pair is checked and not the single colour

#### Scenario: Dark theme requested

- **WHEN** the design asks for a dark theme
- **THEN** the skill SHALL design the dark values as their own column, not as an inversion of the
  light ones, and SHALL require borders, dividers, and states to be visible in both

#### Scenario: A card is separated from its background

- **WHEN** the design separates a raised surface from what is under it
- **THEN** the skill SHALL use a semi-transparent shadow by the rule in emilkowalski/skills
  README.md, not a solid opaque border, and in a dark theme SHALL add a 1 px low-alpha light edge
  to an overlay, never an opaque one
