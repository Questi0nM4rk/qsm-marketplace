"""The shape of a fetch result, in one place.

block_signal is one of: challenge_platform, turnstile, datadome, perimeterx,
hcaptcha, recaptcha, or null. error is null, or an object with a kind
(timeout, connect, nav, crash) and a message.
"""

from __future__ import annotations

from typing import Any


def make_result(**p: Any) -> dict[str, Any]:
    artifacts = {"html": None, "screenshot": None, "cookies": None}
    artifacts.update(p.get("artifacts") or {})
    return {
        "ok": p.get("ok", True),
        "blocked": p.get("blocked", False),
        "block_signal": p.get("block_signal"),
        "final_url": p.get("final_url"),
        "http_status": p.get("http_status"),
        "title": p.get("title"),
        "artifacts": artifacts,
        "elapsedMs": p.get("elapsedMs", 0),
        "error": p.get("error"),
    }
