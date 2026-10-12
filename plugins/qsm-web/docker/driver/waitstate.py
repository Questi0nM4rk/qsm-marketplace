"""One tab's wait-for-human lifecycle: pure, no browser objects, no clock.

Arming a wait never blocks the daemon. The serve loop advances each armed
tab by classifying its page on a tick and calling `polled`, so while one tab
waits on a human every other tab and instance keeps answering. Time comes in
as a parameter, so the transitions are testable without sleeping.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Literal

WaitStatus = Literal["waiting", "cleared", "timeout"]

DEFAULT_TIMEOUT_S = 300.0
DEFAULT_POLL_INTERVAL_S = 3.0

NO_WAIT_STATUS: dict = {"ok": True, "state": "none"}


@dataclass(frozen=True)
class WaitState:
    status: WaitStatus
    deadline: float
    last_poll: float

    @staticmethod
    def armed(now: float, timeout_s: float = DEFAULT_TIMEOUT_S) -> "WaitState":
        return WaitState(status="waiting", deadline=now + timeout_s, last_poll=now)

    def due_for_poll(self, now: float, interval_s: float = DEFAULT_POLL_INTERVAL_S) -> bool:
        return self.status == "waiting" and (now - self.last_poll) >= interval_s

    def polled(self, now: float, blocked: bool) -> "WaitState":
        if self.status != "waiting":
            return self
        if now >= self.deadline:
            return WaitState(status="timeout", deadline=self.deadline, last_poll=now)
        if not blocked:
            return WaitState(status="cleared", deadline=self.deadline, last_poll=now)
        return WaitState(status="waiting", deadline=self.deadline, last_poll=now)

    def as_status(self) -> dict:
        return {"ok": True, "state": self.status, "deadline_s": self.deadline}


def advance_waits(tabs: dict, now: float, classify: Callable[[Any], bool]) -> None:
    """Advance every armed wait by one classification.

    A tab that is not waiting, or not yet due, is left exactly as it was:
    that is what keeps every other tab and instance answering while one tab
    waits on a human. A classifier that raises counts as not blocked, so a
    closed page ends its wait instead of holding the loop.
    """
    for tab in tabs.values():
        wait = tab.get("wait")
        if wait is None or not wait.due_for_poll(now):
            continue
        try:
            blocked = bool(classify(tab))
        except Exception:  # noqa: BLE001 - a dead page must not stop the tick
            blocked = False
        tab["wait"] = wait.polled(now, blocked)
