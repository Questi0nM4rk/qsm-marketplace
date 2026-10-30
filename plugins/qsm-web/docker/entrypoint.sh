#!/usr/bin/env bash
# One instance: its own display, its own browser, one page to watch it on.
set -euo pipefail

# Firefox runs out of shared memory on the 64 MB a container gets by default.
shm_kb=$(df -k /dev/shm | awk 'NR==2{print $2}')
if [[ "${shm_kb:-0}" -lt 1000000 ]]; then
  echo "browserbox: /dev/shm is ${shm_kb}KB; start the instance with --shm-size=2g" >&2
fi

# The instance shares the host's network, so its port and its X display number must not clash with
# another instance or the host's own display: both derive from the instance's port.
port="${QSM_BROWSERBOX_PORT:?browserbox: QSM_BROWSERBOX_PORT is not set}"
display=":$((port - 10000))"

# Xpra is the display and the streaming server in one. Its web client listens on the host's
# loopback address only, on the instance's port, which is the only way in. No abstract socket of
# its own and no mDNS announcement, so nothing else is reachable or advertised. Desktop mode lets
# the viewer resize the display to its tab.
export XDG_RUNTIME_DIR=/tmp/xpra-run
mkdir -p "$XDG_RUNTIME_DIR" && chmod 700 "$XDG_RUNTIME_DIR"
xpra start-desktop "$display" --start-child=openbox --daemon=yes --log-file=/tmp/xpra.log \
  --bind=noabstract --bind-tcp=127.0.0.1:"$port" --html=on --mdns=no \
  --pulseaudio=no --notifications=no --printing=no --webcam=no --speaker=no --microphone=no \
  --dbus-launch=no --systemd-run=no --exit-with-children=no --start-new-commands=no

export DISPLAY="$display"
for _ in $(seq 1 100); do
  xdpyinfo -display "$display" >/dev/null 2>&1 && break
  sleep 0.1
done
xdpyinfo -display "$display" >/dev/null 2>&1 || {
  echo "browserbox: the display never came up" >&2
  exit 1
}

# An unattached desktop starts at the server's maximum, 8192x4096; give it a size a tab can hold
# until a viewer resizes it.
xrandr --newmode 1280x800 0 1280 1328 1360 1440 800 803 809 823
xrandr --addmode screen 1280x800
xrandr --output screen --mode 1280x800

# Camoufox sizes its own window after the window manager placed it, so a window manager rule does
# not hold. Maximize every window when a window is mapped, resized or moved and when the display is
# resized: all are X events, so the watcher sleeps between them. A window already maximized is left
# alone, so the watcher's own change raises no further work.
fit_windows() {
  local w
  for w in $(wmctrl -l | cut -d' ' -f1); do
    xprop -id "$w" _NET_WM_STATE | grep -q MAXIMIZED_VERT \
      || wmctrl -i -r "$w" -b add,maximized_vert,maximized_horz
  done
}
(
  stdbuf -oL xev -root -event randr -event substructure \
    | while read -r line; do
      case "$line" in
        RRScreenChangeNotify* | ConfigureNotify*) sleep 0.3 && fit_windows ;;
        *) ;;
      esac
    done
) >/dev/null 2>&1 &

echo "browserbox: live view on 127.0.0.1:$port (${QSM_BROWSERBOX_LIVE_VIEW:-unmapped})"
exec /opt/venv/bin/python /opt/driver/daemon.py
