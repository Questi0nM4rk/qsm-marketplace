#!/usr/bin/env bash
# One instance: its own display, its own browser, one page to watch it on.
set -euo pipefail

# Firefox runs out of shared memory on the 64 MB a container gets by default.
shm_kb=$(df -k /dev/shm | awk 'NR==2{print $2}')
if [ "${shm_kb:-0}" -lt 1000000 ]; then
  echo "browserbox: /dev/shm is ${shm_kb}KB; start the instance with --shm-size=2g" >&2
fi

# Xvnc is the display and the streaming server in one. It listens only on the
# container's own port; the instance publishes that port on the host's
# loopback address, which is the only way in.
Xvnc :99 \
  -geometry 1280x1024 -depth 24 \
  -interface 0.0.0.0 -websocketPort 6080 \
  -httpd /usr/share/kasmvnc/www \
  -sslOnly 0 -SecurityTypes None -disableBasicAuth \
  -FreeKeyMappings \
  -Log '*:stdout:30' >/tmp/kasmvnc.log 2>&1 &

export DISPLAY=:99
for _ in $(seq 1 50); do
  xdpyinfo -display :99 >/dev/null 2>&1 && break
  sleep 0.1
done
xdpyinfo -display :99 >/dev/null 2>&1 || { echo "browserbox: the display never came up" >&2; exit 1; }

echo "browserbox: live view on container port 6080 (${QSM_BROWSERBOX_LIVE_VIEW:-unmapped})"
exec /opt/venv/bin/python /opt/driver/daemon.py
