---
name: add-plugin
description: "Use when adding a whole new plugin to this marketplace, or deciding whether a request is a new plugin or content in one that exists: the search for an existing home, README Why it exists, spec, plugin.json, layout, install script, npm pins, dependencies. Triggers: add a plugin, new plugin, scaffold a plugin, where does this go, kam to patri, extend the marketplace, pridej plugin, udelej novy plugin. A verb or bin is add-tool, a hook is add-hook, a skill or agent is add-skill, shared code is add-lib; the quality bar of a prompt is skill-standards."
---

# Add Plugin

Use this when a capability may deserve its own plugin, the install unit of this marketplace. Most
additions are content in a plugin that exists, so the first job is to search and say which. The
parts inside a plugin (verbs, hooks, skills) are built by their own builder skills; this one owns
only the plugin around them.

## Steps

1. Search for the concept, not the phrasing: plugin and skill descriptions, spec requirement
   titles, the READMEs' Why it exists, `qsm-memory search <concept>`. An owner found: edit it in
   place, build the part with add-tool, add-hook or add-skill, and Done means below still holds.
2. A `qsm-builder lens tasks <plugin>` task of kind new is the person's intent, not a decision
   about where it goes: run step 1 in full, show what you found, build after their yes, and close
   the task with what was created and the eval that ran.
3. Write the README's `## Why it exists`, then the spec through `qsm-openspec` `spec-propose`.
   If the why will not come, stop and ask.
4. Create `.claude-plugin/plugin.json` and list the plugin in `.claude-plugin/marketplace.json`.
5. Add `scripts/install.ts` when the plugin ships a bin or anything compiled, and
   `scripts/activate.ts` (an `Activation` run through `activationMain`) only when the plugin
   writes into the person's harness on `qsm-setup activate`.
6. Add `package.json` and `bun.lock` only if the plugin imports an npm package; the install base
   runs `bun install --frozen-lockfile` before it compiles.
7. Build the parts through their skills: a verb or `qsm.json` is add-tool, a hook is add-hook, a
   skill or agent with its eval is add-skill, code a second plugin needs is add-lib.

## Hard rules

- Search for an existing owner before any file exists; gate: review.
- Make a plugin only when it would be installed alone, and add a file, class or function only for
  one of the four reasons (testable alone, removes duplication, gives a missing thing one home,
  adds behaviour); gate: review.
- Open the README with `## Why it exists` as its first `##`, at most five sentences: the gap, the
  stance, what it refuses to be, and when it would have no reason to exist; no features, verbs,
  install or file names, because it changes only when the reason does; gate:
  `validate-why-it-exists`.
- Write the spec before the build; gate: review.
- Name `plugin.json` after its directory, author `{"name": "qsm"}`, no `version` key, and list it
  in `marketplace.json` with source `./plugins/<name>`, because without a version Claude Code
  names the cache after the commit and `claude plugin update` picks up each commit; gate:
  `validate-plugin-contracts`.
- Keep `qsm.json`, `INSTALL.md` and `USAGE.md` out unless the plugin ships a bin, and name the bin
  after the plugin; gate: `validate-generated`, otherwise review.
- Make `scripts/install.ts` one `export const install = installScript(import.meta);` call from
  `lib/install-base.ts`, link into the user's bin directory only through `linkBin`, and let
  `cliMain` and `activationMain` parse the arguments, because the base purges what an older
  version left and nothing else in an installer reads `process.argv`; gate: review.
- Install a Python tool with `uv tool install`, and never shell out to a sibling plugin's
  installer, because a needed plugin is a dependency; gate: review.
- Import only root `lib/` and the plugin itself, and reach another plugin only through its CLI
  verb or its noun; gate: `validate-no-cross-plugin-import`. Code two plugins share is add-lib.
- Pin npm packages to one exact version, equal everywhere, and import only what the plugin's
  `package.json` declares; gate: `validate-npm-packages`.
- Write each dependency in `plugin.json` `dependencies` and as a ``- `<name>`: <reason>`` bullet
  under `### Requirement: Dependencies` in the spec, with a scenario for what fails without it,
  and give it no fallback: without it the plugin fails `missing` and names what to install; gate:
  `validate-dependencies`.
- A plugin that replaces a core default names that default in its Why it exists and says why it
  is better, because the core must keep working alone; gate: review.
- Carry no history in the tree (deprecated marker, renamed-from note, `v2` copy, date); gate:
  review.
- Keep employer names, tenant ids and machine paths out, because the repository is public; gate:
  review.

## Done means

All of these exit 0, and the output is read, not assumed:

```text
mise exec -- bun run validate
mise exec -- bun run lint
mise exec -- bun run typecheck
mise exec -- bun test ./ ./.gates
```

Then the kind's own proof: `bun run eval <plugin>` when it ships a skill or agent, `bun run
test:hooks` when it has hooks, one real run of each new verb. Last, hand the diff to the
`qsm-review` `strict-reviewer` agent with the hard rules as the checklist; the build is not done
until every command passes and the review returns no blocker.

## Say it in the reply

One line naming the unit and why: a new plugin and what nothing existing owns, or the plugin and
file the content went into. Then each Done means command with pass or fail, and the review verdict.
