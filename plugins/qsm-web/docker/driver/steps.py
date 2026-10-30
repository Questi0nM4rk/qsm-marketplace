"""One ordered script of page actions, run against one tab.

A step that fails stops the script where it is: the page is in a state
nobody planned for, and the next step would act on it blindly. The result
names the step's index and the reason, and the steps after it do not run.

A fill carrying `redact` reports its value as redacted. That is how a
password reaches a page without reaching a transcript.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from playwright.sync_api import Page

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_MS = 30000
OUT_DIR = "/out"

Step = Mapping[str, object]
Outcome = dict[str, object]


def _timeout(step: Step) -> int:
    value = step.get("timeoutMs")
    return int(value) if isinstance(value, (int, float)) else DEFAULT_TIMEOUT_MS


def _text(step: Step, key: str) -> str:
    """Return a step's required text field; a missing or non-text one fails the step."""
    value = step[key]
    if not isinstance(value, str):
        message = f"{key} must be text"
        raise TypeError(message)
    return value


def _out_path(name: str) -> str:
    """Artifacts stay inside the mounted directory: only a basename is used."""
    return str(Path(OUT_DIR) / (name.rsplit("/", 1)[-1] or "shot.png"))


def _navigate(page: Page, step: Step) -> Outcome:
    resp = page.goto(
        _text(step, "url"), wait_until="domcontentloaded", timeout=_timeout(step)
    )
    return {"url": page.url, "status": resp.status if resp else None}


def _fill(page: Page, step: Step) -> Outcome:
    selector = _text(step, "selector")
    value = _text(step, "value")
    page.fill(selector, value, timeout=_timeout(step))
    shown = "[redacted]" if step.get("redact") else value
    return {"selector": selector, "value": shown}


def _click(page: Page, step: Step) -> Outcome:
    selector = _text(step, "selector")
    page.click(selector, timeout=_timeout(step))
    return {"selector": selector, "url": page.url}


def _wait(page: Page, step: Step) -> Outcome:
    selector = step.get("selector")
    if selector and isinstance(selector, str):
        page.wait_for_selector(selector, timeout=_timeout(step))
        return {"selector": selector}
    text = step.get("text")
    if text and isinstance(text, str):
        page.wait_for_selector(f"text={text}", timeout=_timeout(step))
        return {"text": text}
    page.wait_for_timeout(_timeout(step))
    return {"waitedMs": _timeout(step)}


def _extract(page: Page, step: Step) -> Outcome:
    raw = step.get("selector")
    selector = raw if isinstance(raw, str) and raw else "body"
    limit = step.get("limit")
    count = int(limit) if isinstance(limit, (int, float)) and limit else 20
    nodes = page.query_selector_all(selector)[:count]
    return {"selector": selector, "text": [n.inner_text() for n in nodes]}


def _screenshot(page: Page, step: Step) -> Outcome:
    raw = step.get("path")
    path = _out_path(raw if isinstance(raw, str) and raw else "shot.png")
    page.screenshot(path=path, full_page=True)
    return {"path": path}


_ACTIONS: dict[str, Callable[[Page, Step], Outcome]] = {
    "navigate": _navigate,
    "fill": _fill,
    "click": _click,
    "wait": _wait,
    "extract": _extract,
    "screenshot": _screenshot,
}


def run_step(page: Page, step: Step) -> Outcome:
    """Run one step and return its outcome; an unknown action raises."""
    action = step.get("action")
    if not isinstance(action, str) or action not in _ACTIONS:
        message = f"unknown action: {action}"
        raise ValueError(message)
    return _ACTIONS[action](page, step)


def run_script(page: Page, steps: Sequence[Step]) -> Outcome:
    """Run every step, then report the page's final state.

    A failure stops the run and is reported in place of the steps that never ran.
    """
    started = time.monotonic()
    outcomes: list[Outcome] = []
    for index, step in enumerate(steps):
        try:
            detail = run_step(page, step)
        except Exception as e:
            logger.debug("step %d failed", index, exc_info=True)
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
        outcomes.append(
            {"index": index, "action": step.get("action"), "ok": True, **detail}
        )
    return {
        "ok": True,
        "steps": outcomes,
        "url": page.url,
        "title": page.title(),
        "elapsedMs": int((time.monotonic() - started) * 1000),
    }
