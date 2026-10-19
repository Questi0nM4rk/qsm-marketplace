## Why

ui-design decides tokens and themes but carries none of the small polish rules that make a UI feel
finished: a semi-transparent shadow instead of a solid border, a pressed state on every button,
concentric radii, optical alignment. Emil Kowalski's emil-design-eng and apple-design
(github.com/emilkowalski/skills, MIT, commit 2d22863) hold them, and the person chose his skills
as the source of truth for qsm-uix (epic qsm-d0c).

## What Changes

- ui-design takes the non-motion half of emil-design-eng as rules, replacing any qsm rule that
  says the same thing differently.
- ui-audit checks those rules on a running UI.
- A new apple-design skill, under his name, carries Apple's interface and fluid-motion principles
  translated for QML, Hyprland, CSS/React and TUI where they apply; its motion parts point to
  animate.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `qsm-uix`: adds the apple-design requirement; the UI design requirement carries his polish rules.

## Impact

- `plugins/qsm-uix/skills/ui-design/SKILL.md`, `skills/ui-audit/SKILL.md`: rules replaced or added.
- `plugins/qsm-uix/skills/apple-design/SKILL.md`: new.
- `plugins/qsm-uix/evals/`: a fire case for apple-design.

## Critiques

- Devil's advocate: ui-design is near 8.4 KB; his rules may push it over 12 KB. Fixed: the design
  says a qsm rule he covers is replaced, not kept beside his.
- Future archaeologist: why does a rule in ui-design read like his? Fixed: the skill's last line
  names the source.
- Scope sniper: apple-design overlaps animate on springs and gestures. Fixed: apple-design keeps
  the design foundations and points to animate for curves and durations.
