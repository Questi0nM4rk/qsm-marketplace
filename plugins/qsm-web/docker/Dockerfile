FROM debian:12-slim

ENV DEBIAN_FRONTEND=noninteractive \
    LIBGL_ALWAYS_SOFTWARE=1 \
    HOME=/home/box \
    VENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH

# The streaming layer is Xpra in desktop mode: its server is the virtual display, the web server
# and the resize-to-viewer logic in one process, so the container needs no separate frame relay to
# put the browser in a person's browser. Xpra's own apt repository carries the pinned build.
ARG XPRA_VERSION=6.5.5-r0-1
ARG XPRA_HTML5_VERSION=21-r1-1
# The sha256 of the repository's signing key as published; a changed key fails the build here,
# before apt trusts anything signed with it.
ARG XPRA_REPO_FILE_SHA256=4df3209ea4b759f0b5838b60baedb6893ec62df7abad9046462176a6e6a7ed7d

RUN apt-get update && apt-get install -y --no-install-recommends \
      libgtk-3-0 libdbus-glib-1-2 libxt6 libasound2 libx11-xcb1 libxtst6 \
      libgl1-mesa-dri libglx-mesa0 \
      fonts-liberation fonts-noto-core \
      x11-utils xauth procps \
      python3 python3-venv python3-pip tini curl ca-certificates \
      openbox wmctrl x11-xserver-utils libnss-wrapper \
 && curl -fsSL -o /usr/share/keyrings/xpra.asc https://xpra.org/xpra.asc \
 && echo "${XPRA_REPO_FILE_SHA256}  /usr/share/keyrings/xpra.asc" | sha256sum --check --strict - \
 && printf 'Types: deb\nURIs: https://xpra.org\nSuites: bookworm\nComponents: main\nSigned-By: /usr/share/keyrings/xpra.asc\n' \
      > /etc/apt/sources.list.d/xpra.sources \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      "xpra=${XPRA_VERSION}" "xpra-x11=${XPRA_VERSION}" "xpra-html5=${XPRA_HTML5_VERSION}" \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt
RUN python3 -m venv "$VENV" && pip install --no-cache-dir -r /tmp/requirements.txt

# The stealth build's driver crashes on playwright 1.60 and later. Fail the
# build here rather than at the first fetch.
RUN python3 - <<'PY'
from importlib.metadata import version
v = tuple(int(x) for x in version("playwright").split(".")[:2])
assert v < (1, 60), f"playwright {version('playwright')} needs a pin below 1.60"
print("playwright pin holds:", version("playwright"))
PY

COPY driver/ /opt/driver/
COPY entrypoint.sh /opt/entrypoint.sh
RUN chmod +x /opt/entrypoint.sh

# The entrypoint runs as whatever user the instance is started as, the host user's own uid, so a
# file written to /out (bind-mounted from the host) is the host user's. /run is writable by any
# user: the driver's socket and the live-view token live there. The browser cache belongs to box
# and is only read.
RUN useradd --create-home --uid 1000 --shell /usr/sbin/nologin box \
 && mkdir /out && chown box:box /out && chmod 1777 /run
USER box

RUN camoufox fetch

ENTRYPOINT ["/usr/bin/tini", "--", "/opt/entrypoint.sh"]
