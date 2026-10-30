"""Scrape the caption and comments of every shortcode in a JSON file.

Opens each Instagram post page in a Playwright Firefox context with
pre-loaded cookies, extracts the caption and rendered top-level comments, and
appends one JSON record per reel to corpus.jsonl.

Resume support: shortcodes already in corpus.jsonl are skipped on re-run.
"""

import argparse
import json
import random
import sys
import time
import traceback
from pathlib import Path
from typing import TextIO, cast

from _browser import add_playwright_args, open_ig_context
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import Page, sync_playwright
from playwright.sync_api import TimeoutError as PWTimeout

TIME_SELECTOR = "time"
HYDRATION_TIMEOUT_MS = 10000

EXTRACT_JS = r"""
() => {
  const MIN_LEN = 20;
  const MAX_COMMENT_LEN = 600;
  const MAX_CAPTION_LEN = 3000;  // captions are intentionally longer than comments
  const MAX_ANCESTOR_WALK = 5;
  const TOP_FOR_PINNED = 2;  // a creator-authored top-N comment is treated as pinned

  // IG's rendered comment structure as innerText:
  //   line 0: username
  //   line 1: separator (non-breaking space)
  //   line 2: relative age ("6w")
  //   lines 3+: comment body
  // For empty-caption reels IG renders just "username   age" (no body) — match the stub.
  const STUB_RE = /^\s*([a-zA-Z0-9_.]+)\s+(\d+\s*[smhdwy])\s*$/;
  const parseBlock = (text) => {
    const lines = text.split("\n");
    if (lines.length < 4) {
      const m = text.match(STUB_RE);
      if (m) return {user: m[1], age: m[2], body: ""};
      return {user: null, age: null, body: text.trim()};
    }
    return {user: lines[0].trim(), age: lines[2].trim(), body: lines.slice(3).join("\n").trim()};
  };

  // For captions: walk all ancestors, prefer the largest valid container (caption text
  // sits in a parent wrapping the user-age stub). For comments: first valid wins (tight box).
  const containerFromTime = (t, maxLen, preferLargest) => {
    let n = t;
    let best = null;
    for (let i = 0; i < MAX_ANCESTOR_WALK; i++) {
      if (!n.parentElement) break;
      n = n.parentElement;
      const a = n.querySelector('a[href^="/"]');
      const len = (n.innerText || "").length;
      if (a && len > MIN_LEN && len < maxLen) {
        best = n;
        if (!preferLargest) return n;
      }
    }
    return best;
  };

  const itemFor = (t, maxLen, preferLargest) => {
    const node = containerFromTime(t, maxLen, preferLargest);
    if (!node) return null;
    const link = node.querySelector('a[href^="/"]');
    const block = parseBlock(node.innerText);
    if (block.body.length > maxLen) return null;
    return {...block, username_href: link && link.getAttribute("href"), datetime: t.getAttribute("datetime")};
  };

  const times = Array.from(document.querySelectorAll("time"));
  if (!times.length) return {error: "no time elements rendered"};

  const caption = itemFor(times[0], MAX_CAPTION_LEN, true);
  const ownerUser = caption && caption.user;
  const comments = times.slice(1)
    .map(t => itemFor(t, MAX_COMMENT_LEN, false))
    .filter(Boolean)
    .map((c, i) => ({...c, is_likely_pinned: !!(ownerUser && c.user === ownerUser && i < TOP_FOR_PINNED)}));

  return {
    shortcode: location.pathname.match(/\/(p|reel)\/([^\/]+)/)[2],
    url: location.href,
    caption,
    comment_count_visible: comments.length,
    comments,
  };
}
"""


def already_done(corpus: Path) -> set[str]:
    """Return the shortcodes the corpus already holds."""
    if not corpus.exists():
        return set()
    seen: set[str] = set()
    for n, line in enumerate(corpus.read_text().splitlines(), 1):
        try:
            sc = json.loads(line).get("shortcode")
            if sc:
                seen.add(sc)
        except json.JSONDecodeError:
            print(f"warn: skipped malformed line {n} in {corpus}", file=sys.stderr)
    return seen


def scrape_one(page: Page, sc: str) -> dict[str, object]:
    """Return the record of one post, or a record that names why it failed."""
    url = f"https://www.instagram.com/p/{sc}/"
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    try:
        page.wait_for_selector(TIME_SELECTOR, timeout=HYDRATION_TIMEOUT_MS)
    except PWTimeout:
        return {
            "shortcode": sc,
            "url": url,
            "error": "hydration timeout: no <time> appeared",
        }
    rec: dict[str, object] = page.evaluate(EXTRACT_JS)
    if rec.get("error"):
        return {"shortcode": sc, "url": url, "error": rec["error"]}
    return rec


def _object(value: object) -> dict[str, object]:
    return cast("dict[str, object]", value) if isinstance(value, dict) else {}


def _scrape_and_record(page: Page, sc: str, i: int, total: int, out: TextIO) -> None:
    """One pending shortcode: scrape, append its record, print progress."""
    t0 = time.time()
    try:
        rec: dict[str, object] = scrape_one(page, sc)
    except (PlaywrightError, PWTimeout) as e:
        rec = {
            "shortcode": sc,
            "url": f"https://www.instagram.com/p/{sc}/",
            "error": f"{type(e).__name__}: {e}",
        }
    except Exception:
        rec = {
            "shortcode": sc,
            "url": f"https://www.instagram.com/p/{sc}/",
            "error": "unexpected: see traceback",
            "traceback": traceback.format_exc(),
        }
    rec["scraped_at"] = int(time.time())
    out.write(json.dumps(rec, ensure_ascii=False) + "\n")
    out.flush()

    cap = _object(rec.get("caption"))
    preview = str(cap.get("body") or rec.get("error") or "")[:60].replace("\n", " ")
    print(
        f"  [{i}/{total}] {sc} | {time.time() - t0:.1f}s | @{cap.get('user', '?')}"
        f" | {rec.get('comment_count_visible', 0)}c | {preview}",
        flush=True,
    )


def main() -> None:
    """Scrape every pending shortcode into the corpus, resuming where a run stopped."""
    ap = argparse.ArgumentParser()
    ap.add_argument("--shortcodes", required=True, help="JSON file with .shortcodes[]")
    ap.add_argument("--corpus", required=True, help="Output JSONL (append + resume)")
    ap.add_argument(
        "--sleep", default="8,15", help="Min,max seconds to sleep between reels"
    )
    add_playwright_args(ap)
    args = ap.parse_args()

    sleep_min, sleep_max = (float(x) for x in args.sleep.split(","))
    shortcodes = list(
        dict.fromkeys(json.loads(Path(args.shortcodes).read_text())["shortcodes"])
    )
    corpus = Path(args.corpus)
    corpus.parent.mkdir(parents=True, exist_ok=True)
    done = already_done(corpus)
    pending = [s for s in shortcodes if s not in done]
    print(
        f"[{len(done)}/{len(shortcodes)}] already done, {len(pending)} remaining",
        flush=True,
    )
    if not pending:
        return

    with sync_playwright() as pw, corpus.open("a") as out:
        browser, ctx = open_ig_context(pw, args.state, args.user_agent)
        page = ctx.new_page()
        for i, sc in enumerate(pending, 1):
            _scrape_and_record(page, sc, i, len(pending), out)
            if i < len(pending):
                time.sleep(random.SystemRandom().uniform(sleep_min, sleep_max))
        browser.close()
    print(f"Done. Output: {corpus}", flush=True)


if __name__ == "__main__":
    main()
