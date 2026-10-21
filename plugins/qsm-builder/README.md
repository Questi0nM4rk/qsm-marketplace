# qsm-builder

## Why it exists

This marketplace has rules that are easy to state and easy to break in the moment of adding
something, and prompts that are easy to write and hard to write well. qsm-builder exists so that
adding anything follows the same short path every time, and so that every skill and agent prompt
meets one bar, with a guide to why the rules are there and how to use them without misusing them.
It takes the stance that the marketplace grows only when a capability is missing, never because
something looked useful. It refuses to be a boilerplate generator or a second place where the
rules are written. If the repository ever stops changing, it has nothing left to guard.

## What it ships

One builder skill per kind of addition, each with its steps, hard rules that name the gate or the
review that checks them, and a done that ends in the gates, the evals and a strict review. Plus two
hooks: one refuses a broken `plugin.json`, one tells the agent a plugin's open lens edits and
feedback.

| Surface | Owns |
| --- | --- |
| `add-plugin` skill | a new plugin, or where an addition goes: the search, Why it exists, spec, `plugin.json`, install script, npm pins, dependencies |
| `add-tool` skill | a CLI bin or verb: `qsm.json`, the `runCli` handler, `fail` and `QsmError`, the generated noun, a test through `runBin` and `isolatedEnv` |
| `add-hook` skill | a hook as wiring: one `$.<noun>.<verb>()` call, `failure()` in every `.catch`, the events the engine skips, classic hooks |
| `add-skill` skill | a skill, agent or command: where it goes, its frontmatter and size, its fire, scenario and negative evals |
| `add-lib` skill | root `lib/` and `lib/fixtures/`: an export only when it deletes two plugin copies, registered with the private-helper gate |
| `skill-standards` skill | the quality bar for a skill, agent, or command prompt: its purpose first, reasons with rules, evals decide |
| `prompting` skill | the per-model tables (Claude 5.x, GPT-6) and the sources, loaded when writing or tightening a prompt |
| manifest check | on `Write` and `Edit` of a `plugin.json`: kebab-case `name`, a `version`, when present, numeric, non-empty `description`, `author`, string-array `keywords`, `hooks` as a `.json` path (never `null`) |
| `qsm-builder` binary | the lens: one page of every plugin, why it exists, its dependencies, skills, agents and evals, served live or exported; edits become tasks, never file writes |

## Install

```bash
claude plugin install qsm-builder@qsm-marketplace
```

Depends on `qsm-openspec` (the spec flow add-plugin hands to) and `qsm-tasks` (the lens reads and
makes tasks through it). `bun plugins/qsm-builder/scripts/install.ts` compiles the `qsm-builder`
binary. `qsm-builder lens export [dir] [--out file]` writes one static HTML page of the whole
marketplace (default `.qsm/lens.html`): every plugin, why it exists, its dependencies with their
reasons, skills, agents, eval cases and what it refers to. `qsm-builder lens readme [dir] [--check]`
writes the root README's generated block and the banners from the same model.
`qsm-builder lens [dir] [--port]` serves the same page on 127.0.0.1, redrawn as files change; a pen
on each text turns an edit into one task in the task tool (never a file write), and
`qsm-builder lens tasks [plugin]` lists a plugin's open tasks, edits and feedback, each marked stale
when its file changed since. The exported page, published as an artifact, saves each pen edit as a
row in the artifact database; `qsm-builder lens pull <artifact-url>` turns each untaken row into the
same task and marks it taken. Opened from disk, the page is read-only and says where edits are made.
A hook tells the agent a plugin's open edits and feedback the first time in a session it reads or
edits a file of it.

## Caveats

- The skills are guidance; only the manifest check enforces anything.
- `evals/` holds the fire, scenario and negative cases for these skills; run them with `bun run eval
  qsm-builder`, which evals a copy without `dependencies` because the eval sandbox cannot resolve
  them.
- The check runs on `Write` and `Edit` only, not on shell or patch edits, and needs function hooks
  enabled in the harness. Registration and name-matches-directory are the commit-time gate's job.
