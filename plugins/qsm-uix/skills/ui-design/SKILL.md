---
name: ui-design
description: "Use when a UI is to be designed, specified, or restyled before it is built: choosing colours, spacing, type or a look, setting up dark mode, writing down what two products must share, or deciding what a new panel, page, or CLI output should follow. Triggers: design the UI, decide colours and spacing, dark mode, design tokens, style guide, make it look like the rest, same look on web and desktop, navrhni vzhled, design system, jak ma vypadat. Writes the design source that builds and audits read. Measuring a running UI is ui-audit and ux-audit; accessibility criteria are a11y-audit; syntax is the stack skills."
---

# UI Design

A UI built from taste drifts: every component picks its own grey, its own gap, its own dark
values, and the first person to find out is the one who cannot read it. This skill serves the
person who builds and publishes interfaces and answers for their accessibility. Its outcome is one
written design source, made before the first component, that every build follows and every audit
measures against. It does not audit a running UI, name a framework, or ship palettes, font
pairings, or a catalogue of looks: it produces the numbers and constraints, and the maintainer's
taste picks the hues.

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

Never assume the stack. Look for an existing `design/` folder, a theme file, tokens in code, a
screenshot. If a design source exists, read it whole before writing: extend it, do not regenerate
it. Ask one question only when the answer changes the source: the surfaces (bar, page, CLI), the
audience, any fixed brand colour. If the stack is unknown, the source stays stack-neutral anyway;
the stack skill maps it later. Do not stop at the question: state the
assumption and still write the source with tokens, pairs and ratios, because a draft the person
can correct is worth more than a questionnaire.

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
  `on-primary` and record the ratio per theme: 4.5 for text, 3 for large text, icons, borders and
  focus indicators (WCAG 1.4.3, 1.4.11). Why: contrast belongs to a pair, so a colour checked alone
  is checked against nothing. Compute the ratio with the WCAG relative-luminance formula, never
  estimate it (`qsm-uix contrast` reads pixels of an image, so it verifies the built pair later).
- **Design each theme on its own column.** Write dark values by choosing them against dark
  surfaces, then check them; an inverted light palette fails because shadows vanish, saturated
  fills glare, and light borders turn into holes. Parity means every pair passes in each theme
  and a border, divider, or state visible in one is visible in the other. High contrast, if
  wanted, is a third column.
- **Every dimension is a scale, and a component picks a step.** Space on a 4/8 grid with two to
  four clusters in use; type steps of about 1.125; one set each for radius, elevation, layer
  (z-order), icon size, motion (duration and easing, exit shorter than enter), density. Why: a
  literal in a component is a decision nobody reviewed, and a scale is how one change reaches
  every surface. Density is an axis of the scale (compact, regular), not a second design.
- **Every pressable has a pressed state, and no state moves its neighbours.** The press shrinks
  the element to 0.95 to 0.98 of its size at once, as a transform on `:active` or pressed that does
  not change layout bounds (animate owns it); hover, focus and disabled change colour, opacity or
  elevation and keep the box. Adjacent states of a control differ by a contrast ratio
  of at least 1.2, and the focus indicator reaches 3:1 against its neighbours. Why: a press with
  no response feels like the UI did not hear the person, a scaled press leaves layout alone, and
  a state that cannot be told apart is not a state.
- **Hover is for pointers that hover.** A hover effect is gated to hover-capable pointers,
  because a touch screen fires hover on tap and shows it as a false positive.
- **A tooltip delays once, then follows at once.** The first waits so a passing pointer does not
  trigger it; while one is open its neighbours show instantly, which makes the whole row feel
  faster without losing the delay's purpose.
- **A popover grows from its trigger, a modal from the centre.** Anchored content that appears
  from nowhere loses the link to what opened it. Curves, durations and springs are `animate`'s,
  checking them is `review-animations`.
- **Defaults carry the design; options are for the few.** Most people never change a setting, so
  the default look, spacing and timing must already be the best the design has.
- **A component's character is one personality.** Spacing, type, and feel agree with the
  product's mood: a professional dashboard is crisp and dense, a playful tool may be looser.
  Why: a rule right in isolation still reads wrong beside a neighbour of another character.
- **A raised surface separates by a soft shadow, not a solid border.** A semi-transparent shadow
  or a low-alpha border reads as depth; an opaque border reads as a box drawn around the content.
  A low-alpha separator on a card is decorative: WCAG 1.4.11 applies to the boundaries a person
  needs to identify a control, so the 3:1 rule is for control boundaries and inputs.
- **Handle edge cases where nobody looks.** A hover that must survive the gap between stacked
  items, a timer that pauses when the view is hidden, a drag that continues outside its box.
  These are details nobody notices, and that is what correct looks like.
- **Sizes carry a floor.** Target 24 px minimum (WCAG 2.5.8), 32 px for anything used often;
  icon box at least 12 px, text at least 10 px. These are defaults, and the source records any
  override per project with its reason, because a threshold silently changed is a regression
  nobody can find.
- **One primary action per surface.** Secondary actions are visibly subordinate and a destructive
  one is separated and named as such. Why: when two things shout, the user has to decide what
  the design should have decided.
- **Colour is never the only carrier of meaning.** Each status token comes with a word, glyph or
  shape (error is red and says what failed). Icons follow use: decorative beside text, named when
  alone, a button when interactive.
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
  handles, glass edge, readouts, layout) before and after and confirm each survives; a missing
  one is a regression to fix, not a spec outcome.
- **The owner's chat ruling beats an older source line.** Edit the line in place in the same
  change and quote the owner; a line the owner overruled is out of date, not authority.
- **Prefer the platform's control to a custom one**, unless the source says why not. The system
  one brings keyboard, focus, scaling and screen reader behaviour for free.
- **A style is a constraint set, never a name.** Write what the look requires (for example "raised
  surfaces separate by a low-alpha border or a soft shadow, never an opaque border"), the
  accessibility it
  brings, and where it must not be used (dense data, small text, high-contrast users). Why: a
  named fad such as "glass" says nothing the audit can measure; a constraint can fail a pair.

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
- When the draft names a framework, a CSS property, or a QML type, move it to the stack skill,
  because the source must survive a change of stack.
- When you are about to list palettes, font pairings, or "styles for SaaS", stop and write the
  token roles and constraints, because the person picks the look and the source holds its rules.
- When a surface's page file contradicts the master, keep the page file and note the override
  and its reason, because the page wins by design.
- When the person gives no accessibility requirement, write the floor above anyway and say so,
  because silence in the source becomes a defect in the product.

## Say it in the reply

- The path of the design source written, and which parts are defaults versus the person's
  choices.
- The contrast ratio per pair and theme, computed, with the tool or formula used.
- What was assumed and what was asked, and the open decisions left for the person.
- What is not covered: no running UI was measured, so nothing here is verified until ui-audit
  runs against it.

The polish rules follow Emil Kowalski's emil-design-eng and README (github.com/emilkowalski/skills,
MIT).
