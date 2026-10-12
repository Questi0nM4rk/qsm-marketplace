# Usage

Every verb ends in one outcome; with `--json`, one envelope `{ code, exit, reason, message,
warnings, data }` on stdout. Codes: `ok` 0, `failed` 1, `usage` 2, `missing` 4.

```bash
qsm-web searxng search <query...> [--engines a,b] [--category c] [--time-range day|week|month|year]
qsm-web searxng setup
qsm-web opensrc get <spec|address> [--project <dir>]
qsm-web doctor        # bins, tvly, the Tavily skills, the Context7 skill
qsm-web browserbox start | ls | stop <name> | stop --all
qsm-web browserbox fetch <url> [--in <name>] [--html] [--screenshot] [--cookies] [--keep]
qsm-web browserbox script <name> (--file <path> | --steps <json>)
qsm-web browserbox takeover <name> <tab> [--open]
```

`qsm-web <verb> --help` lists the rest; `--dry-run` shows the commands without running them.

- Search instance: `--instance`, then `QSM_SEARXNG_INSTANCE`, then `QSM_SEARXNG_CONFIG` (default
  `~/.config/qsm-searxng/config.json`).
- Sources from `opensrc get` land in `QSM_OPENSRC_DIR` (default `~/Clonned`). `versionMatched` is
  true only for a pinned spec or a version the `--project` declares.
- `browserbox fetch` without `--in` starts and stops its own instance; `--keep` leaves it running,
  stop it by name.
- `script` steps: `navigate`, `fill`, `fill-secret` (Bitwarden item, shown as `[redacted]`),
  `click`, `wait`, `extract`, `screenshot`. A failed step ends the run.
- `takeover` waits for a person to clear a challenge in the live view; default timeout five minutes.
- Env: `QSM_CONTAINER_RUNTIME`, `QSM_BROWSERBOX_OUT` (default `~/.cache/qsm-browserbox`),
  `QSM_BITWARDEN_CLI`, `QSM_MARKETPLACE` (the checkout, for the image build).

## shot-scraper

```bash
shot-scraper shot <url>
shot-scraper javascript <url> <expr> --auth state.json
```

Docs: <https://shot-scraper.datasette.io/>. The Instagram saved-collection recipe lives in
`plugins/qsm-web/scripts/instagram-saved/`.

## From a hooks module

`$.web.opensrcGet({ target: "react", project: "." })`, `$.web.doctor()`, `$.web.searxngSearch({
query: ["x"] })`, `$.web.browserboxStart({})`.
