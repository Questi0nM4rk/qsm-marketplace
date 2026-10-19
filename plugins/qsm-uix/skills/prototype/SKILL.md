---
name: prototype
description: "Use only when the person explicitly invokes it (the prototype skill, /prototype): build several genuinely different versions of one described UI piece behind a switcher, flip through them live, promote the chosen one. Does not trigger on its own, and not when someone merely asks to build one piece. Triggers: use the prototype skill for this toast, prototype three versions of the pricing card, /prototype a hold-to-delete button, prototype variants of this popout, prototypuj varianty. Reviewing existing UI is ui-audit and ux-audit; stack syntax is css-ui, react-ui, qml-ui, tui-ui."
disable-model-invocation: true
---

# Prototyping Variants

Three tints of one idea teach nothing, so a person who asks "show me the options" gets one answer
dressed three ways. This skill, adapted from Emil Kowalski's prototype, takes one described piece
of UI, builds several genuinely different versions, and puts them behind a switcher so the person
flips through them live and chooses. It runs only when invoked: asking to build one piece is not
asking for variants. It does not review existing UI or pick dependencies.

You are a senior design engineer running an exploration. The value is divergence: each variant is a
direction you could defend shipping alone, an answer to the same brief that differs on a named
axis. Divergence is not a reason to drop craft: every variant meets the motion rules of the
project's design source (ease-out entrances, short durations, correct transform origin,
reduced-motion handled). A sloppy variant loses on execution and teaches nothing about its
direction.

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
4. **Build the harness** on the stack (next section): one variant at a time, full size, in
   realistic surroundings (a toast needs a page behind it, a card needs siblings, a button needs a
   form), never thumbnails. Switching is instant, no animation on the swap.
5. **Verify and hand off.** Flip through every variant yourself: all render, interactions respond,
   console clean; screenshot each if tooling exists. Present the table below and stop: the choice
   is the person's.
6. **Promote on selection** (`keep <variant>`): integrate it with the project's conventions, then
   delete the surface. Another round (`riff <variant>`): keep the harness, diverge around the
   direction they gravitated to. `x5` sets the count; `keep <variant>, leave the picker` keeps the
   surface.

## On each stack

**CSS / React.** In a project with a dev server, an isolated route (`/prototypes/<slug>`), one file
per variant plus a small harness; nothing in production imports from it. No project: one
self-contained HTML file. The picker is the spec in the next section, kept in a framework as the
same classes and structure with state instead of `innerHTML` and a keyed re-mount.

**Quickshell QML.** The switcher is a `property int variant` on a debug singleton, read by a
`Loader` that picks one component per variant, flipped over IPC with no restart:

```qml
IpcHandler { target: "proto"; function pick(n: int): void { Debug.variant = n; } }
```

`qs ipc -p <shell.qml> call proto pick 2`. Variants are separate QML files in a prototype
directory the production shell does not import; the harness loads the surface in the real bar or
popout position so the neighbours are real. Replay sets the `Loader`'s `active` to false, then
true, which re-creates the item. Tokens come from `Theme` and `Motion`; see qml-ui.

**TUI.** An environment variable picks the variant (`APP_VARIANT=2`), read where output is
rendered, so one binary prints each version and nothing is edited. A keypress switcher only in an
interactive screen; otherwise the person reruns with the next number. Width and colour follow
tui-ui, and each variant is checked narrow and piped.

## The picker (CSS / React)

A floating dark pill, bottom-centre. Dark glass reads on any page, so it is not theme-aware.
Verbatim: no project fonts, brand colours, theme switching, extra shadows or borders.

```html
<nav class="proto-picker" aria-label="Prototype variants">
  <span class="proto-picker-highlight" aria-hidden="true"></span>
  <button class="proto-picker-item" data-active aria-current="true">Quiet</button>
  <button class="proto-picker-item">Editorial</button>
  <span class="proto-picker-divider" aria-hidden="true"></span>
  <button class="proto-picker-item proto-picker-replay" aria-label="Replay animation (R)">↻</button>
</nav>
```

```css
.proto-picker { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  z-index: 2147483647; display: flex; align-items: center; gap: 2px; padding: 4px;
  border-radius: 999px; background: rgba(10,10,10,.82);
  backdrop-filter: blur(12px) saturate(1.4);
  box-shadow: 0 0 0 1px rgba(255,255,255,.08) inset, 0 8px 24px rgba(0,0,0,.24), 0 2px 6px rgba(0,0,0,.12);
  font: 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  user-select: none; }
.proto-picker-highlight { position: absolute; top: 4px; left: 0; width: 1px; height: 28px;
  transform-origin: left; border-radius: 999px; background: rgba(255,255,255,.12);
  will-change: transform; }
.proto-picker[data-ready] .proto-picker-highlight {
  transition: transform 250ms cubic-bezier(.23,1,.32,1); }
@media (prefers-reduced-motion: reduce) { .proto-picker[data-ready] .proto-picker-highlight { transition: none; } }
.proto-picker-item { position: relative; display: flex; align-items: center; height: 28px;
  padding: 0 12px; border: 0; border-radius: 999px; background: transparent;
  color: rgba(255,255,255,.55); font: inherit; cursor: pointer; transition: color 150ms ease-out; }
@media (hover: hover) and (pointer: fine) {
  .proto-picker-item:hover { color: rgba(255,255,255,.85); } }
.proto-picker-item:active { transform: scale(.97); }
.proto-picker-item:focus-visible { outline: 2px solid rgba(255,255,255,.4); outline-offset: 2px; }
.proto-picker-item[data-active] { color: #fff; }
.proto-picker-divider { width: 1px; height: 16px; margin: 0 4px; background: rgba(255,255,255,.12); }
.proto-picker-replay { padding: 0 10px; font-size: 14px; }
.proto-picker[data-position="top"] { bottom: auto; top: 24px; }
@media (prefers-reduced-transparency: reduce) {
  .proto-picker { background: rgb(10,10,10); backdrop-filter: none; } }
```

The highlight moves between items with `transform` only (`translateX` and `scaleX`, never `left` or
`width`); the variant swap stays instant. The picker is throwaway chrome and holds literals on
purpose: it is deleted when a variant is promoted. The one allowed change:
`data-position="top"` when a variant occupies the bottom-centre (toast stack, sheet, dock).
Render replay and its divider only when a variant has motion to re-trigger.

Behaviour: keys `1` to `N` and arrows switch, `R` replays, ignored in an input, textarea, select,
contenteditable or with a modifier held. Exactly one item carries `data-active` and
`aria-current="true"`. The choice persists in `?v=2`, default 1. `data-ready` is added after two
animation frames so load does not animate the highlight; set the highlight's `scaleX` and
`translateX` from the active item's `offsetWidth` and `offsetLeft`, again on resize. A switch
re-mounts the variant (clear, render next frame) so entrance animations re-run; replay re-mounts
without switching.

## Say it in the reply

The set as a table, never with a favourite pre-picked, then where the switcher runs (URL, file, or
the `qs ipc` or environment command) and the keys:

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

Source: skills/prototype/SKILL.md and PICKER.md in github.com/emilkowalski/skills (MIT, Emil
Kowalski).
