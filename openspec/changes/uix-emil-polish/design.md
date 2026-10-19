## Context

Source: github.com/emilkowalski/skills at 2d228630ba1446365f614a108cb8252f1feda202, MIT.
emil-design-eng supplies motion (to uix-emil-motion) and polish; apple-design supplies foundations.

## Decisions

1. **Polish goes into ui-design, not a new skill.** ui-design already owns "how should it look", so
   his polish rules become its rules; where a qsm rule says the same thing, his wording wins and
   the qsm rule goes.
2. **ui-audit gets the check, not the rule.** Each polish rule that a capture can show (border vs
   shadow, pressed state, radius nesting) becomes one line of a ui-audit pass that points to
   ui-design for the reason.
3. **apple-design is cut to 12 KB.** Foundations (feedback, spatial consistency, materials and
   depth, typography: optical size, tracking, leading) stay; spring and gesture values point to
   animate.
4. **The shadow rule has a named source.** emilkowalski/skills README.md names "a solid border
   instead of a semi-transparent shadow" as an agent mistake; ui-design and the spec cite that
   file, and the rule stays.
5. **Stack forms in the families**, as in uix-emil-motion: desktop-ui holds Hyprland blur,
   rounding and shadow and the QML materials, css-ui the web materials, tui-ui the terminal depth.
    apple-design and ui-design end with a pointer to them.
6. **Scales belong to the product.** Carbon's spacing scale uses multiples of two, four and eight
   (<https://carbondesignsystem.com/elements/spacing/overview/>). Modular Scale names 1.125 as
   major-second, one selectable ratio
   (<https://github.com/modularscale/modularscale-sass/blob/3.x/stylesheets/modularscale/_vars.scss>).
   USWDS uses named, non-geometric type steps
   (<https://designsystem.digital.gov/design-tokens/typesetting/font-size/>). These are valid
   choices, not universal requirements. ui-design names the adopted scale; ui-audit checks it.
   Proximity is relative grouping, not a fixed 1.5-times or three-times cutoff
   (<https://www.nngroup.com/articles/gestalt-proximity/>).
