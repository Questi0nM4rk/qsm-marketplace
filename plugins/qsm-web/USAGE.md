# Usage

Every verb ends in one outcome; with `--json`, one envelope `{ code, exit, reason, message,
warnings, data }` on stdout. Codes: `ok` 0, `failed` 1, `usage` 2, `missing` 4.

```bash
qsm-web searxng search <query...> [--instance url] [--num-results n] [--timeout ms]
                        [--engines a,b] [--language en] [--safesearch 0|1|2]
                        [--time-range day|week|month|year] [--profile default|niche|academic|it|images|videos|news]
qsm-web opensrc get <spec|address> [--project <dir>]
qsm-web doctor        # bins, tvly, the Tavily skills, the Context7 skill
qsm-web browserbox start | ls | stop <name> | stop --all
qsm-web browserbox fetch <url> [--in <name>] [--html] [--screenshot] [--cookies] [--keep]
qsm-web browserbox script <name> (--file <path> | --steps <json>)
qsm-web browserbox takeover <name> <tab> [--open]
```

`qsm-web <verb> --help` lists the rest; `--dry-run` shows the commands without running them.

- Search instance: `--instance`, then `QSM_SEARXNG_INSTANCE`. The instance owns the engine and
  policy defaults: only the flags you pass are sent. `--num-results` keeps 10 results by default
  and `--timeout` gives the entire exchange 10000 ms, including a profile's catalog lookup.
- Sources from `opensrc get` land in `QSM_OPENSRC_DIR` (default `~/Clonned`). `versionMatched` is
  true only for a pinned spec or a version the `--project` declares.
- `browserbox fetch` without `--in` starts and stops its own instance; `--keep` leaves it running,
  stop it by name.
- `script` steps: `navigate`, `fill`, `fill-secret` (Bitwarden item, shown as `[redacted]`),
  `click`, `wait`, `extract`, `screenshot`. A failed step ends the run.
- `takeover` waits for a person to clear a challenge in the live view; default timeout five minutes.
- Env: `QSM_CONTAINER_RUNTIME`, `QSM_BROWSERBOX_OUT` (default `~/.cache/qsm-browserbox`),
  `QSM_BITWARDEN_CLI`, `QSM_MARKETPLACE` (the checkout, for the image build).

## Search profiles

Profiles select sources for one query without changing the instance's defaults:

| Profile | Sources |
| --- | --- |
| `default` | Current server defaults, identical to omitting the profile |
| `niche` | `searchmysite`, `wiby`, `mwmbl`, `boardreader` |
| `academic` | `arxiv`, `crossref`, `openalex`, `semantic scholar`, `pubmed`, `europepmc` |
| `it` | Technical documentation, repositories, packages, apps, questions, discussions, model catalogs and vulnerability records. Exact set below. |
| `images` | Mixed image, icon, art and meme discovery. Exact set below. Results may include image and thumbnail URLs. |
| `videos` | Video discovery metadata and source links across video platforms and indexes. Exact set below. Results may include iframe or media metadata. |
| `news` | Regional news discovery, including Korean Naver and Chinese WeChat sources. Exact set below. It does not guarantee freshness, language, or journalism-only results. |

The IT set contains these 36 engines:

| Purpose | Engines |
| --- | --- |
| Packages | `alpine linux packages`, `cachy os packages`, `crates.io`, `hex`, `lib.rs`, `packagist`, `pkg.go.dev`, `pub.dev`, `voidlinux` |
| Apps | `apple app store`, `fdroid`, `google play apps` |
| Questions | `askubuntu`, `stackoverflow`, `superuser` |
| Discussions | `caddy.community`, `discuss.python`, `hackernews`, `pi-hole.community` |
| Repositories | `codeberg`, `gitea.com`, `github`, `gitlab`, `sourcehut` |
| Software catalogs | `docker hub`, `free software directory` |
| Documentation | `gentoo`, `mankier`, `mdn`, `microsoft learn`, `nixos wiki` |
| Code reference | `hoogle` |
| AI catalogs | `huggingface`, `huggingface datasets`, `huggingface spaces` |
| Security | `national vulnerability database` |

The Images profile selects these 16 sources:

`artic`, `artstation`, `brave.images`, `devicons`, `duckduckgo images`, `findthatmeme`, `flaticon`,
`frinkiac`, `giphy`, `iconify`, `lucide`, `material icons`, `pinterest`,
`public domain image archive`, `selfhst icons`, `uxwing`.

The Videos profile selects these 12 sources, in metadata/source-link discovery only:

`360search videos`, `bilibili`, `brave.videos`, `dailymotion`, `duckduckgo videos`, `ina`,
`media.ccc.de`, `mediathekviewweb`, `odysee`, `pixabay videos`, `sepiasearch`, `sogou videos`.

The News profile selects these five sources:

`brave.news`, `duckduckgo news`, `il post`, `naver news`, `sogou wechat`.

```bash
qsm-web searxng search "personal Linux websites" --profile niche
qsm-web searxng search "graph neural networks" --profile academic --language en
qsm-web searxng search "AbortController" --profile it
qsm-web searxng search "minimal mountain icon" --profile images
qsm-web searxng search "conference talks on Rust" --profile videos
qsm-web searxng search "Seoul transit policy" --profile news
```

`--profile` is the only named source-selection flag. It is exclusive with `--engines`, including
empty values. Conflicts and unknown profiles return `usage` before a request. Other filters work
with profiles. The result's `category` field is metadata, not an input selector.

Targeted profiles first read `/config` and require every listed engine to be
registered. An engine may be disabled by default and still be used. Missing engines return `missing`
with their names and no search request. A failed or unreadable catalog returns `failed`. There is no
retry, silent removal of engines, or substitution of server defaults. Availability is not a
guarantee that a provider will answer; search warnings retain their normal behavior. The default
profile does not request the catalog.

IT is a broad discovery set, not a guarantee of relevance or freshness. Package and model catalogs
can add noise to a documentation query. Use manual `--engines` when a narrower selection is needed.
Images combines image, icon, art and meme sources. It does not fetch media or grant rights to reuse
content.
Videos returns metadata and source links, including any iframe/media fields supplied in results. It
does not play videos, fetch media or grant rights to reuse content.

## shot-scraper

```bash
shot-scraper shot <url>
shot-scraper javascript <url> <expr> --auth state.json
```

Docs: <https://shot-scraper.datasette.io/>. The Instagram saved-collection recipe lives in
`plugins/qsm-web/scripts/instagram-saved/`.

## From a hooks module

`$.web.opensrcGet({ target: "react", project: "." })`, `$.web.doctor()`, `$.web.searxngSearch({
query: ["x"], instance: "https://search.test" })`, `$.web.browserboxStart({})`.
