---
name: searxng
description: "Use when running a web search through the person's own SearXNG instance with qsm-web searxng: choosing a search profile or engines, the instance, category, time range or language, reading its JSON, a suspended engine. Triggers: search with searxng, qsm-web searxng, search profile, niche search, academic search, vyhledavaci profil, searxng is down, which engines. The research loop around it is the web-ladder skill."
---

# searxng

`qsm-web searxng search` asks the person's SearXNG instance, which reaches many engines in one call
and returns the same shape every time. This skill is how to call it so the result is narrow and its
failures are visible; when to call it is the web-ladder skill.

## Use

- `qsm-web searxng search "<query>"` prints one JSON array of results. `--json` wraps it in the
  outcome envelope, and the array is `data`.
- The instance comes from `--instance <url>`, then `QSM_SEARXNG_INSTANCE`. There is no config file
  and no setup verb: the instance owns the engine and policy defaults, and only the flags you pass
  are sent.
- Narrow before you widen: `--engines`, `--category`, `--time-range day|week|month|year`,
  `--language en`, `--safesearch 0|1|2`, `--num-results <n>` (10 by default), `--timeout <ms>`
  (10000 by default). Widening a bad query returns more of the same noise.

## Source profiles

Use a profile instead of rebuilding an engine list for a common search intent:

| Profile | When and where it searches |
| --- | --- |
| `default` | Everyday search through the instance's current defaults, just like no profile |
| `niche` | Personal websites and discussions: `searchmysite`, `wiby`, `mwmbl`, `boardreader` |
| `academic` | Publications: `arxiv`, `crossref`, `openalex`, `semantic scholar`, `pubmed`, `europepmc` |

```bash
qsm-web searxng search "personal Linux websites" --profile niche
qsm-web searxng search "graph neural networks" --profile academic --language en
```

Profiles affect only the query. They do not enable engines globally or change the server. A
targeted profile reads `/config` before searching and requires all listed engines to be registered,
even if disabled by default. Both requests share `--timeout`. A missing engine or unreadable
catalog stops the query rather than silently searching different sources.

Use `--engines` without a profile for another explicit selection. Do not combine `--profile`
with `--engines` or `--category`: the CLI rejects it because SearXNG adds category sources to an
engine selection. For an engine-only search without a profile, omit `--category` too.

## Red flags

- When the output is not a JSON array, stop and read it, because piping it on hides the failure.
- When an engine is reported suspended, treat it as a warning, not a result, and keep the rest: the
  other engines' results are the answer.
- When no results come back and an engine reported a failure, the search failed. Say which engines
  failed; do not say the whole instance is down.
- When the instance does not answer, say so and let the loop fall back to `WebSearch`, because a
  silent switch hides that the instance is down.

## Say it in the reply

The query as run with its flags, how many results came back, and any engine that was suspended or
an instance that did not answer.
