# qsm-compuse — sudo-free computer use on Hyprland/Wayland

Drive the real cursor, keyboard and mouse buttons on a live Hyprland session, then screenshot
what happened. No root, no X11, no `sudo`. Built while driving a live Quickshell desktop shell
to audit its UI.

Every verb that captures or sends input (`shot`, `record`, `route`, `contrast`, `move`, `click`,
`key`, `type`, `scroll` and their siblings) refuses on the owner's live session unless it runs in a
slot (`DRIVE_SLOT=NAME`) or `DRIVE_LIVE=1` is set, because a screencopy cut short crashed the
owner's Hyprland once (SIGBUS in its shm copy). Read-only verbs (`mons`, `pos`, `focused`, `geom`)
need neither.

```bash
export DRIVE_LIVE=1              # the owner asked for live input on this session
drive doctor                     # check every dep + permission first
drive mons                       # outputs, physical AND logical size, scale
drive move 30 546                # cursor to logical 30,546
drive shot - hover               # grim the focused output -> $DRIVE_OUT_DIR/hover.png
drive key SUPER H                # inject a keybind
drive click                      # left click where the cursor is
```

## Why two tools, not one

This is the whole reason the module exists. **Positioning and clicking go through different
tools on purpose.**

The rule: **anything that must behave like real input goes through ydotool.** The compositor's
own dispatchers are faster and exact, but they bypass the very paths that make input
*observable* — and both failures are silent.

| Job | Tool | Why |
| --- | --- | --- |
| Move the cursor so **hover fires** | `drive move` (ydotool relative feedback) | Real motion event, converged against compositor-reported logical coordinates. |
| Move the cursor with no side effects | `drive warp` (compositor) | Exact, instant, but emits **no motion event** — hover will not fire. |
| Click, type, scroll | `ydotool` | Hyprland has no click dispatcher. |
| Press a key **that fires a keybind** | `drive key` (ydotool keycodes) | Real events travel the input path, so binds run. |
| Send a key **into the focused app** | `drive sendkey` (compositor) | Injected past bind processing — the app sees it, binds do not. |

**Trap 1: a compositor warp does not generate a motion event.** `hl.dsp.cursor.move` puts the
pointer exactly where you ask — `hyprctl cursorpos` confirms it — and nothing under it reacts,
because Qt never receives motion and so never fires hover-enter. Measured: warping onto a rail
cell left its popout shut; the same coordinates through ydotool opened it. Every hover test
built on a warp silently reports "no reaction" for working UI. `drive move` uses ydotool.

**Trap 2: absolute `ydotool mousemove` axes are not layout pixels.** They can silently no-op on
Wayland, so `drive move` instead reads `hyprctl cursorpos -j`, advances with damped relative
ydotool motion, and repeats until the logical target is confirmed within one pixel. Negative
layout coordinates work the same way as positive coordinates; a target that cannot be reached
fails after a bounded number of steps.

**`send_shortcut` is the other trap, and it lies quietly.** It returns `ok` and does deliver the
key — to the focused *client*. Hyprland injects it **past its own bind processing**, so a
compositor keybind on that combo never runs. Measured on this machine: `drive sendkey SUPER
SHIFT B` returned `ok` and the shell's `railToggle` never fired, while `drive key SUPER SHIFT B`
toggled the rail immediately. If you are testing a keybind, you need a real key event —
`drive key`. `drive sendkey` exists only for typing into an application.

## Logical vs physical pixels

Two coordinate systems, and mixing them silently corrupts every measurement:

- **Logical** — what the compositor and your app's item tree use. Cursor moves take these.
- **Physical** — actual device pixels. `grim` writes these.

`logical = physical / scale`. A 1920x1080 output at `scale=1.2` is **1600x900 logical**. So a
widget the item tree reports at logical `x=30` sits at physical `x=36` in the screenshot.

```bash
drive mons                # prints both, side by side
drive l2p 30              # logical 30 -> physical 36 (scale 1.2)
```

Get this backwards and every "the gap is 12px" finding is wrong by the scale factor.

## Hyprland lua-dialect configs

If the config is `hyprland.lua` rather than `hyprland.conf`, **the legacy string dispatch form
is rejected outright**:

```bash
hyprctl dispatch movecursor 900 500
# error: ')' expected near '900'
```

Every dispatcher must use the `hl.dsp.*` call shape instead:

```bash
hyprctl dispatch 'hl.dsp.cursor.move({x=900,y=500})'      # ok
hyprctl dispatch 'hl.dsp.send_shortcut({mods="",key="Escape"})'
hyprctl dispatch 'hl.dsp.window.close()'
```

Two `send_shortcut` gotchas, both found the hard way (they apply to `drive sendkey`, not to
`drive key`, which uses real keycodes):

1. **`mods` is required even when empty.** Omitting it errors `'mods' is required`. Pass `""`.
2. **The key must exist in the active keymap.** `key="F13"` on a keyboard without F13 errors
   `key not found` — it is not a syntax error, and it looks identical to one.

`drive key` sidesteps both by pressing Linux input-event codes directly (`SUPER`=125, `B`=48,
`XF86AudioPlay`=164, …). Its `keycode()` table covers letters, digits, arrows, F-keys, the
media and level keys, and the common punctuation; an unmapped name fails loudly telling you to
add it rather than silently doing nothing.

## Permissions — the one-time setup

`ydotool` writes to `/dev/uinput`, which is `root:input` mode `crw-rw----`. Two requirements:

```bash
sudo usermod -aG input "$USER"   # then log out and back in — group membership is per-session
pgrep -x ydotoold || ydotoold &  # the daemon must be running
```

With `input` group membership `/dev/uinput` is group-writable, so **ydotool itself needs no
sudo** and neither does the daemon. `drive doctor` checks all four conditions (binary, daemon,
group, device writability) and tells you which one is missing.

## Driving a UI under audit

The loop that actually works:

```bash
drive move 30 546                                  # hover the widget
drive until 'myapp-status | grep -q popout=calendar'   # wait for STATE, not a sleep
drive shot - calendar
```

- **Poll state, never sleep blind.** `drive until 'CMD'` retries a shell condition 20x at 250ms.
  If the app exposes introspection (an IPC status call, an item tree), assert on that — a
  `sleep 0.5` after a 250ms animation is both slower and less reliable.
- **Read geometry from the app, not the screenshot.** If it can dump its item tree with real
  x/y/w/h, that is ground truth; pixel-measuring a screenshot is a hypothesis. Remember the
  tree is logical and the PNG is physical.
- **Enumerate states.** One resting frame is not an audit. Drive into every popout, panel and
  overlay, capture each, and list what you could not reach.
- **`grim -o <output>`, always.** Full-screen captures on a multi-monitor setup produce one
  wide image where nothing lines up with either output's coordinates.

## Reference

Run `drive` bare for the full command list. Notable ones beyond the basics:

| Command | Use |
| --- | --- |
| `drive nudge DX DY` | Relative move — probe a hover threshold without recomputing absolutes. |
| `drive key "SUPER SHIFT" B` | Real key event — **fires compositor keybinds**. |
| `drive key XF86AudioPlay` | Bare key, no modifier. Arg 2, if it is not a key name, is a settle time. |
| `drive sendkey SUPER B` | Into the focused app only; does NOT fire keybinds. |
| `drive until 'CMD' [tries]` | Poll until a condition holds. |
| `drive mclick` | Middle click — many UIs bind "close this" to it. |
| `drive scroll -3` | Wheel; negative is down. |
| `drive press [left\|right\|middle]` / `drive release [...]` | Hold and let go of a button, so a drag is press, move, release. |
| `drive focused` | Focused output name, for `grim -o`. |
| `drive l2p N [MON]` | Logical length to physical pixels. |
| `drive geom CHECK ...` | Measure the live item tree with equations and PASS/FAIL: `insets`, `overlap`, `inside`, `centre`, `target`, `dump` (selectors: `Rail/RailEntry[2]`, `*[type=Slider]`; run `drive geom`). |
| `drive contrast A B` | Grim the output, median colour of two rects (`SEL`, `SEL@ink` for the glyph pixel, or `X,Y`), WCAG ratio. |
| `drive hitmap zone X Y [--watch X,Y,WxH] [--settle MS] [--min-px N] [--park X,Y]` | Hit or hover zone from pixels: park the pointer, shoot a reference, probe the seed (logical px) and binary-search four rays to 1 px where the watch region (default the output) stops differing from the reference by `--min-px` changed physical pixels (default 16, channels off by more than 2%). A point responds only when two probes a park apart both do; a surface still open after the park gets up to three Escapes (and the run stops if it stays), and the pointer box is blanked in a slot because the compositor paints its cursor into shots. Prints each edge's equation and `zone X,Y → x0..x1 x y0..y1 = WxH`; exit 2 when the seed does not respond. Rays measure the seed's row and column, so a zone that is not a rectangle through the seed is under-read. `--settle` lengthens the wait of a slow rollout. A slot's software cursor is hidden for the run. |
| `drive hitmap grid X,Y,WxH [--step N] [--watch ...]` | Probe every `N` px (default 4) cell, print the map (`#` responds), the bounding rect of each connected area, and write `$DRIVE_OUT_DIR/hitmap-grid.png` (reference shot, responding cells tinted). Outside a slot it needs `DRIVE_LIVE=1` like `shot`. |
| `drive record SECS [OUT\|X,Y,WxH] [--fps N]` | Real-frame video (`--fps` is the target period the gaps are judged against; wf-recorder does not cap the rate) plus cadence from frame timestamps (effective fps, max gap, gaps over 1.5 periods); never constant-rate. |
| `drive frames VIDEO DIR [--every N]` | Extract the real frames as PNGs. |
| `drive route FILE [--workspace-ok]` | Run steps (`move-to X Y`, `hover-wait MS`, `press`, `release`, `click`, `key COMBO`, `wheel DY`, `shot NAME`) with before/after shots; workspace 10 only; pointer restored on exit. |
| `drive slot start NAME [--size WxH] [--scale S]` | Headless sway (gles2 on the first non-nvidia render node, pixman if gles2 fails) with its own Wayland socket and a held virtual pointer and keyboard; state in `$XDG_RUNTIME_DIR/drive-slots/NAME`. Never touches the owner's `WAYLAND_DISPLAY`. |
| `drive slot run NAME -- CMD...` | Run a client inside the slot (`QT_QPA_PLATFORM=wayland`, `HYPRLAND_INSTANCE_SIGNATURE` and `DISPLAY` removed, so it never reaches the owner's compositor). |
| `drive slot bench NAME ROOT KEY` | Start a Workbench session of story `KEY` of provider `ROOT` in the slot; `drive geom --slot` reads its item tree (scene coordinates, not output pixels). |
| `drive slot ls` / `drive slot stop NAME` | List slots with process count and summed RSS / kill every process of the slot (found by its `DRIVE_SLOT_ID` marker) and remove its files. |
| `drive slot budget [--reserve-mb N] [--per-slot-mb N]` | How many more slots fit: (MemAvailable - reserve, default 3072) / per-slot cost: the MemAvailable drop of a probe slot running a Workbench (`--provider ROOT`, default the current directory; `--story KEY`, default `level`), measured once and cached in the slot root (`--remeasure` repeats it, `--per-slot-mb` overrides it). |
| `drive VERB ... --slot NAME` (or `DRIVE_SLOT=NAME`) | `shot`, `record`, `frames`, `route`, `move`, `nudge`, `pos`, `click`, `rclick`, `mclick`, `type`, `scroll`, `key`, `sendkey`, `geom` `press`, `release` act on the slot (also as `route` steps) through one virtual pointer held by the slot, whose control FIFO takes absolute motion, buttons and wheel notches (`axis_source` wheel, `axis_discrete`, frame), and through wtype and grim; `warp`, `l2p`, `mons`, `doctor`, `contrast` refuse. Slot `move` is absolute motion on that device; the position is remembered for `nudge`. |
