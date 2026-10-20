## Context

The current library loads a personal config and merges hardcoded engine defaults into it. The CLI
then sends that policy even when the caller supplied no override. The response schema also accepts
an object without results and discards media URLs. The existing outcome renderer already owns
stdout, stderr, JSON envelopes and exit codes.

## Goals / Non-Goals

**Goals:** one source of server policy, explicit transport/request inputs, usable media evidence
and truthful outcomes for agents.

**Non-Goals:** engine implementation, server repair, retries, pagination, a config migration, a
new result/error framework, browser rewrites or new dependencies.

## Decisions

- Remove `SearxngConfig`, all config reader/writer/setup code and the setup manifest entry.
  Resolve address from `--instance`, then `QSM_SEARXNG_INSTANCE`. Missing address is `missing`;
  an explicit invalid address is `usage`. Accept absolute HTTP(S) addresses, including a
  reverse-proxy path. Reject embedded credentials, query and fragment rather than putting them
  in diagnostics.
- Keep result-count default 10 as a local output ceiling and transport timeout default 10000
  milliseconds. Add an explicit `--timeout` millisecond override, since a local config no longer
  supplies it. Both count and timeout must be positive safe integers. No arbitrary new upper
  limit. Validate a nonblank query and nonblank category/language when supplied. Safesearch is
  integer 0, 1 or 2; time-range choices remain owned by the manifest.
- Send only `q` and `format=json` by default. Do not force engines, category, language,
  safesearch, time range or page number. Explicit nonempty engine lists are trimmed and joined;
  `--engines ''` means no engine override. Never infer engines from the category.
- Require a JSON object containing a results array. Each result needs a nonblank URL. Keep
  existing normalized result fields and optional non-null `img_src`, `thumbnail_src` and
  `iframe_src` strings under their upstream names. Reject malformed response shapes; do not
  turn them into an empty success or relabel schema errors as non-JSON text. Keep transport,
  HTTP, non-JSON and schema failures distinct without echoing response bodies.
- Useful results plus engine failures remain `ok` with warnings and no retry. Empty results with
  reported engine failures are `failed` with the warnings retained, without claiming the whole
  instance is down. Empty results without engine failures are `ok` with an empty array and a
  no-results warning.
- Text success stays one JSON result array on stdout and warnings on stderr. JSON mode keeps
  the shared outcome envelope, but uses a short count message rather than duplicating the
  complete results in both `message` and `data`.
- Keep the shared outcome and CLI parser. Update the durable plugin spec, manifest, generated
  noun, docs, skills and doctor wherever they mention config/setup. Do not retain aliases,
  compatibility readers or migration hooks.

## Risks / Trade-offs

- Existing shells that only used a config file need an environment address or explicit flag.
  Document the two inputs; leave personal files untouched.
- An empty response with engine failures cannot prove every engine failed. Report exactly the
  observed condition, not an inferred outage.
- Optional image/iframe URLs are untrusted search evidence, not instructions or verified
  downloadable content.
- npm's upstream index is stale. Do not replace the server engine in this client; report its
  measured limitation.
- Missing generated harness declarations initially broke lint/typecheck. Generate the authentic
  installed-engine types. All current langdev gates must pass without weakening their limits.

## Migration Plan

Implement and test in an isolated worktree. Review the union of code and contracts, then integrate
through the normal gates. Rebuild only the requested CLI when safe. No private file migration or
deletion, server deployment or engine configuration change.

## Open Questions

None for this bounded search change. Separate browser/installer findings need their own verified
minimal repairs, not changes hidden in this contract.
