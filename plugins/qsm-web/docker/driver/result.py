"""The shape of a fetch result, in one place.

block_signal is one of: challenge_platform, turnstile, datadome, perimeterx,
hcaptcha, recaptcha, or null. error is null, or an object with a kind
(timeout, connect, nav, crash) and a message.
"""

from __future__ import annotations

from typing import NotRequired, TypedDict, Unpack


class ResultFields(TypedDict, total=False):
    """The fields a caller may set; the rest take their defaults."""

    ok: bool
    blocked: bool
    block_signal: str | None
    final_url: str | None
    http_status: int | None
    title: str | None
    artifacts: dict[str, str]
    elapsed_ms: int
    error: dict[str, str] | None


class FetchResult(TypedDict):
    """One fetch answer, every field present."""

    ok: bool
    blocked: bool
    block_signal: str | None
    final_url: str | None
    http_status: int | None
    title: str | None
    artifacts: dict[str, str | None]
    elapsedMs: int
    error: dict[str, str] | None
    tab: NotRequired[int]


def make_result(**p: Unpack[ResultFields]) -> FetchResult:
    """Return a fetch answer with every field present and the defaults filled in."""
    artifacts: dict[str, str | None] = {
        "html": None,
        "screenshot": None,
        "cookies": None,
    }
    artifacts.update(p.get("artifacts") or {})
    return {
        "ok": p.get("ok", True),
        "blocked": p.get("blocked", False),
        "block_signal": p.get("block_signal"),
        "final_url": p.get("final_url"),
        "http_status": p.get("http_status"),
        "title": p.get("title"),
        "artifacts": artifacts,
        "elapsedMs": p.get("elapsed_ms", 0),
        "error": p.get("error"),
    }
