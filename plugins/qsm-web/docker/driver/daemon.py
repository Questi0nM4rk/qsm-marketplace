"""The resident browser inside one instance.

It holds one browser and a tab registry, and serves one JSON job per
connection on a unix socket. Tabs survive between calls because this
process, and its browser, live as long as the container does.

Jobs:
  {"cmd":"ping"}                                  -> {"ok":true,"tabs":N}
  {"cmd":"tabs"}                                  -> every tab's id, url, title
  {"cmd":"open_tab","url"?}                       -> {"ok":true,"tab":id}
  {"cmd":"close_tab","tab":id}                    -> {"ok":true}
  {"cmd":"fetch","url",...}                       -> one fetch result
  {"cmd":"script","tab"?,"steps":[...]}           -> per-step outcomes
  {"cmd":"wait_for_human","tab":id,"timeout"?}    -> {"ok":true,"state":"waiting"}
  {"cmd":"wait_status","tab":id}                  -> waiting | cleared | timeout | none

wait_for_human arms a wait and returns at once; the accept loop re-reads
each waiting tab's page on a tick, so nothing else is held up while a human
works in the live view.
"""

from __future__ import annotations

import json
import os
import signal
import socket
import time
from pathlib import Path
from typing import Any

from blockdetect import detect_block
from camoufox.sync_api import Camoufox
from result import make_result
from steps import run_script
from waitstate import NO_WAIT_STATUS, WaitState, advance_waits

SOCK = "/run/bbox.sock"
ACCEPT_TICK_S = 1.0
OUT_DIR = "/out"


def _nav(page: Any, job: dict) -> Any:
    return page.goto(
        job["url"], wait_until="domcontentloaded", timeout=int(job.get("timeout", 30000))
    )


def _capture(page: Any, ctx: Any, job: dict, status: int, started: float) -> dict:
    html = page.content()
    title = page.title()
    detected = detect_block(html, title, status)
    out = Path(OUT_DIR)
    out.mkdir(parents=True, exist_ok=True)
    artifacts: dict[str, str] = {}
    if job.get("html"):
        path = out / "page.html"
        path.write_text(html)
        artifacts["html"] = str(path)
    if job.get("screenshot"):
        path = out / "shot.png"
        page.screenshot(path=str(path), full_page=True)
        artifacts["screenshot"] = str(path)
    if job.get("cookies"):
        path = out / "cookies.json"
        path.write_text(json.dumps(ctx.cookies()))
        artifacts["cookies"] = str(path)
    return make_result(
        ok=True,
        blocked=detected["blocked"],
        block_signal=detected["block_signal"],
        final_url=page.url,
        http_status=status,
        title=title,
        artifacts=artifacts,
        elapsedMs=int((time.monotonic() - started) * 1000),
    )


def _new_tab(browser: Any, tabs: dict, state: dict) -> dict:
    ctx = browser.new_context()
    tab = {"id": state["next"], "ctx": ctx, "page": ctx.new_page(), "wait": None}
    tabs[state["next"]] = tab
    state["next"] += 1
    return tab


def _fetch(job: dict, browser: Any, tabs: dict, state: dict) -> dict:
    started = time.monotonic()
    tab = _new_tab(browser, tabs, state)
    keep = bool(job.get("keep"))
    try:
        try:
            resp = _nav(tab["page"], job)
            status = resp.status if resp else 0
        except Exception as e:  # noqa: BLE001 - classify, never crash the daemon
            kind = "timeout" if "Timeout" in type(e).__name__ else "nav"
            return make_result(
                ok=False,
                error={"kind": kind, "message": str(e)},
                elapsedMs=int((time.monotonic() - started) * 1000),
            )
        if int(job.get("settle", 0)):
            tab["page"].wait_for_timeout(int(job["settle"]))
        result = _capture(tab["page"], tab["ctx"], job, status, started)
        result["tab"] = tab["id"]
        return result
    finally:
        if not keep:
            tabs.pop(tab["id"], None)
            tab["ctx"].close()


def _script(job: dict, browser: Any, tabs: dict, state: dict) -> dict:
    tab = tabs.get(job.get("tab")) if job.get("tab") is not None else _new_tab(browser, tabs, state)
    if tab is None:
        return {"ok": False, "error": {"kind": "tab", "message": f"no such tab: {job.get('tab')}"}}
    result = run_script(tab["page"], job.get("steps") or [])
    result["tab"] = tab["id"]
    return result


def _still_blocked(tab: dict) -> bool:
    page = tab["page"]
    return bool(detect_block(page.content(), page.title(), 200)["blocked"])


def _poll_waiting(tabs: dict) -> None:
    """Advance every armed wait by one classification. Runs on the loop's own
    thread, because the browser API is not thread safe."""
    advance_waits(tabs, time.monotonic(), _still_blocked)


def _cmd_ping(job: dict, browser: Any, tabs: dict, state: dict) -> dict:
    return {"ok": True, "tabs": len(tabs)}


def _cmd_tabs(job: dict, browser: Any, tabs: dict, state: dict) -> dict:
    items = []
    for tid, tab in tabs.items():
        try:
            items.append({"tab": tid, "url": tab["page"].url, "title": tab["page"].title()})
        except Exception as e:  # noqa: BLE001 - one dead tab must not hide the rest
            items.append({"tab": tid, "url": None, "title": None, "error": str(e)})
    return {"ok": True, "tabs": items}


def _cmd_open_tab(job: dict, browser: Any, tabs: dict, state: dict) -> dict:
    tab = _new_tab(browser, tabs, state)
    if job.get("url"):
        _nav(tab["page"], job)
    return {"ok": True, "tab": tab["id"], "url": tab["page"].url}


def _tab_close(job: dict, tab: dict, tabs: dict) -> dict:
    tabs.pop(tab["id"], None)
    tab["ctx"].close()
    return {"ok": True, "tab": tab["id"]}


def _tab_wait_for_human(job: dict, tab: dict, tabs: dict) -> dict:
    timeout_s = float(job.get("timeout", 300000)) / 1000.0
    tab["wait"] = WaitState.armed(time.monotonic(), timeout_s)
    return {
        "ok": True,
        "state": "waiting",
        "tab": tab["id"],
        "reason": job.get("reason"),
        "liveView": os.environ.get("QSM_BROWSERBOX_LIVE_VIEW", ""),
    }


def _tab_wait_status(job: dict, tab: dict, tabs: dict) -> dict:
    wait = tab.get("wait")
    return NO_WAIT_STATUS if wait is None else wait.as_status()


# Commands that need no tab, then commands that act on the tab the job names.
_GLOBAL_CMDS = {
    "ping": _cmd_ping,
    "tabs": _cmd_tabs,
    "open_tab": _cmd_open_tab,
    "fetch": _fetch,
    "script": _script,
}
_TAB_CMDS = {
    "close_tab": _tab_close,
    "wait_for_human": _tab_wait_for_human,
    "wait_status": _tab_wait_status,
}


def handle(job: dict, browser: Any, tabs: dict, state: dict) -> dict:
    cmd = job.get("cmd") or ""
    if cmd in _GLOBAL_CMDS:
        return _GLOBAL_CMDS[cmd](job, browser, tabs, state)
    if cmd not in _TAB_CMDS:
        return {"ok": False, "error": {"kind": "cmd", "message": f"unknown command: {cmd}"}}
    tab = tabs.get(job.get("tab"))
    if tab is None:
        return {"ok": False, "error": {"kind": "tab", "message": f"no such tab: {job.get('tab')}"}}
    return _TAB_CMDS[cmd](job, tab, tabs)


def _recv_line(conn: socket.socket) -> bytes:
    buf = b""
    while b"\n" not in buf:
        chunk = conn.recv(65536)
        if not chunk:
            break
        buf += chunk
    return buf


def main() -> None:
    if os.path.exists(SOCK):
        os.unlink(SOCK)
    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    srv.bind(SOCK)
    srv.listen(8)
    srv.settimeout(ACCEPT_TICK_S)
    tabs: dict = {}
    state = {"next": 1}
    stopped = {"v": False}

    def _stop(*_: Any) -> None:
        stopped["v"] = True
        srv.close()

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    # The browser keeps its own session history, which the stealth build
    # disables by default; without it nothing can go back. The value the
    # page can read is masked to the build's stock number, so re-enabling
    # it adds no surface a site can measure.
    with Camoufox(
        headless=False,
        geoip=True,
        firefox_user_prefs={"browser.sessionhistory.max_entries": 50},
        config={"window.history.length": 2},
        i_know_what_im_doing=True,
    ) as browser:
        print("browserbox: ready on", SOCK, flush=True)
        while not stopped["v"]:
            try:
                conn, _ = srv.accept()
            except socket.timeout:
                _poll_waiting(tabs)
                continue
            except OSError:
                break
            with conn:
                conn.settimeout(300)
                try:
                    job = json.loads(_recv_line(conn).decode().strip() or "{}")
                    answer = handle(job, browser, tabs, state)
                except Exception as e:  # noqa: BLE001 - one bad job must not end the daemon
                    answer = {"ok": False, "error": {"kind": type(e).__name__, "message": str(e)}}
                try:
                    conn.sendall((json.dumps(answer) + "\n").encode())
                except OSError:
                    pass
            _poll_waiting(tabs)


if __name__ == "__main__":
    main()
