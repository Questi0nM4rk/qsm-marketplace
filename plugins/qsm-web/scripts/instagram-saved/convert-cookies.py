"""
Convert a Firefox-format cookies.sqlite (Firefox, Zen, LibreWolf, Floorp, etc.)
into a Playwright storage_state.json. Filters to a single host substring.
"""
import argparse
import json
import sqlite3
import shutil
import tempfile
from pathlib import Path

SAME_SITE = {0: "None", 1: "Lax", 2: "Strict"}

# Zen stores cookie `expiry` in milliseconds; Playwright wants seconds.
# 1e11 seconds is year 5138, while 1e11 ms is year 5141 — anything above this
# threshold has to be milliseconds and must be divided.
EXPIRY_MS_THRESHOLD = 10**11


def normalize_expiry(raw: int | None) -> float:
    if not raw:
        return -1.0
    if raw > EXPIRY_MS_THRESHOLD:
        return raw / 1000.0
    return float(raw)


def snapshot(src: Path) -> Path:
    """Copy cookies.sqlite (+ -wal/-shm) to /tmp so we can read while the browser holds the write lock."""
    tmp = Path(tempfile.mkdtemp(prefix="cookies-snap-"))
    dst = tmp / "cookies.sqlite"
    shutil.copyfile(src, dst)
    for suffix in ("-wal", "-shm"):
        side = src.with_name(src.name + suffix)
        if side.exists():
            shutil.copyfile(side, dst.with_name(dst.name + suffix))
    return dst


def fetch(db: Path, host_like: str) -> list[dict]:
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT host, name, value, path, expiry, isSecure, isHttpOnly, sameSite "
        "FROM moz_cookies WHERE host LIKE ?",
        (f"%{host_like}%",),
    ).fetchall()
    return [
        {
            "name": r["name"],
            "value": r["value"],
            "domain": r["host"],
            "path": r["path"] or "/",
            "expires": normalize_expiry(r["expiry"]),
            "httpOnly": bool(r["isHttpOnly"]),
            "secure": bool(r["isSecure"]),
            "sameSite": SAME_SITE.get(r["sameSite"], "Lax"),
        }
        for r in rows
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, help="Path to cookies.sqlite")
    ap.add_argument("--host", required=True, help="Host substring filter (e.g. 'instagram')")
    ap.add_argument("--output", required=True, help="Output storage_state JSON")
    args = ap.parse_args()

    snap = snapshot(Path(args.source).expanduser())
    cookies = fetch(snap, args.host)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"cookies": cookies, "origins": []}, indent=2))
    out.chmod(0o600)
    print(f"{len(cookies)} cookies → {out}")


if __name__ == "__main__":
    main()
