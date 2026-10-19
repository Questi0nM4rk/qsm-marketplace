---
name: qml-ui
description: "Use when writing or changing QML in a Quickshell shell: a new component, bindings, delegates, layouts, Loader, the Theme singleton, exclusive zone and layer-shell windows, and when a QML surface must be made checkable by the audits. Triggers: new QML component, add a popout to my Quickshell bar, my panel overlaps maximized windows, Quickshell exclusive zone, QML Theme singleton, qmllint, qmlformat, QML delegate, QML Loader, dump the QML item tree, udelej komponentu v quickshellu, panel prekryva okna. QML code only: what a bar, popout or OSD is and does, desktop rules, Hyprland config and motion forms are desktop-ui; token values are ui-design; measuring is ui-audit."
---

# QML UI

Quickshell is niche and moves fast, so an unaided model hard-codes a colour, guesses an exclusive
zone, or leaves nothing to measure. This skill builds on the shell's tokens, reserves the right
space, and leaves a way to read geometry back. It is how QML is written; what a bar, popout
or OSD is and does, the desktop rules and the Hyprland config are desktop-ui. Values: ui-design.
Names, keyboard, reduced motion: a11y-audit.

## Before the first line

1. **Confirm the stack.** `shell.qml` with `import Quickshell` in the project, and `qs list --all`
   shows the running instance with its config path. Anything else is not this skill.
2. **Find the token source.** The shell's `Theme` singleton (`pragma Singleton`, usually under
   `theme/`), the `Motion` singleton when it has one, and the design source if one exists. Read
   them and the nearest existing component to the one you build; match its structure, because a
   second dialect is a defect. With no singleton, say so and ask for the design source; never
   invent tokens inside a component. Shell unreadable: write `Theme.<role>` and list those names
   as assumed.
3. **Reuse before building.** Search the shared component library by concept before writing any
   visible control, in a consumer of the library too, then Qt Quick Controls. When a type already
   does the concept, use it and add the missing slot to it. A consumer never defines a control
   named after where it is used (`PopoutRow`, `OsdSlider`), because that is a second copy that
   drifts, and a system control brings focus and keyboard handling a custom one must redo.
4. **Open every file the owner named** (plugin, PDF, spec) before the first edit; if one is
   missing, say so in the first reply.

## Rules

- **No literal in a component.** Every colour, size, radius, spacing, and duration is a
  `Theme.` / `Motion.` property. A missing token means add it to the singleton in the design
  source's name and fill the dark and light values, never a literal beside it, because a literal
  is invisible to a theme switch and to the audit's token trace.
- **Pairs travel together.** A fill token and its on-token (`primary` / `onPrimary`) are read
  together in one item. Colours bind to the singleton; never copy one into a local
  `property color`, or a theme swap misses it.
- **Durations and easing come from the motion tokens** (`Motion`, else `Theme`; with none, say so
  and ask). Reduced motion is clamped in the singleton, nowhere else, because a component that
  bypasses it breaks the setting for the whole shell. How a surface animates is desktop-ui. A
  tappable item reads `TapHandler.pressed`.
- **Integer geometry.** A fractional `x`/`y`/`width` blurs a 1 px edge. Round computed sizes
  (`Math.round`, `Math.ceil` for text). Position with `anchors` or `Layout`, never
  both on one item; `Layout` where the content size drives the parent.
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
- **Scale is per output.** Tree coordinates are logical, a screenshot is physical: divide by the
  output's `scale` (`hyprctl monitors -j`) before comparing.
- **Expose what an assistive tool needs.** Interactive custom items get `Accessible.role`,
  `Accessible.name`, and a keyboard path (`activeFocusOnTab`, `Keys.onReturnPressed`, visible
  focus), because a bare `MouseArea` is invisible to both.

## Libraries

- `Quickshell.Services.*` for system state: Pipewire (volume, devices), Mpris (players), UPower
  (battery), SystemTray, Notifications. Not `pactl`, `playerctl` or `upower` in a `Process`.
- `Quickshell.Hyprland` for workspaces, the focused client, `GlobalShortcut` (`hyprctl` only for
  the rest); `Quickshell.Io` for `Process`, `FileView`, sockets, `IpcHandler`; `Quickshell.Wayland`
  for layer-shell options and toplevels.
- Qt Quick Controls and Layouts for controls and sizing, `MultiEffect` (Qt 6.5+) for blur and
  shadow, never `QtGraphicalEffects`; pointer handlers (`TapHandler`, `HoverHandler`,
  `DragHandler`) over `MouseArea`, because `MouseArea` takes exclusive grabs that steal touch.
- A customised `contentItem`, `background`, `indicator` or `handle` needs a named style import
  (`QtQuick.Controls.Basic`), or the default style can render over it.

## Conventions

Qt's QML coding conventions and the qt-qml-review checklist, the stricter form where they differ:

- **Declaration order in an object** (checklist ORD-1): `id` (`id: root` on a component's top
  item), property assignments, property declarations, signal declarations, attached properties,
  `states`, `transitions`, signal handlers, child objects (visual first), functions. Group related
  properties (`anchors { }`, `font { }`).
- **Bindings:** never assign a property in JavaScript when it has a binding, because the
  assignment replaces the binding for good and `qmllint` does not catch it; restore reactivity
  with `Qt.binding(() => expr)`. Typed properties (`int`, `string`, `color`), never
  `property var` for typed data. `readonly property` caches an expensive expression; `let` or
  `const` and `===` in JS; never anchor to an invisible item or across unrelated branches, and
  never size by `implicitWidth` bindings that feed back.
- **Delegates:** `required property` for model data, and once one exists `index` and `modelData`
  are no longer injected, so declare them too. `pragma ComponentBehavior: Bound` when a delegate
  reads outer ids. No nested Repeaters or several Loaders in one. In a delegate `parent` is its
  internal container, not the view: use `ListView.view` or an id. `currentIndex` starts at 0, not
  -1, once a model is set: reset it when no item should be current.
- **Layouts:** never set `width` or `height` on a Layout child (use `Layout.preferredWidth` and
  the like) and never `x` or `y`, because the first breaks size negotiation and the second is
  ignored. A reusable component sets `implicitWidth` and `implicitHeight`.
- **Connections:** always set `target`, because the default is `parent` and a handler lands on
  the wrong object when the parent type changes. Write `function onFoo()`, not `onFoo:`.
- **Lifetime:** guard on `Loader.status`; never switch a Loader between `source` and
  `sourceComponent`. Never `Qt.createQmlObject` (it parses a string on every call) and never
  `Qt.createComponent` with a string URL (not type-safe): use a `Component` or a typed URL. Hold
  a `createObject()` result in a variable or give it a parent, or the GC can take it, and destroy
  it when done.
- **Hiding:** `visible: false` removes an item from rendering and input; `opacity: 0` keeps both,
  so a closed popout would still take the pointer.
- **States:** a `Transition` states its `from` and `to`, or it fires on every state change. A
  reusable component with states uses `StateGroup`, not top-level `states`.
- **Cost:** `Image` gets `sourceSize` and `asynchronous: true`; `Text.PlainText` unless rich text
  is needed; avoid a transparent `Rectangle` and `clip` unless measured. `layer.enabled: true`
  caches a texture and costs GPU memory: only on an expensive item, measured.

## Stress and variants

- Worst-case data: a debug singleton every model reads through one binding, flipped over IPC and
  gated on an environment variable: `IpcHandler { target: "debug"; function data(mode: string):
  void { Debug.data = mode; } }`, then `qs ipc -p <shell.qml> call debug data worst`. A bar module
  fed a title wider than itself elides (`elide: Text.ElideRight`, bounded `Layout.maximumWidth`);
  a `Layout.fillWidth` text needs `Layout.minimumWidth: 0` or it pushes siblings off.
- Variants: a `variant` property on that singleton read by a `Loader` per component, flipped by
  `IpcHandler { target: "proto"; ... }` (`call proto pick 2`). Variants live outside the
  production import path; replay sets the `Loader`'s `active` to false, then true.
- `font.letterSpacing` is in pixels: convert tracking from em per size.

## Make it checkable

Quickshell has no item-tree dump, so the shell exposes one through an `IpcHandler`; use the
shell's own if it has one (`qs ipc -p <shell.qml> show` lists targets; look for `inspect`), else
add this and nothing more:

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
IpcHandler { target: "probe"
             function tree(): string { return JSON.stringify(dump(win.contentItem)); } }
```

`win` is a window's `id`. Read it with `qs ipc -p <shell.qml> call probe tree | jq`; use `-p` or
`-c`, because a bare `qs ipc` looks for a `default` config. Positions are window-relative logical
pixels. Give the items under test an `objectName`. Reserved space: `hyprctl monitors -j | jq '.[]
| {name, scale, reserved}'` (`reserved` is left, top, right, bottom). Hand both to ui-audit as
live geometry.

## Gates, in this order

1. `qmlformat -i <file>`.
2. `qmllint <file>`, clean. Without import paths it may report Quickshell and `qs.*` types as not
   found (`-I <dir>` points it at qmltypes); read any other warning as real. Fix warnings, do not
   silence them.
3. Run the shell only when the owner asked (`qs -p <shell.qml>`, then dump the tree). Otherwise end
   with "Not verified on the composed surface" and list each owner check as surface, route,
   expected state: geometry read from code is a hypothesis, and lint proves syntax only, so never
   write "works" for pointer, hover, focus or animation behaviour.

## Red flags

- A hex, or a number beside `duration`, `radius` or `spacing`: use a token.
- When a panel overlaps windows on one monitor, read `reserved`, the window's anchors and
  `exclusionMode` for that output before touching a margin: the cause is nearly always a zone or
  a missing per-output window.
- When `qmllint` is clean but the surface renders empty, read `qs log`: lint misses runtime type
  failures.
- When a property or id is named `on<Capital>`, or `size`, `radius`, `live` on an Item, rename
  it: it crashes the load or drops the config silently.

## Say it in the reply

- The tokens used and any added, with the file.
- The `qmlformat` / `qmllint` result, whether the surface was run (or the owner checks), and the
  dump target and `objectName`.
- For reserved space: the `reserved` numbers before and after, or that they were not read.

Sources: TheQtCompanyRnD/agent-skills qt-qml-review (BSD-3-Clause), Qt QML coding conventions.
