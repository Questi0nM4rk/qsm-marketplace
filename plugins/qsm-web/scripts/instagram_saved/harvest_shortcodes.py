"""Harvest the shortcodes of an Instagram saved collection.

Opens the page in a Firefox Playwright context with pre-loaded cookies,
scrolls until the virtualized grid stops growing, and writes the deduped set
of post/reel shortcodes to JSON.
"""

import argparse
import json
from pathlib import Path

from _browser import add_playwright_args, open_ig_context
from playwright.sync_api import sync_playwright

GRID_SELECTOR = 'main a[href*="/p/"], main a[href*="/reel/"]'

HARVEST_JS = r"""
new Promise(async (done) => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const SCROLL_WAIT_MS = 2200;
  const HEIGHT_GROWTH_THRESHOLD = 50;
  const STABLE_STREAK_TARGET = 4;
  const MAX_ITERATIONS = 80;

  const acc = new Set();
  const harvest = () => {
    let added = 0;
    for (const a of document.querySelectorAll('main a[href*="/p/"], main a[href*="/reel/"]')) {
      const m = a.getAttribute("href").match(/\/(p|reel)\/([A-Za-z0-9_-]+)\//);
      if (m && !acc.has(m[2])) { acc.add(m[2]); added++; }
    }
    return added;
  };

  harvest();

  let stable = 0, iter = 0, lastH = 0;
  const log = [];
  while (stable < STABLE_STREAK_TARGET && iter < MAX_ITERATIONS) {
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(SCROLL_WAIT_MS);
    const added = harvest();
    const h = document.body.scrollHeight;
    const grew = h > lastH + HEIGHT_GROWTH_THRESHOLD;
    log.push({iter, total: acc.size, added, grew});
    stable = (added === 0 && !grew) ? stable + 1 : 0;
    lastH = h;
    iter++;
  }
  done({total: acc.size, iterations: iter, log: log.slice(-8), shortcodes: Array.from(acc)});
});
"""


def main() -> None:
    """Scroll the saved collection and write its shortcodes."""
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True, help="Saved-collection URL")
    ap.add_argument("--output", required=True, help="Output shortcodes JSON")
    add_playwright_args(ap)
    args = ap.parse_args()

    with sync_playwright() as pw:
        browser, ctx = open_ig_context(pw, args.state, args.user_agent)
        page = ctx.new_page()
        page.goto(args.url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_selector(GRID_SELECTOR, timeout=12000)
        result: dict[str, object] = page.evaluate(HARVEST_JS)
        browser.close()

    Path(args.output).write_text(json.dumps(result, indent=2))
    print(
        f"{result['total']} shortcodes after {result['iterations']} scroll iterations → {args.output}"
    )


if __name__ == "__main__":
    main()
