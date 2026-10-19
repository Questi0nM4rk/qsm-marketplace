---
name: qml-ui
description: "Use when writing or changing Quickshell/QML UI on Hyprland: a bar, panel, popout, OSD, launcher, or any layer-shell window, and when a QML surface must be made checkable by the audits. Triggers: add a popout to my Quickshell bar, new QML component, my panel overlaps maximized windows, exclusive zone, layer shell, Theme singleton, qmllint, qmlformat, dump the item tree, make this match the rest of the shell, udelej popout do quickshellu, panel prekryva okna. Stack only: what the tokens should be is ui-design, measuring the result is ui-audit, criteria are a11y-audit."
---

# QML UI

Quickshell is niche and moves fast, so an unaided model writes plausible QML that hard-codes a
colour, guesses an exclusive zone, or cannot be measured afterwards. This skill serves the person
who builds a shell and must answer for how it looks and whether everyone can use it: build on the
shell's existing tokens, make the layer-shell windows reserve the right space, and leave a way to
read the real geometry back. Why the tokens are what they are: ui-design. Why a control needs a
name, keyboard path, or reduced motion: a11y-audit. Motion rules: animate and review-animations.
This skill does not choose values, audit, or restyle what was not asked.

## Before the first line

1. **Confirm the stack.** `shell.qml` with `import Quickshell` in the project, and `qs list --all`
   shows the running instance with its config path. Anything else is not this skill.
2. **Find the token source.** The shell's `Theme` singleton (`pragma Singleton`, usually under
   `theme/`) plus any `Motion` singleton, and the design source if one exists. Read both fully and
   the nearest existing component to the one you build. Match its structure, because the shell is
   one product and a second dialect is a defect. With no singleton, say so and ask for the design
   source; do not invent tokens inside a component. When the shell cannot be read, write
   `Theme.<role>` and `Motion.<name>`, list those names as assumed to be matched to the singleton
   before merge, never a literal and never a new object.
3. **Reuse before building.** Search the shared component library by concept before writing any
   visible control, in a consumer of the library too, then Qt Quick Controls. When a type already
   does the concept, use it and add the missing slot or value to it. A consumer never defines a
   control named after where it is used (`PopoutRow`, `OsdSlider`), because that is a second copy
   that drifts, and a system control brings focus, keyboard handling, and accessibility that a
   custom one must redo.
4. **Open every file the owner named** (plugin, PDF, spec) before the first edit. If one is
   missing, say so in the first reply, because an answer built without it is rebuilt.

## Rules

- **No literal in a component.** Every colour, size, radius, spacing, and duration is a
  `Theme.` / `Motion.` property. A missing token means add it to the singleton in the design
  source's name and fill the dark and light values, never a literal beside it, because a literal
  is invisible to a theme switch and to the audit's token trace.
- **Pairs travel together.** A fill token and its on-token (`primary` / `onPrimary`) are read
  together in one item. Colours are bindings to the singleton so a theme swap reaches every
  consumer; never copy a colour into a local `property color`.
- **Durations come from `Motion`, easing from its curves.** If the `Motion` singleton clamps
  durations for reduced motion, use it, because a component that bypasses it breaks the setting
  for the whole shell; if it does not clamp, add the clamp there, not in components.
  Hover and press change colour, opacity, or elevation, never `width`/`height`/`x`/`y` of the
  hit area, because a moving bounds under the pointer flickers the state.
- **A hover surface** opens on entry, stays open while the pointer is inside the union of its
  trigger, panel and the path between them, and closes 180 ms after leaving it (ux-audit check 3).
  Name the state by what the pointer does (`hovered`), never `held`, and never delay the opening,
  because the owner ruled this and a delayed rollout reads as broken.
- **Integer geometry.** A fractional `x`/`y`/`width` blurs a 1 px edge. Round computed sizes
  (`Math.round`, `Math.ceil` for text-driven ones). Position with `anchors` or `Layout`, never
  both on one item (a binding loop warning is the symptom), and use `Layout` where the content
  size drives the parent.
- **Reserved space is an exclusive zone, never a margin.** A bar or dock is a `PanelWindow`
  anchored to its edge. `exclusionMode: ExclusionMode.Auto` (the default) derives the zone from
  the window's size and anchors; setting `exclusiveZone` switches the window to `Normal`, which
  reads that number; `Ignore` reserves nothing and is right only for overlays. A zone needs one
  anchored edge, or three (a full-width bar). Read the window's mode and zone before changing
  anything. Content windows must not paint into
  reserved space: a margin that mimics a bar's width breaks the day the bar changes.
- **One window set per output.** `Variants { model: Quickshell.screens }` with the screen as
  `required property var modelData`, and `screen: modelData` on the window. A window made once
  lands on one monitor, which is the usual reason a panel overlaps maximized windows on the
  second.
- **Scale is per output.** Item coordinates are logical pixels and a screenshot is physical:
  divide pixel positions by the output's `scale` (`hyprctl monitors -j`) before comparing them
  with the tree. At a fractional scale such as 1.2, integer logical geometry still lands on
  fractional pixels, so judge a smear with the tree, not the picture.
- **Expose what an assistive tool needs.** Interactive custom items get `Accessible.role`,
  `Accessible.name`, and a keyboard path (`activeFocusOnTab`, `Keys.onReturnPressed`,
  visible focus), because a bare `MouseArea` is invisible to the keyboard and to the platform
  tree. The criteria are a11y-audit's.

## Make it checkable

Quickshell has no built-in item-tree dump, so the shell exposes one through an `IpcHandler`; if
the shell already has one (`qs ipc -p <shell.qml> show` lists targets and functions; look for
`inspect`), use it. If not, add this and nothing more:

```qml
function dump(item: var): var {
    const o = item.mapToItem(null, 0, 0);
    const e = { type: String(item).split("(")[0].replace(/^QQuick/, ""),
                x: o.x, y: o.y, w: item.width, h: item.height };
    if (item.objectName !== "") e.name = item.objectName;
    if (item.color !== undefined) e.color = String(item.color);
    if (item.radius !== undefined) e.radius = item.radius;
    const kids = Array.from(item.children, c => dump(c));
    if (kids.length) e.children = kids;
    return e;
}
IpcHandler { target: "probe"; function tree(): string { return JSON.stringify(dump(win.contentItem)); } }
```

`win` is a window's `id`; for a full scene use its `contentItem`. Read it with
`qs ipc -p <shell.qml> call probe tree | jq`; use `-p` or `-c` because a bare `qs ipc` looks for
a `default` config and fails on a named one. Positions are window-relative logical pixels, so a
`10.5` is a fractional position, and sizes are what the layout produced, not what the code
asked. Give the items under test an `objectName` so the audit finds them. Reserved space on
screen: `hyprctl monitors -j | jq '.[] | {name, scale, reserved}'` (`reserved` is left, top,
right, bottom). Hand the tree and the reserved numbers to ui-audit as live geometry; to measure
this UI, it is the introspection surface.

## Gates, in this order

1. `qmlformat -i <file>` (it sorts imports; `-n` keeps the order if the project's files do not).
2. `qmllint <file>`, clean. Without import paths it may report Quickshell and `qs.*` types as not
   found (`-I <dir>` points it at qmltypes); read any other warning as real. Fix warnings, do not
   silence them.
3. Run the shell only when the owner asked (`qs -p <shell.qml>`, then dump the tree: the item sits
   where the design source says, at integer geometry, no literal left). Otherwise end the reply
   with "Not verified on the composed surface" and list each owner check as surface, route
   (pointer, key, IPC), expected state. A clean `qmllint` proves syntax only, so never write
   "fixed" or "works" for pointer, drag, hover, focus or animation behaviour on lint or a unit
   test; the owner tests and judges.

## Red flags

- When you type `#` followed by hex, or a number next to `radius`, `spacing`, `duration`, or
  `margins`, stop and use a token, because the literal is the defect the audits will measure.
- When a panel overlaps windows on one monitor, read `reserved` and the window's anchors and
  `exclusionMode` for that output before touching a margin, because the cause is nearly always a
  zone or a missing per-output window.
- When `qmllint` is clean but the surface renders empty, check the log (`qs log`) for a binding
  or import error, because lint does not see runtime type failures.
- When you add a second `Theme`-like object or a new colour property inside a component, move it
  to the singleton, because a theme switch only reaches the singleton.
- When you are about to replace a Qt control with a custom one, say what the control cannot do,
  because otherwise you rebuilt focus and keyboard handling for nothing.
- When a property or id is named `on<Capital>` (a Qt signal handler) or `size`, `radius`, `live`
  on an Item, rename it, because it crashes the load or drops the config silently.
- When there is no running shell to dump, say the geometry is unverified, because a layout read
  from code is a hypothesis.

## Say it in the reply

- Which tokens the change uses and any token it added, with the file.
- The `qmlformat` / `qmllint` result, and whether the surface was run, or the owner-check list.
- How to dump the tree for the new item (the target and the `objectName`), or that it was not
  run.
- For a reserved-space change: the `reserved` numbers before and after, or that they were not
  read.
