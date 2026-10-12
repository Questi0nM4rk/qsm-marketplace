---
name: browserbox
description: "Use when one page needs a real browser through qsm-web browserbox: content built by script, a page that blocks plain fetching, a captcha to solve or hand to the person, a scripted sequence of clicks, a login the person is present for. Triggers: open it in a browser, the page is empty without JavaScript, captcha, take over the browser, run these steps on the page, log in to this site, browserbox. When to reach for a browser at all is the web-ladder skill."
---

# browserbox

`qsm-web browserbox` runs a real browser in a container with a live view the person can open. It is
the most expensive way to read a page, a container and a minute, so it is for the one page the
cheaper steps could not read, and it is never a session to act through.

## Instances

- `qsm-web browserbox start` prints a name and a live-view address. Reuse it with `--in <name>` and
  stop it when done (`qsm-web browserbox stop <name>`), because an instance nobody stops keeps a
  browser resident. `qsm-web browserbox ls` lists what is running.
- `qsm-web browserbox fetch <url> [--in <name>] [--html] [--screenshot] [--settle <ms>]` opens one
  address and reports the page.
- `qsm-web browserbox script <name> --file <steps.json>` runs steps in order and stops at the first
  failed one, naming its index, because carrying on against a page in an unknown state does harm.
  Steps: `navigate`, `click`, `fill`, `wait`, `extract`, `screenshot`, `mouse`, `fill-secret`.

## A captcha

1. Solve it once yourself: a `screenshot` step, read where the challenge is, then `mouse` steps that
   move and click there (`{"action": "mouse", "x": 412, "y": 288, "click": true}`), then a
   `screenshot` to check. One attempt, because a second against the same wall gets the address
   blocked.
2. When it is still there, hand it to the person: `qsm-web browserbox takeover <name> <tab> --open
   --reason "<what to clear>"` opens the live view on the desktop, and `notify-send "qsm-web" "<what
   to clear>"` tells the person, when `notify-send` is on PATH. The wait reports `resumed`; the tab
   and cookies are the ones you were using. The default wait is five minutes.
3. No `resumed`: the page is not read and is not opened again. Say the takeover timed out, name
   the page and what more it would have given; whether the research goes on is the web-ladder
   skill's call.

## A login

Only the main agent fills a login, and only with the person present: a `fill-secret` step names the
vault entry and, when it is not the password, the field. The value goes vault to page and never
enters the conversation, so never ask for a password, token or one-time code. The web-research agent
stops at a login and reports it.

## What it refuses

- No posting, buying or bulk action under someone's login. A takeover clears a wall; it does not
  hand you a session to act through.
- A scripted run over many pages sleeps 8 to 15 seconds between requests and stops on a 429,
  because a faster retry gets the account blocked.

## Red flags

- When a page is still blocked after the one solve attempt, take over, do not retry with other
  options, because the wall will not move.
- When you are done with the page, stop the instance, because it keeps a browser resident.

## Say it in the reply

The instance name and whether it is still running, the page read or the wall hit, whether the
captcha was solved by you, cleared by the person, or not cleared.
