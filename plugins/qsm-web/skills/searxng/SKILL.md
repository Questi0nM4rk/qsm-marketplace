---
name: searxng
description: "Use when running a web search through the person's own SearXNG instance with qsm-web searxng: narrowing by engine, category, time range or language, reading its JSON, a suspended engine, setting the instance up. Triggers: search with searxng, qsm-web searxng, searxng is down, which engines, set up searxng. The research loop around it is the web-ladder skill."
---

# searxng

`qsm-web searxng search` asks the person's SearXNG instance, which reaches many engines in one call
and returns the same shape every time. This skill is how to call it so the result is narrow and its
failures are visible; when to call it is the web-ladder skill.

## Use

- `qsm-web searxng search "<query>"` prints one JSON array of results. `--json` wraps it in the
  outcome envelope, and the array is `data`.
- Narrow before you widen: `--engines`, `--category`, `--time-range day|week|month|year`,
  `--language en`, `--safesearch 0|1|2`, `--num-results <n>`. Widening a bad query returns more of
  the same noise.
- `--instance <url>` asks another instance once. `qsm-web searxng setup` writes the default instance
  and engines to the config file.
- `qsm-web doctor` says whether the instance answers.

## Red flags

- When the output is not a JSON array, stop and read it, because piping it on hides the failure.
- When an engine is reported suspended, treat it as a warning, not a result, and keep the rest.
- When the instance does not answer, say so and let the loop fall back to `WebSearch`, because a
  silent switch hides that the instance is down.

## Say it in the reply

The query as run with its flags, how many results came back, and any engine that was suspended or
an instance that did not answer.
