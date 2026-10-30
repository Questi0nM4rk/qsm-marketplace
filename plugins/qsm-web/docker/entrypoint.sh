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

# The instance runs as the host user's uid, which owns no home directory in the image. Everything
# that writes (xpra's sockets, the X authority file, the browser's profile) goes to a runtime
# directory this user creates; the browser cache baked into the image is only read, through links
# to its entries, because Camoufox also writes its own files beside them. Xpra looks its user up by
# uid and fails for one the image has no entry for, so a passwd and group file with that uid, kept
# in the runtime directory, answer the lookup through libnss-wrapper.
export HOME=/tmp/box-home
export XDG_RUNTIME_DIR=/tmp/xpra-run
mkdir -p "$HOME/.cache/camoufox" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"
ln -sfn /home/box/.cache/camoufox/* /home/box/.cache/camoufox/.[!.]* "$HOME/.cache/camoufox/"
uid=$(id -u)
gid=$(id -g)
{
  grep -v "^[^:]*:[^:]*:$uid:" /etc/passwd
  echo "box:x:$uid:$gid:box:$HOME:/usr/sbin/nologin"
} >"$XDG_RUNTIME_DIR/passwd"
{
  grep -v "^[^:]*:[^:]*:$gid:" /etc/group
  echo "box:x:$gid:"
} >"$XDG_RUNTIME_DIR/group"
export NSS_WRAPPER_PASSWD="$XDG_RUNTIME_DIR/passwd" NSS_WRAPPER_GROUP="$XDG_RUNTIME_DIR/group"
export LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libnss_wrapper.so

# The live view has no login of its own, and any web page open in the person's browser can reach
# a loopback port, so the server asks for a password: a random token that exists only in this
# file. The host reads it from here to build the live-view address; it is never printed or logged.
token_file=/run/bbox.token
(
  umask 077
  od -An -N24 -tx1 /dev/urandom | tr -d ' \n' >"$token_file"
)

# Xpra is the display and the streaming server in one. Its web client listens on the host's
# loopback address only, on the instance's port, which is the only way in. No abstract socket of
# its own and no mDNS announcement, so nothing else is reachable or advertised; the X server
# xpra starts gets the stock command plus -nolisten local, which drops its abstract socket. Desktop
# mode lets the viewer resize the display to its tab. Everything that would act on the host from
# the viewer is off, and the clipboard only runs from the viewer to the browser.
xvfb="Xvfb -screen 0 8192x4096x24 +extension GLX +extension RANDR +extension RENDER +extension Composite -extension DOUBLE-BUFFER -nolisten tcp -nolisten local -noreset -auth \$XAUTHORITY"
xpra start-desktop "$display" --start-child=openbox --daemon=yes --log-file=/tmp/xpra.log \
  --xvfb="$xvfb" --socket-dir="$XDG_RUNTIME_DIR/xpra" --socket-dirs="$XDG_RUNTIME_DIR/xpra" \
  --bind=noabstract --bind-tcp=127.0.0.1:"$port" --html=on --mdns=no \
  --tcp-auth=file:filename="$token_file" --ws-auth=file:filename="$token_file" \
  --pulseaudio=no --notifications=no --printing=no --webcam=no --speaker=no --microphone=no \
  --open-url=no --open-files=no --file-transfer=no --remote-logging=no --http-scripts=off \
  --forward-xdg-open=no \
  --clipboard=yes --clipboard-direction=to-server \
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
# alone, so the watcher's own change raises no further work. A window that vanishes between the
# list and the call is not an error: the next event fits what is left.
fit_windows() {
  local w
  for w in $(wmctrl -l | cut -d' ' -f1); do
    xprop -id "$w" _NET_WM_STATE | grep -q MAXIMIZED_VERT \
      || wmctrl -i -r "$w" -b add,maximized_vert,maximized_horz \
      || true
  done
}
main_pid=$$
exec 3>&2
(
  set +e
  stdbuf -oL xev -root -event randr -event substructure \
    | while read -r line; do
      case "$line" in
        RRScreenChangeNotify* | ConfigureNotify*) sleep 0.3 && fit_windows ;;
        *) ;;
      esac
    done
  # xev ends only when the X server is gone, which is the live view gone: end the instance, so
  # nobody is left with a container that answers but shows nothing.
  echo "browserbox: the display went away; the instance is stopping" >&2
  echo "browserbox: the display went away; the instance is stopping" >&3
  kill -TERM "$main_pid"
) 2>>/tmp/watcher.log &

echo "browserbox: live view on 127.0.0.1:$port (${QSM_BROWSERBOX_LIVE_VIEW:-unmapped})"
exec /opt/venv/bin/python /opt/driver/daemon.py
