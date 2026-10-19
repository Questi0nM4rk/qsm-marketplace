## 1. Motion skills

Source for every line: `skills/<name>/` in github.com/emilkowalski/skills at 2d22863, plus the
motion half of `skills/emil-design-eng/SKILL.md`.

- [x] 1.1 animate: his SKILL.md and RECIPES.md, emil-design-eng's motion rules, pointer to the
      families (owns `plugins/qsm-uix/skills/animate/SKILL.md`; proof: file under 12 KB,
      `bun run validate`)
- [x] 1.2 review-animations: his SKILL.md and STANDARDS.md, pointer to the families
      (owns `plugins/qsm-uix/skills/review-animations/SKILL.md`; proof: as 1.1)
- [x] 1.3 improve-animations: his SKILL.md, AUDIT.md and PLAN-TEMPLATE.md folded in
      (owns `plugins/qsm-uix/skills/improve-animations/SKILL.md`; proof: as 1.1)
- [x] 1.4 find-animation-opportunities (owns its SKILL.md; proof: as 1.1)
- [x] 1.5 animation-vocabulary, cut to 12 KB (owns its SKILL.md; proof: as 1.1)
- [x] 1.6 animation-performance, web-only depth cut first, stack notes in the families
      (owns its SKILL.md; proof: as 1.1)

## 2. Hand-off and wiring

- [x] 2.1 ux-audit check 7 hands the judgement to review-animations and keeps only the
      measurement method; ui-audit's pointer moves from ux-audit to review-animations (owns
      `skills/ux-audit/SKILL.md`, `skills/ui-audit/SKILL.md`; proof: `grep -n motion` shows the
      hand-off and the measurement only)
- [ ] 2.2 One fire case per new skill in `plugins/qsm-uix/evals/` (owns those six case
      directories; proof: `bun run eval qsm-uix` passes the six fire cases; blocked by 1.x)
- [x] 2.3 README skill list names the six and credits the source (owns
      `plugins/qsm-uix/README.md`; proof: `bun run validate`)
