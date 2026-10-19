---
name: ui-design
description: "Use when a UI is to be designed, specified, or restyled before it is built: choosing colours, spacing, type or a look, setting up dark mode, writing down what two products must share, or deciding what a new panel, page, or CLI output should follow. Triggers: design the UI, decide colours and spacing, dark mode, design tokens, style guide, make it look like the rest, same look on web and desktop, navrhni vzhled, design system, jak ma vypadat. Writes the design source that builds and audits read. Measuring a running UI is ui-audit and ux-audit; accessibility criteria are a11y-audit; syntax is the family skills."
---

# UI Design

A UI built from taste drifts: components choose their own greys, gaps and dark values. This skill
serves the person who builds accessible interfaces. It writes one design source before the first
component, for builders to follow and audits to measure. It chooses constraints, not palettes,
font pairings or frameworks; the maintainer picks the hues. It does not audit a running UI.

## Decide in this order

Work top-down, because a late concern costs a rebuild and an early one costs a sentence.

1. **Accessibility floor.** What every user must be able to do (keyboard only, screen reader,
   reduced motion, larger text, no reliance on colour). It goes into `## Requirements` first, so
   every later choice is made inside it.
2. **Interaction.** The one primary action per surface, how states read, target sizes, feedback.
3. **Tokens and scales.** The values everything traces to.
4. **Layout and hierarchy.** Grouping, rhythm, reserved space.
5. **Style.** The look, last, because it is the cheapest to change and the easiest to argue about.

## Detect before you ask

Find the existing design folder, theme, tokens or screenshot before assuming a stack. Read and
extend an existing design source, never regenerate it. Ask only what changes it: surfaces,
audience, fixed brand colours. Keep the source stack-neutral and mark assumptions in the draft,
so the person can correct concrete tokens, pairs and ratios rather than a questionnaire.

## The design source

One markdown set: `design/MASTER.md` for everything global, `design/pages/<surface>.md` for what
one surface changes. The page file wins on conflict, so a surface can differ without forking the
master. Read both before editing either, and never overwrite a file the person wrote without
their say-so, because the source is their decision record, not output.

Use these headings, because the audits and the stack skills look for them:

| Heading | Holds |
| --- | --- |
| `## Tokens` | name, light, dark, role. Roles, not hues: `surface`, `primary`, `danger`, `border` |
| `## Pairs` | fill, on-fill, ratio in light, ratio in dark |
| `## Scales` | space, type, radius, elevation, layer, icon size, motion, density |
| `## Style` | constraints, the requirements it brings, do not use for |
| `## Requirements` | the accessibility floor the source commits to |

## Rules

- **Every colour is a token, and a fill token never travels alone.** Define `primary` with
  `on-primary` and record the ratio per theme: 4.5 for text, 3 for large text, icons, control
  borders and focus indicators (WCAG 1.4.3, 1.4.11). Why: contrast belongs to a pair, so a colour
  checked alone is checked against nothing. Compute the ratio with the WCAG relative-luminance
  formula, never estimate it (`qsm-uix contrast` reads pixels of an image, so it verifies the built
  pair later).
- **Design each theme on its own column.** Write dark values by choosing them against dark
  surfaces, then check them; an inverted light palette fails because shadows vanish, saturated
  fills glare, and light borders turn into holes. Parity means every pair passes in each theme
  and a border, divider, or state visible in one is visible in the other. High contrast, if
  wanted, is a third column.
- **Every dimension is a scale, and a component picks a step.** Use the product's spacing and type
  scales, naming the adopted system. Carbon's 2/4/8 spacing multiples and Modular Scale's 1.125
  major-second ratio are choices, not universal floors; USWDS uses non-geometric type steps.
  Define one set each for radius, elevation, layer (z-order), icon size, motion and density. Why: a
  literal in a component is a decision nobody reviewed, and a scale is how one change reaches
  every surface. Density is an axis of the scale (compact, regular), not a second design.
- **Every pressable has a pressed state, and no state moves its neighbours.** The press shrinks
  the element to 0.95 to 0.98 of its size at once, as a transform on the pressed state that does
  not change layout bounds (animate owns it); hover, focus and disabled change colour, opacity or
  elevation and keep the box. The focus indicator reaches 3:1 against its neighbours. Why: a
  press with no response feels like the UI did not hear the person, and a scaled press leaves
  layout alone.
- **Hover is for a fine hovering pointer.** A hover effect applies only where the device has one
  (animate and review-animations point here), because a touch screen fires hover on tap and shows
  it as a false positive.
- **A tooltip delays once, then follows at once.** The first waits so a passing pointer does not
  trigger it; while one is open its neighbours show instantly, which makes the whole row feel
  faster without losing the delay's purpose.
- **A popover grows from its trigger, a modal from the centre.** Anchored content that appears
  from nowhere loses the link to what opened it. Curves, durations and springs are `animate`'s,
  checking them is `review-animations`.
- **Defaults carry the design; options are for the few.** Most people never change a setting, so
  the default look, spacing and timing must already be the best the design has.
- **A component's character is one personality.** A professional dashboard is crisp and dense, a
  playful tool may be looser; a rule right in isolation reads wrong beside another character.
- **A raised surface separates by a soft shadow, not a solid border.** A semi-transparent shadow
  reads as depth; an opaque border reads as a box drawn around the content (emilkowalski/skills
  README.md names a solid border over a shadow as an agent mistake). In a dark theme an overlay
  also gets a 1 px low-alpha light edge, because a shadow vanishes on a dark surface, and the edge
  is never opaque. A low-alpha separator on a card is decorative: WCAG 1.4.11 applies to the
  boundaries of controls and inputs, so the 3:1 rule is for those.
- **A wait shows feedback by its length.** No busy indicator under 150 to 300 ms, because a
  flash reads as a glitch (Vercel guidelines README: 150 to 300 ms, and once shown 300 to 500 ms);
  over 1 s always feedback; a progress bar with a count past about 10 s when the length is known.
  The 1 s and 10 s limits are the owner's decision. The families write the form.
- **Handle edge cases where nobody looks.** A hover that must survive the gap between stacked
  items, a timer that pauses when the view is hidden, a drag that continues outside its box.
  These are details nobody notices, and that is what correct looks like.
- **Targets carry a floor.** 44 px on touch (Vercel web-interface-guidelines README); 24 px is
  the WCAG 2.5.8 floor, labelled as such. The source records any override per project with its
  reason, because a threshold silently changed is a regression nobody can find.
- **One primary action per surface.** Secondary actions are visibly subordinate and a destructive
  one is separated and named as such. Why: when two things shout, the user has to decide what
  the design should have decided.
- **Colour is never the only carrier of meaning.** Each status token comes with a word, glyph or
  shape (error is red and says what failed).
- **An icon stands alone only where everyone reads it the same** (close, play, volume), and then
  it has a tooltip and an accessible name; otherwise the control is a text label. Never icon and
  label on one button, because the pair says one thing twice and costs width.
- **A number comes from a named source.** Before choosing a colour, size, offset or duration, name
  the token, reference file or mockup it comes from. With none, show two candidates live and wait
  for the owner's pick; never tune a value from geometry alone, because the owner then supplies
  the number anyway.
- **Pastel or alive is a target, not an adjective.** Give each role a chroma and lightness range
  (OKLCH) and check each accent is visible on the surface it sits on. Grey or dull is a finding,
  and a role never shown is one too.
- **Repeated list items are separated by one named device**: a gap, a hairline, or a surface step
  (own body, a slight shadow allowed). A shadow alone is not a separator, and adjacent items
  differ at rest.
- **A token or colour pass changes values only.** List every visible element (separators,
  handles, glass edge, readouts, layout) before and after and confirm each survives.
- **The owner's chat ruling beats an older source line.** Edit the line in place in the same
  change and quote the owner; an overruled line is out of date, not authority.
- **Prefer the platform's control to a custom one**, unless the source says why not. The system
  one brings keyboard, focus, scaling and screen reader behaviour for free.
- **A style is a constraint set, never a name.** Write what the look requires (for example "raised
  surfaces separate by a soft shadow, never an opaque border"), the accessibility it brings, and
  where it must not be used (dense data, small text, high-contrast users). Why: a named fad such as
  "glass" says nothing the audit can measure; a constraint can fail a pair.

## Output

Write `design/MASTER.md` (and a page file only when a surface differs). When no file can be written,
give the same content in the reply. Keep it short: tokens in a table, not prose. Mark each threshold
as default or override. Close with `## Requirements`, then tell the person what to do next: build
with the stack skill, then run ui-audit against this file, which is the expected column.

## Red flags

- When a colour appears in the draft with no `on-` partner, add the pair and compute its ratio,
  because an unpaired colour will be placed on something unmeasured.
- When the dark column equals the light one inverted, redesign it against dark surfaces, because
  inversion keeps light's mistakes and adds new ones.
- When you reach for a hex literal in a component description, name a token instead, because the
  literal is invisible to the audit and to the next theme.
- When the draft names a framework, a stack's property or component type, move it to the stack
  skill, because the source must survive a change of stack.
- When you are about to list palettes, font pairings, or "styles for SaaS", stop and write the
  token roles and constraints, because the person picks the look and the source holds its rules.
- When a surface's page file contradicts the master, keep the page file and note the override
  and its reason, because the page wins by design.
- With no stated accessibility requirement, write the floor above and name the assumption.

## Say it in the reply

- The path of the design source written, and which parts are defaults versus the person's
  choices.
- The contrast ratio per pair and theme, computed, with the tool or formula used.
- What was assumed and what was asked, and the open decisions left for the person.
- What is not covered: no running UI was measured, so nothing here is verified until ui-audit
  runs against it.

How each rule is built and exposed on a stack is its family: desktop (desktop-ui, qml-ui),
terminal (cli-ui, tui-ui), web (css-ui, react-ui, web-motion).

Sources: polish follows Emil Kowalski's emil-design-eng and README
(github.com/emilkowalski/skills, MIT); waits and touch targets follow
vercel-labs/web-interface-guidelines (MIT). Scale examples:
[Carbon spacing](https://carbondesignsystem.com/elements/spacing/overview/),
[Modular Scale ratios](https://github.com/modularscale/modularscale-sass/blob/3.x/stylesheets/modularscale/_vars.scss),
[USWDS type tokens](https://designsystem.digital.gov/design-tokens/typesetting/font-size/).
