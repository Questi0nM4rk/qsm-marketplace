"""Shared Playwright Firefox launch helper for the IG scraper scripts."""

import argparse

from playwright.sync_api import Browser, BrowserContext, Playwright, ViewportSize

UA_DEFAULT = "Mozilla/5.0 (X11; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0"
VIEWPORT: ViewportSize = {"width": 1280, "height": 1024}


def open_ig_context(
    pw: Playwright, state_path: str, user_agent: str
) -> tuple[Browser, BrowserContext]:
    browser = pw.firefox.launch(headless=True)
    ctx = browser.new_context(
        storage_state=state_path,
        user_agent=user_agent,
        viewport=VIEWPORT,
    )
    return browser, ctx


def add_playwright_args(ap: argparse.ArgumentParser) -> None:
    """Mount the --state / --user-agent flags any Playwright-driven script needs."""
    ap.add_argument("--state", required=True, help="Playwright storage_state JSON")
    ap.add_argument("--user-agent", default=UA_DEFAULT)
