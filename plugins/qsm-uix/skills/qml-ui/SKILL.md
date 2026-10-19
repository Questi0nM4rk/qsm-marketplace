---
name: qml-ui
description: "Use when writing or changing Quickshell/QML UI on Hyprland: a bar, panel, popout, OSD, launcher, or any layer-shell window, and when a QML surface must be made checkable by the audits. Triggers: add a popout to my Quickshell bar, new QML component, my panel overlaps maximized windows, exclusive zone, layer shell, Theme singleton, qmllint, qmlformat, dump the item tree, make this match the rest of the shell, udelej popout do quickshellu, panel prekryva okna. Stack only: what the tokens should be is ui-design, measuring the result is ui-audit, criteria are a11y-audit."
---

# QML UI

Quickshell is niche and moves fast, so an unaided model hard-codes a colour, guesses an exclusive
zone, or leaves nothing to measure. This skill builds on the shell's tokens, reserves the right
space, and leaves a way to read real geometry back. Values: ui-design. Names, keyboard, reduced
motion: a11y-audit. Motion: animate and review-animations.

## Before the first line

1. **Confirm the stack.** `shell.qml` with `import Quickshell` in the project, and `qs list --all`
   shows the running instance with its config path. Anything else is not this skill.
2. **Find the token source.** The shell's `Theme` singleton (`pragma Singleton`, usually under
   `theme/`) plus any `Motion` singleton, and the design source if one exists. Read both fully and
   the nearest existing component to the one you build. Match its structure, because the shell is
   one product and a second dialect is a defect. With no singleton, say so and ask for the design
   source; do not invent tokens inside a component. Shell unreadable: write `Theme.<role>`
   and list those names as assumed.
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
  No state changes the hit area's bounds (animate: a press scale is a transform and is allowed),
  because moving bounds under the pointer flicker the state.
- **A hover surface** opens on entry, stays open while the pointer is inside the union of its
  trigger, panel and the path between them, and closes 180 ms after leaving it (ux-audit check 3).
  Name the state by what the pointer does (`hovered`), never `held`, and never delay the opening,
  because the owner ruled this and a delayed rollout reads as broken.
- **Integer geometry.** A fractional `x`/`y`/`width` blurs a 1 px edge. Round computed sizes
  (`Math.round`, `Math.ceil` for text-driven ones). Position with `anchors` or `Layout`, never
  both on one item, and use `Layout` where the content
  size drives the parent.
- **Reserved space is an exclusive zone, never a margin.** A bar or dock is a `PanelWindow` anchored
  to its edge. `exclusionMode: ExclusionMode.Auto` (the default) derives the zone from the window's
  size and anchors; setting `exclusiveZone` switches the window to `Normal`, which reads that
  number; `Ignore` reserves nothing and is right only for overlays. A zone needs one anchored edge,
  or three (a full-width bar). Content windows never paint into reserved space: a margin that mimics
  a bar's width breaks the day the bar changes.
- **One window set per output.** `Variants { model: Quickshell.screens }` with the screen as
  `required property var modelData`, and `screen: modelData` on the window. A window made once
  lands on one monitor, which is the usual reason a panel overlaps maximized windows on the
  second.
- **Scale is per output.** Item coordinates are logical pixels and a screenshot is physical:
  divide pixel positions by the output's `scale` (`hyprctl monitors -j`) before comparing them
  with the tree.
- **Expose what an assistive tool needs.** Interactive custom items get `Accessible.role`,
  `Accessible.name`, and a keyboard path (`activeFocusOnTab`, `Keys.onReturnPressed`,
  visible focus), because a bare `MouseArea` is invisible to the keyboard and the platform tree.

## Libraries

- `Quickshell.Services.*` for system state: Pipewire (volume, devices), Mpris (players), UPower
  (battery), SystemTray, Notifications. Not `pactl`, `playerctl` or `upower` in a `Process`.
- `Quickshell.Hyprland` for workspaces, the focused client, and `GlobalShortcut`; `hyprctl` only for
  what it does not expose.
- `Quickshell.Io` for `Process`, `FileView`, sockets and `IpcHandler`; `Quickshell.Wayland` for
  layer-shell options and toplevels; `Quickshell.Widgets` for `IconImage`, `ClippingRectangle`,
  `WrapperItem`.
- Qt Quick Controls and Layouts for controls and sizing, `MultiEffect` (Qt 6.5+) for blur and
  shadow, never `QtGraphicalEffects`; pointer handlers (`TapHandler`, `HoverHandler`,
  `DragHandler`) over `MouseArea` when touch or multi-device input matters.

## Conventions

Qt's QML coding conventions and the qt-qml-review rules, in our words:

- **Declaration order in an object:** `id` first (`id: root` on a component's top item), then
  properties, signals, functions, then child objects. Group related properties (`anchors { }`,
  `font { }`); spell out a handler's parameters, so a thing is found by position.
- **Delegates:** `required property` for model data, `pragma ComponentBehavior: Bound` when a
  delegate reads outer ids, and no nested Repeaters or several Loaders in one.
- **Bindings:** declarative, not `property var` plus imperative assignment; `readonly property` to
  cache an expensive expression; `let` or `const` and `===` in JS; never anchor to an invisible
  item or across unrelated branches, and never size by `implicitWidth` bindings that feed back.
- **Data flows one way:** functions call down, signals go up. A reusable component sets
  `implicitWidth` and `implicitHeight`, not `width` and `height`, so the consumer can resize it.
- **Lifetime:** guard on `Loader.status`, never switch a Loader between `source` and
  `sourceComponent`, destroy what `createObject()` made, null-check `parent` in a delegate.
- **Cost:** `Image` gets `sourceSize` and `asynchronous: true`; `Text.PlainText` unless rich text is
  needed; avoid a transparent `Rectangle`, `clip` and `layer.enabled` unless measured.

Hyprland also animates layer-shell surfaces (the `layersIn` and `layersOut` leaves). Which owner
a surface gets is animate's Hyprland section, never both. `loop` on an `*angle` leaf keeps the GPU
rendering at the refresh rate always, so avoid it. The config is Lua (Hyprland 0.55 and later).

Desktop rules from the KDE and GNOME human interface guidelines, paraphrased:

- One primary action per surface; a destructive one is set apart and undoable (a toast with Undo)
  rather than a confirmation dialog. Reserve a dialog for a blocking decision.
- Match feedback to its life: a toast for a finished action, a banner for a state that persists
  (offline, degraded), a spinner for a short wait, a progress bar with a count for a long one.
- An empty list shows an icon, a sentence and the action that fills it.
- Popouts close on Escape and on a click outside; an OSD is transient and never takes focus.
- Icons are monochrome, icon-only buttons carry a tooltip,
  and labels name the action, never "OK" or "Yes".

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
`qs ipc -p <shell.qml> call probe tree | jq`; use `-p` or `-c` because a bare `qs ipc` looks for a
`default` config and fails on a named one. Positions are window-relative
logical pixels. Give the items under test an
`objectName` so the audit finds them. Reserved space on screen:
`hyprctl monitors -j | jq '.[] | {name, scale, reserved}'` (`reserved` is left, top, right, bottom).
Hand the tree and the reserved numbers to ui-audit as live geometry.

## Gates, in this order

1. `qmlformat -i <file>`.
2. `qmllint <file>`, clean. Without import paths it may report Quickshell and `qs.*` types as not
   found (`-I <dir>` points it at qmltypes); read any other warning as real. Fix warnings, do not
   silence them.
3. Run the shell only when the owner asked (`qs -p <shell.qml>`, then dump the tree). Otherwise end
   with "Not verified on the composed surface" and list each owner check as surface, route,
   expected state. Lint proves syntax only: never write "works" for pointer, hover, focus or
   animation behaviour; the owner tests and judges.

## Red flags

- When you type `#` followed by hex, or a number next to `radius`, `spacing`, `duration`, or
  `margins`, stop and use a token, because the literal is the defect the audits will measure.
- When a panel overlaps windows on one monitor, read `reserved` and the window's anchors and
  `exclusionMode` for that output before touching a margin, because the cause is nearly always a
  zone or a missing per-output window.
- When `qmllint` is clean but the surface renders empty, check the log (`qs log`) for a binding
  or import error, because lint does not see runtime type failures.
- When a property or id is named `on<Capital>` (a Qt signal handler) or `size`, `radius`, `live`
  on an Item, rename it, because it crashes the load or drops the config silently.
- When there is no running shell to dump, say the geometry is unverified, because a layout read
  from code is a hypothesis.

## Say it in the reply

- Which tokens the change uses and any token it added, with the file.
- The `qmlformat` / `qmllint` result, whether the surface was run (or the owner checks), and the
  dump target and `objectName`.
- For a reserved-space change: the `reserved` numbers before and after, or that they were not
  read.

Sources: TheQtCompanyRnD/agent-skills qt-qml-review (BSD-3-Clause), Qt QML coding conventions,
hyprwm/hyprland-wiki (BSD-3-Clause), the GNOME HIG via Paresh-Maheshwari/gnome-skills
(CC-BY-SA-4.0), the KDE HIG (paraphrased), emilkowalski/skills (MIT).
