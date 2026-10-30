#!/usr/bin/env bash
# One instance: its own display, its own browser, one page to watch it on.
set -euo pipefail

# Firefox runs out of shared memory on the 64 MB a container gets by default.
shm_kb=$(df -k /dev/shm | awk 'NR==2{print $2}')
if [ "${shm_kb:-0}" -lt 1000000 ]; then
  echo "browserbox: /dev/shm is ${shm_kb}KB; start the instance with --shm-size=2g" >&2
fi

# The instance shares the host's network, so its port and its X display number must not clash with
# another instance or the host's own display: both derive from the instance's port.
port="${QSM_BROWSERBOX_PORT:?browserbox: QSM_BROWSERBOX_PORT is not set}"
display=":$((port - 10000))"

# Xvnc names an abstract socket after its own process id, KasmVNCSock<pid>, and abstract sockets
# live in the network namespace this instance shares with the host and every other instance. Each
# container starts the same processes, so Xvnc would get the same pid in each and the second
# instance fails to bind. Spending as many process ids as the port's offset first gives each
# instance its own.
for ((spent = 0; spent < port % 1000; spent++)); do /bin/true; done

# Xvnc is the display and the streaming server in one. It listens on the host's loopback
# address only, on the instance's port, which is the only way in. A public IP is given, so it
# never asks a server on the internet for one.
Xvnc "$display" \
  -geometry 1280x1024 -depth 24 \
  -interface 127.0.0.1 -websocketPort "$port" \
  -httpd /usr/share/kasmvnc/www \
  -sslOnly 0 -SecurityTypes None -disableBasicAuth \
  -FreeKeyMappings \
  -publicIP 127.0.0.1 \
  -Log '*:stdout:30' >/tmp/kasmvnc.log 2>&1 &

export DISPLAY="$display"
for _ in $(seq 1 50); do
  xdpyinfo -display "$display" >/dev/null 2>&1 && break
  sleep 0.1
done
xdpyinfo -display "$display" >/dev/null 2>&1 || {
  echo "browserbox: the display never came up" >&2
  exit 1
}

echo "browserbox: live view on 127.0.0.1:$port (${QSM_BROWSERBOX_LIVE_VIEW:-unmapped})"
exec /opt/venv/bin/python /opt/driver/daemon.py
