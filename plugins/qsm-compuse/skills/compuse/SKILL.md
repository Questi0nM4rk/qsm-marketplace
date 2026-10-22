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
   stop input afterwards and say what the owner should inspect. A capture or input outside a
   slot needs `DRIVE_LIVE=1`; a subagent never sets it and never calls grim, wf-recorder or
   `hyprctl dispatch|reload|eval` itself, because a screencopy cut short crashed the owner's
   Hyprland once.

Measure before hand-over: `drive geom insets|overlap|inside|centre|target|dump` prints equations
with PASS/FAIL from the live item tree; `drive contrast A B` prints the WCAG ratio of two screen
regions.

Hit and hover zones are measured from pixels, so a story and the whole desktop work alike:
`drive hitmap zone X Y [--watch X,Y,WxH]` walks four rays from a responding seed to the edge where
the screen stops reacting and prints `zone 1512,12 → 1512..1536 x 0..24 = 24x24`;
`drive hitmap grid X,Y,WxH [--step N]` probes every cell and writes a PNG overlay. Restrict
`--watch` to the region the response lands in (a clock elsewhere is noise), and add `--settle MS`
for a slow rollout. A zone far larger than the glyph is the finding; compare it with `drive geom`.

Motion and routes: `drive record SECS [OUT|X,Y,WxH] [--fps N]` measures real cadence (read the
gaps, never trust a constant-rate encode); `drive frames VIDEO DIR` extracts frames;
`drive route FILE` runs a scripted step list on workspace 10 and restores the pointer.

Parallel review without the owner's session: `drive slot start NAME` launches a private headless
compositor, `drive slot bench NAME ROOT KEY` opens a Workbench story in it, and any verb with
`--slot NAME` (shot, record, move, click, type, key, geom, route) acts there; `drive slot ls`
shows the RSS, `drive slot budget` how many more fit, `drive slot stop NAME` removes everything.
A whole shell runs in a slot too, isolated from the owner's bus and state:
`XDG_STATE_HOME=DIR dbus-run-session -- drive slot run NAME -- qs --path SHELL`, then reach it with
`qs ipc --pid PID`. Quickshell in a slot may not hot-reload a saved file: restart it before you
trust its log. A recording or capture is deleted once measured, because the temporary filesystem
has a quota and a full one stops every run.
