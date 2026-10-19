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
2. **Rules once, stacks in the families.** Each skill states his rule stack-neutral with its
   value and ends with one pointer to the families (uix-families). The stack form of each rule
   lives only there, where the rule applies:
   - desktop-ui and qml-ui: `Behavior`, `Easing.BezierSpline` with his points, `SpringAnimation`,
     tokens from `Motion` else `Theme`, and Hyprland's `hl.curve` and `hl.animation`.
   - web-motion: his original CSS and React form.
   - tui-ui and cli-ui: spinners and redraw only; most motion rules do not apply and they say so.
3. **Over the cap is a cut, not a split.** animation-vocabulary and animation-performance drop
   web-only depth first (Framer Motion internals, React re-render detail) to fit 12 KB, because the
   cap is a law and a second skill per source breaks decision 1. His skills are dense, so the 12 KB
   cap, not the 8 KB aim, is the bound; the cut order is web-only depth first.
4. **Motion has one owner.** review-animations owns the motion review bar; ux-audit's check 7
   hands the judgement to it and keeps only the measurement method, so no two voices judge one
   animation.
5. **Credit.** Each skill's last line names the source file and licence; the README's skill list
   says the motion set is adapted from his repository.

## Risks

- His values may feel different on QML's scene graph than in a browser. The person's desktop run
  decides; a value that feels wrong is a finding against the family skill's line, not the rule.
