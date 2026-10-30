"""Hand one job to the resident browser and print its answer.

The job arrives on standard input, as one JSON object, and nothing is ever
read from the argument vector: a password in a fill step would otherwise be
visible to anything that can list processes.
"""

from __future__ import annotations

import json
import socket
import sys
from typing import cast

SOCK = "/run/bbox.sock"


def main() -> int:
    """Send the job on stdin to the daemon and print its answer.

    The exit code is 0 only for an ok answer.
    """
    raw = sys.stdin.read().strip()
    if not raw:
        print(
            json.dumps(
                {"ok": False, "error": {"kind": "job", "message": "no job on stdin"}}
            )
        )
        return 2
    try:
        conn = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        conn.settimeout(600)
        conn.connect(SOCK)
    except OSError as e:
        print(
            json.dumps({"ok": False, "error": {"kind": "connect", "message": str(e)}})
        )
        return 1
    with conn:
        conn.sendall(raw.encode() + b"\n")
        buf = b""
        while b"\n" not in buf:
            chunk = conn.recv(65536)
            if not chunk:
                break
            buf += chunk
    answer = buf.decode().strip() or json.dumps(
        {"ok": False, "error": {"kind": "driver", "message": "no answer"}}
    )
    print(answer)
    reply: object = json.loads(answer)
    return (
        0
        if isinstance(reply, dict) and cast("dict[str, object]", reply).get("ok")
        else 1
    )


if __name__ == "__main__":
    sys.exit(main())
