"""One ordered script of page actions, run against one tab.

A step that fails stops the script where it is: the page is in a state
nobody planned for, and the next step would act on it blindly. The result
names the step's index and the reason, and the steps after it do not run.

A fill carrying `redact` reports its value as redacted. That is how a
password reaches a page without reaching a transcript.
"""

from __future__ import annotations

import os
import time
from typing import Any

DEFAULT_TIMEOUT_MS = 30000
OUT_DIR = "/out"


def _timeout(step: dict) -> int:
    value = step.get("timeoutMs")
    return int(value) if isinstance(value, (int, float)) else DEFAULT_TIMEOUT_MS


def _out_path(name: str) -> str:
    """Artifacts stay inside the mounted directory: only a basename is used."""
    return os.path.join(OUT_DIR, os.path.basename(name) or "shot.png")


def _navigate(page: Any, step: dict) -> dict:
    resp = page.goto(step["url"], wait_until="domcontentloaded", timeout=_timeout(step))
    return {"url": page.url, "status": resp.status if resp else None}


def _fill(page: Any, step: dict) -> dict:
    page.fill(step["selector"], step["value"], timeout=_timeout(step))
    shown = "[redacted]" if step.get("redact") else step["value"]
    return {"selector": step["selector"], "value": shown}


def _click(page: Any, step: dict) -> dict:
    page.click(step["selector"], timeout=_timeout(step))
    return {"selector": step["selector"], "url": page.url}


def _wait(page: Any, step: dict) -> dict:
    if step.get("selector"):
        page.wait_for_selector(step["selector"], timeout=_timeout(step))
        return {"selector": step["selector"]}
    if step.get("text"):
        page.wait_for_selector(f"text={step['text']}", timeout=_timeout(step))
        return {"text": step["text"]}
    page.wait_for_timeout(_timeout(step))
    return {"waitedMs": _timeout(step)}


def _extract(page: Any, step: dict) -> dict:
    selector = step.get("selector") or "body"
    limit = int(step.get("limit") or 20)
    nodes = page.query_selector_all(selector)[:limit]
    return {"selector": selector, "text": [n.inner_text() for n in nodes]}


def _screenshot(page: Any, step: dict) -> dict:
    path = _out_path(step.get("path") or "shot.png")
    page.screenshot(path=path, full_page=True)
    return {"path": path}


_ACTIONS = {
    "navigate": _navigate,
    "fill": _fill,
    "click": _click,
    "wait": _wait,
    "extract": _extract,
    "screenshot": _screenshot,
}


def run_step(page: Any, step: dict) -> dict:
    action = step.get("action")
    if action not in _ACTIONS:
        raise ValueError(f"unknown action: {action}")
    return _ACTIONS[action](page, step)


def run_script(page: Any, steps: list[dict]) -> dict:
    """Every step's outcome, then the page's final state. A failure stops
    the run and is reported in place of the steps that never ran."""
    started = time.monotonic()
    outcomes: list[dict] = []
    for index, step in enumerate(steps):
        try:
            detail = run_step(page, step)
        except Exception as e:  # noqa: BLE001 - a bad step is an answer, not a crash
            outcomes.append(
                {
                    "index": index,
                    "action": step.get("action"),
                    "ok": False,
                    "error": {"kind": type(e).__name__, "message": str(e)},
                }
            )
            return {
                "ok": False,
                "steps": outcomes,
                "failedStep": index,
                "url": page.url,
                "elapsedMs": int((time.monotonic() - started) * 1000),
            }
        outcomes.append({"index": index, "action": step.get("action"), "ok": True, **detail})
    return {
        "ok": True,
        "steps": outcomes,
        "url": page.url,
        "title": page.title(),
        "elapsedMs": int((time.monotonic() - started) * 1000),
    }
