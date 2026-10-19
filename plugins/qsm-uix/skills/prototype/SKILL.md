---
name: prototype
description: "Use only when the person explicitly invokes it (the prototype skill, /prototype): build several genuinely different versions of one described UI piece behind a switcher, flip through them live, promote the chosen one. Does not trigger on its own, and not when someone merely asks to build one piece. Triggers: use the prototype skill for this toast, prototype three versions of the pricing card, /prototype a hold-to-delete button, prototype variants of this popout, prototypuj varianty. Reviewing existing UI is ui-audit and ux-audit; stack syntax is its family skill (desktop-ui, qml-ui, cli-ui, tui-ui, web-harness)."
disable-model-invocation: true
---

# Prototyping Variants

Three tints of one idea teach nothing, so a person who asks "show me the options" gets one answer
dressed three ways. This skill, adapted from Emil Kowalski's prototype, takes one described piece
of UI, builds several genuinely different versions, and puts them behind a switcher so the person
flips through them live and chooses. It runs only when invoked: asking to build one piece is not
asking for variants. It does not review existing UI or pick dependencies.

You are a senior design engineer running an exploration. The value is divergence: each variant is a
direction you could defend shipping alone, an answer to the same brief that differs on a named axis.
Divergence is not a reason to drop craft: every variant meets animate's rules (ease-out entrances,
short durations, correct origin, reduced motion handled). A sloppy variant loses on execution and
teaches nothing about its direction.

## Rules

1. **Never touch production code while exploring.** Everything lives on an isolated prototype
   surface; integration happens only for the variant the person picked.
2. **Variants diverge on a named axis** (layout, density, personality, motion, interaction model),
   stated in a phrase before building. Sharing the project's tokens is not convergence; variants
   should feel native.
3. **Every variant fully works:** real interactions and motion, product-shaped copy and numbers,
   no lorem ipsum, no dead buttons.
4. **The switcher is chrome, not a contestant.** It follows the spec below and never adapts to the
   project's look.
5. **Clean up after the choice:** delete the prototype surface unless asked to keep it.

## Workflow

1. **Scope.** One piece per run. If the brief spans several ("the dashboard"), pick the
   highest-leverage piece, say which and why, offer the rest as later runs. Restate the brief in one
   sentence: what it is, where it lives, what it must do.
2. **Recon.** Stack and styling system, tokens (colours, radii, spacing, fonts, easing, durations:
   variants use them), personality (playful app or crisp dashboard bounds the boldest variant),
   context (background, neighbours, sizes). No project: a restrained default, neutral grays, one
   accent, system font.
3. **Choose directions.** Default 3, up to 5 on request or when the space is wide; more dilutes the
   comparison. List a name and an axis for each before any code. Names describe the direction
   ("Quiet", "Editorial", "Dense"), never "Option A". Two directions that differ only in accent or
   copy are one: replace one with a real alternative.
4. **Build the harness** in the family's form (below): one variant at a time, full size, in
   realistic surroundings (a toast needs a page behind it, a card needs siblings, a button needs a
   form), never thumbnails. Switching is instant, no animation on the swap.
5. **Verify and hand off.** Flip through every variant yourself: all render, interactions respond,
   console clean; screenshot each if tooling exists. Present the table below and stop: the choice
   is the person's.
6. **Promote on selection** (`keep <variant>`): integrate it with the project's conventions, then
   delete the surface. Another round (`riff <variant>`): keep the harness, diverge around the
   direction they gravitated to. `x5` sets the count; `keep <variant>, leave the picker` keeps the
   surface.

## The harness

A switcher that is plain, throwaway and apart from production: variants live where nothing in
production imports them, one shows at a time, and the choice is switched live (a URL, a key, a
command, an environment variable) with no restart. The switcher is chrome in its own fixed look,
not the project's, because it is deleted when a variant is promoted. Its form is the family's:
desktop (desktop-ui, qml-ui), terminal (cli-ui, tui-ui), web (web-harness).

## Say it in the reply

The set as a table, never with a favourite pre-picked, then where the switcher runs (URL, file, key,
or command) and the keys:

| # | Variant | Axis | When it is right | Its cost |
| --- | --- | --- | --- | --- |
| 1 | Quiet | minimal motion, borders over shadows | a daily-use tool | least memorable |
| 2 | Editorial | large type, generous whitespace | the moment deserves weight | eats vertical space |

If asked which you would choose, answer from the product's personality and how often the piece is
seen, not aesthetics alone. If two variants converged while you built, cut one and say so: two
distinct directions beat three padded.

## Red flags

- When two variants share an axis position, replace one, because the person learns nothing from
  flipping between them.
- When a variant has a dead button or placeholder copy, finish it, because an unfinished variant
  loses on execution, not direction.
- When production code is edited before a pick, revert it, because exploration lives on its own
  surface.

How each rule is built on a stack is its family: desktop (desktop-ui, qml-ui), terminal (cli-ui,
tui-ui), web (web-harness).

Source: skills/prototype/SKILL.md and PICKER.md in github.com/emilkowalski/skills (MIT, Emil
Kowalski).
