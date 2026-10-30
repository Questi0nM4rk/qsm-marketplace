"""Wall and captcha detection: a pure function over (html, title, status).

It separates "a wall was served to us" from "this page merely embeds a
captcha widget":

- STRONG markers (challenge platform, DataDome, PerimeterX) mean blocked,
  whatever the status or the content.
- A challenge TITLE means blocked; those walls often arrive as HTTP 200.
- WEAK markers (a turnstile, recaptcha or hcaptcha widget) mean blocked
  only when the response looks like a wall: a blocking status, or a page so
  sparse that the widget is essentially the whole of it. A widget among
  real content on an ordinary page is not a block.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, TypedDict

if TYPE_CHECKING:
    from collections.abc import Callable


class BlockVerdict(TypedDict):
    """Whether the page is a wall, and which marker said so."""

    blocked: bool
    block_signal: str | None


_SPARSE_VISIBLE_TEXT = 300
_BLOCK_STATUS = {401, 403, 429, 503}
_CHALLENGE_TITLES = (
    "just a moment",
    "attention required",
    "access denied",
    "checking your browser",
    "verify you are human",
    "verifying you are human",
)

_STRONG: list[tuple[str, Callable[[str], bool]]] = [
    (
        "challenge_platform",
        lambda h: (
            "/cdn-cgi/challenge-platform" in h
            or "cf-browser-verification" in h
            or "cf_chl_" in h
        ),
    ),
    ("datadome", lambda h: "captcha-delivery.com" in h),
    ("perimeterx", lambda h: "px-captcha" in h or "/_px/" in h),
]

_WEAK: list[tuple[str, Callable[[str], bool]]] = [
    (
        "turnstile",
        lambda h: "cf-turnstile" in h or "challenges.cloudflare.com/turnstile" in h,
    ),
    ("hcaptcha", lambda h: "hcaptcha.com" in h or "h-captcha" in h),
    ("recaptcha", lambda h: "g-recaptcha" in h or "recaptcha" in h),
]


def _visible_text_len(html: str) -> int:
    h = re.sub(
        r"<(script|style)\b[^>]*>.*?</\1>", " ", html, flags=re.DOTALL | re.IGNORECASE
    )
    t = re.sub(r"<[^>]+>", " ", h)
    return len(re.sub(r"\s+", " ", t).strip())


def detect_block(html: str, title: str, status: int) -> BlockVerdict:
    """Classify one response as a wall or an ordinary page."""
    h = html.lower()
    t = title.lower()
    for sig, pred in _STRONG:
        if pred(h):
            return {"blocked": True, "block_signal": sig}
    if any(p in t for p in _CHALLENGE_TITLES):
        return {"blocked": True, "block_signal": "challenge_platform"}
    looks_like_wall = (
        status in _BLOCK_STATUS or _visible_text_len(html) < _SPARSE_VISIBLE_TEXT
    )
    for sig, pred in _WEAK:
        if pred(h):
            return {
                "blocked": looks_like_wall,
                "block_signal": sig if looks_like_wall else None,
            }
    return {"blocked": False, "block_signal": None}
