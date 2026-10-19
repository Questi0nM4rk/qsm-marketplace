## Context

Source: github.com/emilkowalski/skills at commit 2d228630ba1446365f614a108cb8252f1feda202, MIT.
Sizes of the source files, against the 12 KB cap of Iron Law 4:

| His skill | SKILL.md | Extra files |
| --- | --- | --- |
| animate | 11.9 KB | RECIPES.md |
| review-animations | 8.4 KB | STANDARDS.md |
| improve-animations | 8.2 KB | AUDIT.md, PLAN-TEMPLATE.md |
| find-animation-opportunities | 9.8 KB | none |
| animation-vocabulary | 13.4 KB | none |
| animation-performance | 14.0 KB | none |
| emil-design-eng (motion half) | 27.1 KB whole | none |

## Decisions

1. **His name, one file per skill.** A rule traces to his file of the same name. No extra files:
   RECIPES, STANDARDS, AUDIT and PLAN-TEMPLATE fold into their SKILL.md or are cut.
2. **Rules once, stacks after.** Each skill states his rule stack-neutral with its value, then one
   section "On each stack" with a line per stack only where the rule applies:
   - QML: `Behavior on`, `NumberAnimation`, `Easing.BezierSpline` with his cubic-bezier points,
     `SpringAnimation`, the Theme singleton's motion tokens.
   - Hyprland: `bezier = name, x1, y1, x2, y2` and `animation = windows, 1, speed, name, style`;
     speed is in deciseconds.
   - CSS/React: his original form.
   - TUI: spinners and redraw only; most motion rules do not apply and the skill says so.
3. **Over the cap is a cut, not a split.** animation-vocabulary and animation-performance drop
   web-only depth first (Framer Motion internals, React re-render detail) to fit 12 KB, because the
   cap is a law and a second skill per source breaks decision 1.
4. **Motion has one owner.** review-animations owns the motion review bar; ux-audit's check 7
   becomes one line handing to it, so no two voices judge one animation.
5. **Credit.** Each skill's last line names the source file and licence; the README's skill list
   says the motion set is adapted from his repository.

## Risks

- His values may feel different on QML's scene graph than in a browser. The person's desktop run
  decides; a value that feels wrong is a finding against the per-stack line, not the rule.
