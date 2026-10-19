## ADDED Requirements

### Requirement: Apple design skill carries interface foundations for every stack

The plugin SHALL provide apple-design, adapted from emilkowalski/skills (MIT) under his name: Apple's
interface foundations (feedback, spatial consistency, materials and depth, typography by optical
size, tracking and leading, reduced motion) translated for Quickshell QML, Hyprland, CSS/React and
TUI where they apply. It SHALL point to animate for curves, durations and springs, and SHALL fit
12 KB with no extra file.

#### Scenario: A translucent panel is designed

- **WHEN** the user asks for a translucent or blurred panel on Hyprland
- **THEN** apple-design SHALL give the material and depth rule and SHALL say how it lands as
  Hyprland blur and layer rules and as the QML surface's colour and opacity

## MODIFIED Requirements

### Requirement: UI design skill produces a stack-neutral design source

The plugin SHALL trigger the ui-design skill when asked to design, specify, or restyle a UI before
it is built: choosing a look, defining colours, spacing, or typography, setting up dark mode, or
writing a design system. The skill SHALL produce one design source: tokens with fill and on-pair
colours, scales for spacing, type, radius, elevation, layer order, icon size, motion, and density,
light and dark themes designed separately, a style stated as a constraint set with the
accessibility requirements it brings, and a master with per-surface overrides in which the
override wins. It SHALL carry the polish rules of emilkowalski/skills emil-design-eng (pressed states, hover only on hover-capable pointers, tooltip delay, popover origin, defaults over options, one component personality) and the README's shadow-over-solid-border rule as its own rules. It SHALL put accessibility first among the concerns it orders. It SHALL NOT ship
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


#### Scenario: A card is separated from its background

- **WHEN** the design separates a raised surface from what is under it
- **THEN** the skill SHALL use a semi-transparent shadow or a low-alpha border by his README's rule, not a
  solid opaque border
