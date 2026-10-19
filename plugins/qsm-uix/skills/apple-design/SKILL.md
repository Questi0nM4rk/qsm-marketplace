---
name: apple-design
description: "Use when an interface should feel the way Apple's do and the question is the design, not the stack: translucent or blurred materials and depth, feedback that answers the press at once, typography by optical size (tracking, leading), reduced transparency and contrast, and Apple's design principles (purpose, agency, familiarity, simplicity, craft). Triggers: make it feel like macOS, Apple style, frosted glass panel, blurred bar, translucent popup, letter-spacing for headings, vibrancy, Apple HIG principles, nechci to genericke, pocitem jako Apple, pruhledny panel. Foundations by Apple's WWDC talks; each stack's syntax is qml-ui, css-ui, react-ui, tui-ui; tokens and numbers are ui-design; curves, springs, gestures and momentum are animate, checking them is review-animations."
---

# Apple Design

An interface feels Apple-made when it answers before the person finishes acting, keeps things
where they came from, layers material so that structure shows without shouting, and sets type
for its size. This skill serves the person who builds interfaces on a Hyprland desktop or the
web and wants that feel, and gives the foundations and how each lands on their stacks. It does
not write stack syntax, choose the design's numbers (ui-design), or carry motion: curves,
durations, springs, gestures, momentum and rubber-banding are `animate`, and `review-animations`
checks them. Say so when a question is about them.

The through-line: every rule serves one of four needs, safety (predictable), understanding,
achievement, joy. A rule that serves none is decoration.

## 1. Response

The moment lag appears, directness falls off a cliff.

- Feedback starts on press, not on release: the control reacts on pointer-down or key-down,
  commits on release, and allows cancel by moving away.
- Audit the input path for latency that is not essential: debounce timers, transition waits,
  polling. Each one is a regression against the feel.
- Feedback continues during an interaction (a slider follows the pointer 1:1), not only at the end.

## 2. Spatial consistency

Things leave the way they came.

- Enter and exit along the same path; a panel that slides in from the right goes back right.
- Anchor a menu, popover or sheet to its trigger so the link between button and content is plain.
- A modal task dims the background and sits centred; a parallel, non-blocking panel uses
  translucency and offset with no scrim, so flow is not broken.

## 3. Materials and depth

Translucency is a floating layer that brings structure without stealing focus.

- Bars, toolbars and sheets are translucent layers over scrolling content, not opaque strips.
- Weight encodes hierarchy: heavier material separates structural regions (sidebars), lighter
  draws attention to controls. Never stack a light translucent surface on another one; legibility
  collapses.
- Bigger surfaces read thicker: stronger blur and a deeper shadow than a small chip.
- Over blurred surfaces, flat grey text fails: use higher contrast and a slightly heavier weight,
  and put colour on a solid layer, not on the translucent one.
- Where floating chrome overlaps content, fade a small gradient or blur mask instead of a 1 px
  divider; keep the divider where nothing overlaps.
- A bright 1 px top edge reads as light catching the material.
- Accessibility is three settings, each its own: reduced transparency makes the surface frostier
  or solid (raise opacity, drop the blur), more contrast gives near-solid fills with a defined
  border, reduced motion is `animate`'s. Design the solid variant first, then add the material.

## 4. Typography

Type changes shape with size.

- Tracking is size-specific. Large display text takes negative tracking, small text slightly
  positive; one fixed value is wrong somewhere. Tighten headings, leave body near 0.
- Leading falls as size rises: tight on headings, looser on body, tighter in dense UI.
- Hierarchy is weight, size and leading as a set; weight adds presence without taking space.
- Scale layout with the person's text size: spacing in relative units, not fixed pixels.
- Default to the platform's system font. It ships optical sizing and tuned tracking; override only
  with a reason.

## 5. The eight principles

Purpose: decide what not to build, spend attention only where it pays. Agency: keep people in
control, offer undo instead of confirmations, confirm only the irreversible. Responsibility:
privacy asked at the right moment and only for what is needed, anticipate misuse. Familiarity:
things that look the same behave the same and live in the same place; break a pattern only with
proof it is better. Flexibility: adapt to device, context and ability, let people rearrange.
Simplicity is not minimalism: strip until the core shows, but burying everything in one place is
not simple; common path first, advanced one level deeper. Craft: every spacing, timing and
alignment is a choice you can defend; misaligned icons and jitter read as carelessness. Delight:
the result of the other seven, a chosen emotion reinforced in every decision.

Tactical rules: feedback is one of four kinds (status, completion, warning, error), validated
inline, not on submit. Every screen answers where am I, where can I go, what is here, how do I
get out. Proximity implies relation; a control sits near what it affects, and a label needed to
explain a control means weak mapping. Name navigation for its contents, not "Home".

## On each stack

Reduced motion is `animate`'s rule on every stack below; this table adds nothing to it.

| Stack | Materials and depth | Response, type |
| --- | --- | --- |
| Hyprland | The compositor owns blur and shadow: `hl.config({ decoration = { rounding = 14, blur = { enabled, size, passes, vibrancy }, shadow = { enabled, range, render_power, color } } })` (Lua). A shell surface blurs only when a layer rule targets its namespace `hl.layer_rule({ name = "blur-bar", match = { namespace = "bar" }, blur = true, ignore_alpha = 0.3 })`, where `ignore_alpha` keeps fully transparent pixels unblurred; confirm the key names against `hyprctl version` and the wiki before writing one | Rounding is one value, so the shell's radii follow it (ui-audit's nested radius line). Heavy blur costs every frame: size and passes stay small on weak GPUs |
| Quickshell QML | The window needs `color: "transparent"` and a translucent fill from `Theme`, with the on-pair measured over the blur, not over the fill alone. Opacity belongs to the fill colour, never to the item, because item opacity fades the text with it. Reduced transparency is a `Theme` flag that swaps in the solid fill | Press feedback on the control's own state, from `Motion`. Type sizes and tracking come from `Theme`; `font.letterSpacing` is in pixels, so convert the em value per size |
| CSS and React | `backdrop-filter: blur() saturate()` on a semi-transparent fill; `@media (prefers-reduced-transparency: reduce)` swaps to a solid fill with the blur dropped, and `prefers-contrast: more` adds a border | Press feedback on `:active`; `letter-spacing` in em per heading step, `font-optical-sizing: auto`, spacing in `rem` |
| TUI | No transparency: depth is one step of background shade or a rule line, and a terminal's own opacity is the person's. Where the terminal gives 256 or truecolor, a panel is one shade off the base | Response is output before the work finishes (a prompt echo, a spinner at once). Type is the terminal's font; hierarchy is bold, dim and case, never colour alone |

## Red flags

- When a blurred panel's text passes against its fill but was never measured over the blur, run the
  contrast on a capture of the real surface, because the blur carries the wallpaper's colours.
- When a translucent layer sits on a translucent layer, make the lower one solid, because the
  stack loses legibility.
- When the question turns to springs, flicks, velocity or drag, hand it to `animate`, because
  those values are not kept here.
- When a design has no solid fallback for reduced transparency, add it before the material.

## Say it in the reply

The foundation rule applied, how it lands on the stack in use, and the solid variant. Name what was
handed to `animate`.

Source: Apple's WWDC talks (Designing Fluid Interfaces, Details of UI Typography, Principles of
Great Design) as distilled in emilkowalski/skills apple-design, github.com/emilkowalski/skills,
MIT.
