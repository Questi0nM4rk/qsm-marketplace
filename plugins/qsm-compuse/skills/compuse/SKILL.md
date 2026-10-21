---
name: compuse
description: "Use when you need to actually operate this machine's desktop: move the real cursor, hover a widget, click, type, inject a keybind, or screenshot a live window on Hyprland/Wayland. Triggers: 'hover that button', 'click it and see', 'drive the UI', 'move my cursor', 'screenshot the popout', 'test the keybind', 'check it on the real screen'. Sudo-free. For judging what a capture looks like use qsm-uix ui-audit instead; this skill only DRIVES."
---

# Computer use

Drive the real session with `drive` (run it bare for the command list). Run `drive doctor`
first and stop on the first failed line. Setup and the background of every rule below are in
`USAGE.md` next to this plugin's scripts.

## Rules, each measured on this Hyprland

1. Anything that must behave like real input goes through ydotool. A compositor warp
   (`drive warp`) emits no motion event, so hover never fires; use `drive move`.
2. `ydotool mousemove --absolute` is accepted and silently does nothing. `drive move` makes
   damped relative steps and confirms with `hyprctl cursorpos` before it reports success; never
   believe a position you did not read back.
3. `hyprctl dispatch movecursor` is a parse error here. Dispatchers take the `hl.dsp.*` call
   shape, with `mods` always present.
4. `drive key` fires compositor keybinds; `drive sendkey` reaches only the focused client, and
   says `ok` either way. Test a keybind with `drive key`.
5. Logical pixels (item tree, cursor) and physical pixels (grim) differ by the output scale;
   convert with `drive l2p`. Shoot one output (`drive shot MON`), never the whole layout.
6. Wait for state, not time: `drive until 'CMD'` beats a blind sleep. Read geometry from the
   app's own item tree rather than from the screenshot.
7. Operate on workspace 10 and only when the owner asks. Announce pointer use before it starts,
   stop input afterwards and say what the owner should inspect.

Motion and routes: `drive record SECS [OUT|X,Y,WxH] [--fps N]` measures real cadence (read the
gaps, never trust a constant-rate encode); `drive frames VIDEO DIR` extracts frames;
`drive route FILE` runs a scripted step list on workspace 10 and restores the pointer.

Captures land under `${XDG_RUNTIME_DIR:-/tmp}/drive-shots` (override with `DRIVE_OUT_DIR`); hand
them to `ui-audit` for judgment.
