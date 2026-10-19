## Context

Source: github.com/emilkowalski/skills at 2d228630ba1446365f614a108cb8252f1feda202, MIT.
emil-design-eng is 27.1 KB, about half motion (to uix-emil-motion) and half polish. apple-design is
23.0 KB. ui-design is 8.4 KB and ui-audit 8.8 KB today.

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
4. **Per-stack lines** as in uix-emil-motion: QML, Hyprland (blur, rounding, shadow config),
   CSS/React, TUI.
