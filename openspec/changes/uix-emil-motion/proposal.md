## Why

qsm-uix audits motion (ux-audit check 7) but never builds it, so an agent animating a Quickshell
popout or a web dropdown picks its own curve and duration, and agents pick wrong: `ease-in` on an
enter, `scale(0)` from nothing, `transition: all 300ms`, animation on a keyboard action. Emil
Kowalski's skills (github.com/emilkowalski/skills, MIT, commit 2d22863) hold the craft bar for
these decisions, and the person chose them as the source of truth for qsm-uix (epic qsm-d0c).

## What Changes

- Six motion skills arrive in qsm-uix under his names: animate, review-animations,
  improve-animations, find-animation-opportunities, animation-vocabulary, animation-performance.
- Each states his rules once, stack-neutral (purpose, curve, duration, property, interruption,
  exit), then a short per-stack section for Quickshell QML, Hyprland `animation`/`bezier` lines,
  CSS/React, and TUI where a rule applies there.
- His motion rules from emil-design-eng land in animate and review-animations.
- **BREAKING** ux-audit no longer owns motion: its motion check hands to review-animations.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `qsm-uix`: adds the motion skills requirement; the UX audit requirement hands motion to it.

## Impact

- `plugins/qsm-uix/skills/<six names>/SKILL.md`: new.
- `plugins/qsm-uix/skills/ux-audit/SKILL.md`: motion check shrinks to a hand-off.
- `plugins/qsm-uix/evals/`: one fire case per new skill.
- `plugins/qsm-uix/README.md`: the skill list.

## Critiques

- Devil's advocate: his rules are tuned for the web; a QML `Behavior` or a Hyprland bezier may not
  feel the same at the same numbers. Fixed: each per-stack line maps the value (the cubic-bezier
  points carry over exactly to `Easing.BezierSpline` and `bezier =`), and the person's desktop run
  is the judge.
- Future archaeologist: why six skills, not one motion skill? Fixed: the design says each is one
  of his skills under his name so a rule traces to its source file.
- Scope sniper: animation-vocabulary is a glossary the model mostly knows. Waived: the person chose
  to take all of his skills except Swift, Expo and Sonner.
