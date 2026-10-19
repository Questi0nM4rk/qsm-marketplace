---
name: desktop-ui
description: "Use when building, reviewing or deciding the behaviour of a Quickshell/Hyprland desktop shell surface (bar, popout, OSD, notification, tray, launcher, settings pane) or the Hyprland Lua config for its animation, blur and layer rules. Triggers: Quickshell popout, Hyprland layer rule, hl.layer_rule no_anim, OSD, shell notification, system tray, app launcher, hover popout, blur behind my panel, layersIn, animate a popout in my shell, undo or confirm in a panel, Hyprland animation curve, oznameni v shellu, animace panelu. Shell surface behaviour and Hyprland only: QML code is qml-ui, tokens are ui-design, motion values are animate, audits are ui-audit, ux-audit and a11y-audit."
---

# Desktop UI

A shell is the part of the desktop every other program sits in, so a wrong surface is wrong all
day: a popout that vanishes under the pointer, an OSD that steals focus, a blur that never
switches off. An unaided model builds each surface as a web card. This skill says what each
surface is for, the rules that keep it quiet, and the Hyprland config around it. It builds
nothing alone: QML syntax is qml-ui, the numbers are ui-design and animate.

## Surfaces

- **Bar:** state at a glance and the entry to the rest. Never a form or a long text.
- **Popout:** detail or a quick action from one bar module. Under a third of the screen, few
  control types, no Close or Done button.
- **OSD:** the new state after the person changed a system value (volume, brightness). Never for
  an automatic event, never takes focus, never stays.
- **Notification:** an event needed while away from its source. Never repeats, never fires
  while the source is focused, always has an off switch.
- **Tray:** a status with no other home, shown when abnormal, opt-in. Never an app's default home.
- **Launcher:** one query box and a ranked list. No second step before the first result.
- **Settings pane:** a stored choice applied at once. No Apply for a reversible setting.

## Rules

- **Nothing is hover-only.** A surface may open on hover (stays open inside trigger, panel and the
  path between them, closes 180 ms after leaving, never delays opening), and every action and fact
  in it is also reachable by click and by keyboard. A tooltip holds a name, never text the person
  must read.
- **Undo first.** A destructive action runs at once and offers Undo in a toast or an inline
  message. A confirm dialog is only for what cannot be undone, and its button names the verb
  ("Delete 3 files"), never "OK" or "Yes". Cancel comes first, Escape cancels, Return activates
  unless the action is destructive.
- **Waits.** Feedback (spinner or busy state) from 1 s. Past about 10 s with a known length, a
  progress bar with a count.
- **Errors say what happened and what to do next.** Nothing fails silently. Invalid input disables
  the confirm button and says why beside the field.
- **Notify sparingly.** Only for what is needed while away; rate-limit; offer off; none while the
  source is focused. A finished action is shown on the object itself (a toast only for undo or a
  message with no object); a state that persists (offline, degraded) is a banner.
- **Nothing appears unbidden.** No OSD or dialog for an automatic event. A tray icon is opt-in.
- **Icons.** An icon alone only where everyone reads it the same (close, play, volume) and then
  with a tooltip; otherwise a text label. Never icon and label on one button. Icons are monochrome.
- **Labels** are short, key word first, name the action. A toggle label says what on does, in the
  positive ("Show seconds", not "Hide seconds: off").
- **Colour has jobs.** Red only for a destructive action or an error; orange warning; blue focus
  and selection. Colour never carries a state alone.
- **Dark overlays.** A soft shadow always. In a dark theme the overlay also gets a 1 px low-alpha
  light edge, never opaque, because a shadow vanishes on dark and an opaque border reads as a box.
- **Keyboard.** Every action works from the keyboard. Focus starts on the first operable control
  and is distinct from selection. Popouts close on Escape and on a click outside; a popover
  has no Close button. Super belongs to the compositor: a shell binding never takes it alone.
- **Text** sizes come from the system font scale. Test at a large text size: nothing clips.
- **Launcher search** is live, global, tolerant of typos, ordered by relevance, and says "No
  results" in text. An empty list shows an icon, a sentence and the action that fills it.
- **One primary action per surface.** A destructive one sits apart from it.

## Hyprland config

The config is Lua (Hyprland 0.55 and later). A curve takes its points directly and a leaf names
it; speed is in deciseconds, so 2 is 200 ms. Values live in animate.

```lua
hl.curve("easeOut", { type = "bezier", points = { { 0.23, 1 }, { 0.32, 1 } } })
hl.animation({ leaf = "windows", enabled = true, speed = 2, bezier = "easeOut",
               style = "popin 95%" })
hl.animation({ leaf = "workspaces", enabled = false })
hl.layer_rule({ match = { namespace = "shell-popout" }, no_anim = true })
hl.config({ decoration = { rounding = 14, blur = { enabled = true, size = 6, passes = 2,
            vibrancy = 0.16 }, shadow = { enabled = true, range = 14, render_power = 3 } } })
```

- **One owner per surface.** A surface opened from a trigger (popout, menu, tooltip) animates in
  QML with its origin at the trigger, and its namespace gets `no_anim = true`. A surface with no
  trigger (notification, OSD, a bar appearing) may use the compositor: the `layersIn` leaf with
  `speed = 2, style = "fade"` and a faster `layersOut`. Never both. A launcher toggle gets
  neither.
- **Workspace switches** are keyboard-driven and constant: `workspaces` off.
- **Blur of a shell surface is set at runtime while it is shown, never a standing layer rule.**
  An always-mapped transparent surface (a session backdrop) is blurred behind its region whatever
  its alpha, so a standing rule blurs the whole desktop for good. The shell adds the rule when
  the surface appears, removes it when it hides, and clears any leftover at startup.
- **Rounding is one value** in `decoration`, and the shell's radii follow it. Blur size and
  passes stay small: heavy blur costs every frame on a weak GPU.
- **Motion off** is `hl.config({ animations = { enabled = false } })`. It is a test for whether
  an animation causes a frame drop, not the reduced-motion form (that is clamped in `Motion`).
- A `loop` on an `*angle` leaf keeps the GPU rendering at the refresh rate always: avoid it.
- A compositor leaf costs frames through the surface it animates: more with window size and
  refresh rate (`hyprctl monitors`).

## Motion on a shell surface

The numbers are animate's; this is how they land here.

- Durations and curves are tokens (`Motion`, else `Theme`; with none, say so and ask). Never a
  literal in a component. Reduced motion is clamped in `Motion`, nowhere else.
- `Behavior on opacity { NumberAnimation { duration: Motion.<name>; easing.type:
  Easing.BezierSpline; easing.bezierCurve: [0.23, 1, 0.32, 1, 1, 1] } }`: the array is x1, y1,
  x2, y2, then `1, 1`. ease-in-out `[0.77, 0, 0.175, 1, 1, 1]`, drawer `[0.32, 0.72, 0, 1, 1, 1]`.
- A `Behavior` retargets from the current value, so it is the transition; a `NumberAnimation`
  with a fixed `from` restarts and is the keyframe. Use `Behavior` for anything triggered often.
- Enter on `opacity` and `scale` from 0.95 with the origin at the trigger. Animate `opacity`,
  `scale`, `x`, `y`; not `width` or `height`, which re-lay-out children. Gestures use
  `SpringAnimation { spring; damping; mass }`.
- A layer-shell window vanishes the moment it is hidden, so an exit keeps it visible until the
  motion ends: `visible: open || content.opacity > 0`.
- No state changes the hit area's bounds; a press scale is a transform and is allowed. Every
  tappable item shows a pressed state.
- Review checks: ease-in (`Easing.InQuad`, `InCubic`) on UI; a literal `duration:`; animated
  `width` or `height`; a fixed-`from` animation where a `Behavior` belongs; a hidden window with
  no exit; a hover that changes the hit area; reduced motion not clamped. On Hyprland: the
  built-in `default` curve on a window or layer; speed over 3 without reason; any animation on
  `workspaces`; `popin` below 90 percent.
- Survey and gaps: a `visible:` flip with no `Behavior`; a leaf with `enabled = false` that a
  surface needs. A plan names targets as `Behavior` + `Easing.BezierSpline` + token duration.
- Speed: animators (`OpacityAnimator`, `ScaleAnimator`, `XAnimator`, `YAnimator`,
  `RotationAnimator`) run on the render thread; a plain `NumberAnimation` runs on the GUI thread.
  Use an animator for motion that plays while the shell is busy. A `Behavior` on a property many
  children bind to re-evaluates every frame: animate one item and position children relative to
  it. `layer.enabled: true` caches a texture and costs GPU memory: only on an expensive item,
  measured. A `MultiEffect` blur or shadow animating every frame is the costly case.
  `QSG_RENDER_TIMING=1` prints frame timing, `QSG_VISUALIZE=overdraw` shows paint cost; a claim
  made from code alone is "from code".

## Materials

- The window needs `color: "transparent"` and a translucent fill from `Theme`, with the on-pair
  measured over the blur, not over the fill alone. Opacity belongs to the fill colour, never to
  the item, because item opacity fades the text with it.
- Reduced transparency is a `Theme` flag that swaps in the solid fill.
- Press feedback is the control's own state, timed from `Motion`. `font.letterSpacing` is in
  pixels, so convert tracking from em per size.

## Stress and variants

- Worst-case data: a property on a debug singleton every model reads through one binding, flipped
  over IPC:
  `IpcHandler { target: "debug"; function data(mode: string): void { Debug.data = mode; } }`, then
  `qs ipc -p <shell.qml> call debug data worst`. Gate it on an environment variable. Feed a bar
  module a title wider than itself and an empty one: it elides (`elide: Text.ElideRight` with a
  bounded `Layout.maximumWidth`, middle for paths) and the bar holds. A `Layout.fillWidth` text
  without `Layout.minimumWidth: 0` pushes siblings off. Text running over a neighbour means no
  `elide` and no width bound.
- Variants: a `property int variant` on the debug singleton read by a `Loader` that picks one
  component per variant, flipped by `IpcHandler { target: "proto"; ... }` and
  `qs ipc -p <shell.qml> call proto pick 2`. Variants live in a directory the production shell
  does not import, and load in the real bar or popout position so the neighbours are real.
  Replay sets the `Loader`'s `active` to false, then true.

## Driving it for a11y-audit

- Focus the window with `hyprctl dispatch focuswindow <selector>`, then send keys with
  `wtype -k Tab`, `wtype -M shift -k Tab -m shift`, `wtype -k Escape`.
- A Qt or QML app (Quickshell included) is absent from the accessibility tree unless launched
  with `QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1`: relaunch with it before calling the tree unreachable.

## Red flags

- When a popout's content exists only on hover, add the click and key route first, because a
  touch, keyboard or screen-reader user cannot see it.
- When a standing layer rule mentions blur, remove it and set it at runtime, because it blurs the
  desktop behind a surface that is mapped but empty.
- When both QML and a layer leaf animate one surface, give it to one owner, because the two
  fight and the exit flickers.

## Say it in the reply

- The surface kind and which of the rules above shaped it.
- For Hyprland: the lines changed and which owner animates each surface.
- What was run and what was not: "Not verified on the composed surface" with each owner check as
  surface, route, expected state.

Sources: KDE HIG (CC-BY-SA-4.0) and GNOME HIG, paraphrased; hyprwm/hyprland-wiki
(BSD-3-Clause); emilkowalski/skills (MIT); Apple WWDC design talks.
