# qsm-web

Repeatable web research for the agent: one loop, one skill per tool, and the `qsm-web` CLI beneath
them.

## Why it exists

An agent that needs something from the internet guesses its keywords once, trusts the first page,
answers for the wrong version, and stops at the first wall or hands it to whoever is nearest. The
harness's own `WebSearch` and `WebFetch` are enough to look; qsm-web replaces that default with a
loop that walks the same steps for the same question, with sharper tools beside it and the person
reached directly when a wall needs a human. It takes the stance that the web is a source to be read
with its sources named, that every skipped or blocked step is said out loud, and that a tool
someone else wrote well is installed, not rewritten. It refuses to be a crawler, an account
automation tool, or a second copy of an upstream skill. When the harness's own search walks this
loop and clears its own walls, it has no reason to exist.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `web-ladder` | Runs the loop: searxng search, up to three keyword rounds, Context7 for a library, Tavily when the keywords will not come, one page in a browser, the person on a wall. |
| Skill | `searxng` | Searches through your own SearXNG instance, named by a flag or the environment, and narrows by source profile, engine, time range or language. |
| Skill | `browserbox` | Opens one page in a real browser, scripts a sequence, and hands a captcha to the person. |
| Skill | `opensrc` | Puts a library's source on disk at the version the project pins, to read. |
| Agent | `web-research` | Runs the loop away from the main context, handles a wall itself, and returns an answer with sources. |
| CLI | `qsm-web` | `opensrc`, `searxng`, `browserbox`, `doctor`. See [USAGE.md](USAGE.md). |

Context7 and Tavily are upstream: install puts their skills in place as they are.

## Install

```bash
claude plugin install qsm-web@qsm-marketplace
bun plugins/qsm-web/scripts/install.ts
npx ctx7 setup --claude              # interactive: Context7 sign-in and skill
qsm-secrets set tavily-api-key       # the Tavily key, never in the conversation
qsm-web doctor
```

`install.ts` compiles `qsm-web` into `$QSM_BIN_DIR` (default `~/.local/bin`), installs `opensrc`,
`shot-scraper`, the Tavily CLI (`tvly`) and Tavily's skills when missing, and prints the two
interactive steps for you. It does not choose a search instance or build the browser image. See
[INSTALL.md](INSTALL.md).

## Use

Ask the agent: "look up how React hooks handle cleanup", or hand a question to `web-research`.

```bash
qsm-web searxng search "io uring vs epoll" --time-range year
qsm-web searxng search "personal Linux websites" --profile niche
qsm-web searxng search "graph neural networks" --profile academic
qsm-web searxng search "AbortController" --profile it
qsm-web searxng search "minimal mountain icon" --profile images
qsm-web searxng search "conference talks on Rust" --profile videos
qsm-web searxng search "Seoul transit policy" --profile news
qsm-web searxng search "ambient electronic albums" --profile music
qsm-web searxng search "Brandenburg Gate Berlin" --profile map
qsm-web searxng search "Sailfish OS apps" --profile files
qsm-web opensrc get react --project .
name=$(qsm-web browserbox start --json | jq -r .data.name)
qsm-web browserbox fetch https://example.test --in "$name" --html
qsm-web browserbox takeover "$name" 0 --open --reason "captcha"
qsm-web browserbox stop "$name"
```

`--json` prints one outcome envelope. Every verb and flag is in [USAGE.md](USAGE.md).

## Caveats

- Search needs an instance: `--instance <url>` or `QSM_SEARXNG_INSTANCE`. The instance owns the
  engine and policy defaults; only the flags you pass are sent.
- `--profile` selects a named set: `default` follows server defaults, `niche` searches personal
  sites and discussions, `academic` searches publications, `it` searches technical sources, `images`
  discovers images, icons, art and memes, `videos` finds video metadata links, `news` finds regional
  news links, including Korean Naver and Chinese WeChat sources, `music` finds catalog metadata and
  source links from Deezer, Mixcloud and SoundCloud, `map` finds place and geocoding result links,
  and `files` searches torrent metadata (`bt4g`) and Sailfish app listings (`openrepos`). Files
  search is not comprehensive and grants no reuse rights. Map is not routing and does not guarantee
  coordinates. News does not guarantee freshness, language or journalism-only results. Manual
  `--engines` is an alternative, not combinable with a profile. Targeted profiles require every
  engine in the instance's `/config` catalog. Image results may include media URLs, but this tool
  does not fetch media or grant reuse rights. Video results may include iframe/media metadata, but
  this tool does not play videos, fetch media or grant reuse rights. Music discovery does not play
  or download media or grant reuse rights. See [USAGE.md](USAGE.md) for the sets and failures.
- `opensrc get` of a package spec needs `opensrc` on `PATH`.
- Only the browser step needs docker or podman. The first `browserbox start` builds an image
  (minutes, about 1 GB), and a start after the plugin's `docker/` files changed builds it again.
- The live view has no password. Its port is loopback only: never publish it elsewhere.
- A login is filled only by the main agent with you present, from Bitwarden (`rbw` or `bw`) through
  `fill-secret`, never from the conversation. The `web-research` agent stops at a login.
- The captcha solve step (`mouse`) is not in the browser driver yet, so a captcha goes straight to
  the takeover until it lands.
- It reads pages. It is not a crawler or an account automation tool.
