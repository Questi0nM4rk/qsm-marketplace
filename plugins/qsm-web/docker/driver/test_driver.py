"""The driver's decisions, proven without a browser.

Every module under test here imports nothing but the standard library, so
this runs on the host with no image built and no camoufox installed. The
page is a stand-in that records what was asked of it and raises where a
real page would.

Run it with: python3 -m unittest discover -s docker/driver -t docker/driver
"""

from __future__ import annotations

import unittest
from typing import TYPE_CHECKING, cast

from blockdetect import detect_block
from steps import Outcome, run_script
from waitstate import DEFAULT_POLL_INTERVAL_S, WaitState, WaitTab, advance_waits

if TYPE_CHECKING:
    from playwright.sync_api import Page


class _FakeResponse:
    status = 200


class _FakeElement:
    def inner_text(self) -> str:
        return ""


class _FakePage:
    """A page that answers the few calls a step makes, and fails on demand."""

    def __init__(self, fail_on: str | None = None) -> None:
        super().__init__()
        self.url = "https://start.test"
        self.calls: list[str] = []
        self.fail_on = fail_on

    def _maybe_fail(self, what: str) -> None:
        self.calls.append(what)
        if self.fail_on == what:
            message = f"no element for {what}"
            raise TimeoutError(message)

    def goto(self, url: str, **_: object) -> _FakeResponse:
        self._maybe_fail("navigate")
        self.url = url
        return _FakeResponse()

    def fill(self, *_: object, **__: object) -> None:
        self._maybe_fail("fill")

    def click(self, *_: object, **__: object) -> None:
        self._maybe_fail("click")

    def wait_for_selector(self, *_: object, **__: object) -> None:
        self._maybe_fail("wait")

    def wait_for_timeout(self, *_: object) -> None:
        self._maybe_fail("wait")

    def query_selector_all(self, *_: object) -> list[_FakeElement]:
        self._maybe_fail("extract")
        return []

    def screenshot(self, **_: object) -> None:
        self._maybe_fail("screenshot")

    def title(self) -> str:
        return "a title"


def _step(result: Outcome, index: int) -> Outcome:
    return cast("list[Outcome]", result["steps"])[index]


def _error_kind(step: Outcome) -> object:
    return cast("dict[str, object]", step["error"])["kind"]


def _armed() -> WaitTab:
    return {"wait": WaitState.armed(now=0.0, timeout_s=60.0)}


def _status_of(tab: WaitTab) -> str | None:
    wait = tab["wait"]
    return wait.status if wait else None


class WaitStateTest(unittest.TestCase):
    """How one tab's wait moves from waiting to cleared or timed out."""

    def test_armed_then_blocked_keeps_waiting(self) -> None:
        state = WaitState.armed(now=0.0, timeout_s=60.0)
        self.assertEqual(state.status, "waiting")
        self.assertEqual(state.polled(now=10.0, blocked=True).status, "waiting")

    def test_polled_unblocked_is_cleared(self) -> None:
        state = WaitState.armed(now=0.0, timeout_s=60.0)
        self.assertEqual(state.polled(now=10.0, blocked=False).status, "cleared")

    def test_polled_past_the_deadline_is_a_timeout_even_while_blocked(self) -> None:
        state = WaitState.armed(now=0.0, timeout_s=60.0)
        self.assertEqual(state.polled(now=61.0, blocked=True).status, "timeout")

    def test_a_settled_wait_never_moves_again(self) -> None:
        cleared = WaitState.armed(now=0.0, timeout_s=60.0).polled(
            now=1.0, blocked=False
        )
        self.assertIs(cleared.polled(now=999.0, blocked=True), cleared)

    def test_a_poll_is_due_only_after_the_interval(self) -> None:
        state = WaitState.armed(now=0.0, timeout_s=60.0)
        self.assertFalse(state.due_for_poll(now=DEFAULT_POLL_INTERVAL_S - 0.1))
        self.assertTrue(state.due_for_poll(now=DEFAULT_POLL_INTERVAL_S))


class AdvanceWaitsTest(unittest.TestCase):
    """How the serve loop advances every armed wait."""

    def test_only_the_waiting_tab_is_classified(self) -> None:
        tabs: dict[int, WaitTab] = {1: _armed(), 2: {"wait": None}}
        seen: list[int] = []

        def classify(tab: WaitTab) -> bool:
            seen.append(id(tab))
            return False

        advance_waits(tabs, now=10.0, classify=classify)
        self.assertEqual(len(seen), 1)
        self.assertEqual(_status_of(tabs[1]), "cleared")
        self.assertIsNone(tabs[2]["wait"])

    def test_a_classifier_that_raises_ends_the_wait_instead_of_the_loop(self) -> None:
        tabs = {1: _armed()}

        def classify(_: WaitTab) -> bool:
            message = "the page is gone"
            raise RuntimeError(message)

        advance_waits(tabs, now=10.0, classify=classify)
        self.assertEqual(_status_of(tabs[1]), "cleared")

    def test_a_tab_not_yet_due_is_left_alone(self) -> None:
        tab = _armed()
        armed = tab["wait"]
        tabs = {1: tab}
        advance_waits(tabs, now=0.5, classify=lambda _: False)
        self.assertIs(tabs[1]["wait"], armed)


class RunScriptTest(unittest.TestCase):
    """How a script of steps runs, stops and reports."""

    def test_a_failed_step_stops_the_run_and_the_later_steps_do_not_run(self) -> None:
        page = _FakePage(fail_on="click")
        result = run_script(
            cast("Page", page),
            [
                {"action": "navigate", "url": "https://a.test"},
                {"action": "click", "selector": "#go"},
                {"action": "fill", "selector": "#late", "value": "never"},
            ],
        )
        self.assertFalse(result["ok"])
        self.assertEqual(result["failedStep"], 1)
        self.assertEqual(
            [s["index"] for s in cast("list[Outcome]", result["steps"])], [0, 1]
        )
        self.assertEqual(_error_kind(_step(result, 1)), "TimeoutError")
        self.assertNotIn("fill", page.calls)

    def test_every_step_succeeding_reports_each_outcome_and_the_final_state(
        self,
    ) -> None:
        page = _FakePage()
        result = run_script(
            cast("Page", page),
            [
                {"action": "navigate", "url": "https://a.test"},
                {"action": "fill", "selector": "#user", "value": "someone"},
            ],
        )
        self.assertTrue(result["ok"])
        self.assertEqual([_step(result, i)["ok"] for i in range(2)], [True, True])
        self.assertEqual(result["url"], "https://a.test")
        self.assertEqual(result["title"], "a title")

    def test_a_redacted_fill_reports_no_value(self) -> None:
        result = run_script(
            cast("Page", _FakePage()),
            [
                {
                    "action": "fill",
                    "selector": "#pass",
                    "value": "a-secret",
                    "redact": True,
                }
            ],
        )
        self.assertEqual(_step(result, 0)["value"], "[redacted]")

    def test_an_unknown_action_is_a_failed_step_not_a_crash(self) -> None:
        result = run_script(cast("Page", _FakePage()), [{"action": "teleport"}])
        self.assertFalse(result["ok"])
        self.assertEqual(result["failedStep"], 0)
        self.assertEqual(_error_kind(_step(result, 0)), "ValueError")


class DetectBlockTest(unittest.TestCase):
    """When a response counts as a wall."""

    def test_a_strong_marker_blocks_whatever_the_status(self) -> None:
        got = detect_block("<html>/cdn-cgi/challenge-platform/x.js</html>", "", 200)
        self.assertTrue(got["blocked"])
        self.assertEqual(got["block_signal"], "challenge_platform")

    def test_a_challenge_title_blocks_on_an_ordinary_status(self) -> None:
        self.assertTrue(
            detect_block("<html></html>", "Just a moment...", 200)["blocked"]
        )

    def test_a_widget_on_a_page_full_of_content_is_not_a_block(self) -> None:
        html = f"<html><body><div class='g-recaptcha'></div><p>{'word ' * 200}</p></body></html>"
        got = detect_block(html, "An article", 200)
        self.assertFalse(got["blocked"])
        self.assertIsNone(got["block_signal"])

    def test_a_widget_on_a_sparse_page_is_a_block(self) -> None:
        got = detect_block(
            "<html><body><div class='g-recaptcha'></div></body></html>", "", 403
        )
        self.assertTrue(got["blocked"])
        self.assertEqual(got["block_signal"], "recaptcha")

    def test_an_ordinary_page_is_not_blocked(self) -> None:
        got = detect_block("<html><body><h1>Hello</h1></body></html>", "Hello", 200)
        self.assertFalse(got["blocked"])


if __name__ == "__main__":
    unittest.main()
