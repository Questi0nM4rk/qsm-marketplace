---
name: add-plugin
description: "Use when adding a whole new plugin to this marketplace, or deciding whether a request is a new plugin or content in one that exists: the search for an existing home, README Why it exists, spec, plugin.json, layout, install script, npm pins, dependencies. Triggers: add a plugin, new plugin, scaffold a plugin, where does this go, kam to patri, extend the marketplace, pridej plugin, udelej novy plugin. A verb or bin is add-tool, a hook is add-hook, a skill or agent is add-skill, shared code is add-lib; the quality bar of a prompt is skill-standards."
---

# Add Plugin

Use this when a capability may deserve its own plugin, the install unit of this marketplace. Most
additions are content in a plugin that exists, so the first job is to search and say which. A new
plugin claims that someone would want this and not the rest; the parts inside it (verbs, hooks,
skills) are built by their own builder skills, and this one owns only the plugin around them.

## Steps

1. Search for the concept, not the phrasing: plugin and skill descriptions, spec requirement
   titles, the READMEs' Why it exists, `qsm-memory search <concept>`. An owner found: edit it in
   place and stop here; the part you add goes to add-tool, add-hook or add-skill.
2. A `qsm-builder lens tasks <plugin>` task of kind new is the person's intent, not a decision
   about where it goes: run step 1 in full, show what you found and the files, build after their
   yes, close the task with what was created and the eval that ran.
3. Write the README's `## Why it exists` first: the gap, the stance, what it refuses to be, when
   it has no reason to exist, in five sentences. If they will not come, stop and ask.
4. Write the spec, `openspec/specs/<name>/spec.md`, through `qsm-openspec` `spec-propose`.
5. Create `.claude-plugin/plugin.json` (name equal to the directory, `author` `{"name": "qsm"}`,
   description, keywords) and list the plugin in `.claude-plugin/marketplace.json`.
6. Add `scripts/install.ts` when the plugin ships a bin or anything compiled: one line,
   `export const install = installScript(import.meta);`, with `upstream` or `extra` only for what
   the plugin must fetch.
7. Add `package.json` and `bun.lock` only if the plugin imports an npm package; pin it exactly.
8. Name another plugin in `dependencies` only when it cannot work without it, and give the reason
   in the spec.
9. Build the parts through their skills: a CLI verb or `qsm.json` is add-tool, a hook is add-hook,
   a skill or agent with its eval is add-skill, code a second plugin needs is add-lib.
10. Run DONE MEANS, then hand the diff to review.

## HARD RULES

- MUST search for an existing owner before any file exists, because a second copy of a concept
  drifts from the first (AGENTS.md Iron Law 5); gate: review.
- MUST make a plugin only when it would be installed alone; one that always installs with X is
  content in X, and a new file, class or function earns its place by one of the four reasons
  (testable alone, removes duplication, gives a missing thing one home, adds behaviour) or stays
  where it is used; gate: review.
- MUST open the README with `## Why it exists` as its first `##`, at most five sentences, because
  it is the decision and the directory only its consequence; gate: `validate-why-it-exists`.
- MUST write the spec before the build, because a requirement written after the code describes
  the code; gate: review.
- MUST name `plugin.json` after its directory, with author `{"name": "qsm"}`, no `version` key
  (a version pins the cache and `claude plugin update` stops seeing commits), and a
  `marketplace.json` entry with source `./plugins/<name>`; gate: `validate-plugin-contracts`.
- MUST keep `qsm.json`, `INSTALL.md` and `USAGE.md` out unless the plugin ships a bin, and give a
  bin the plugin's own name, because one plugin has one binary; gate: `validate-generated`
  (`qsm.json` implies the generated types), otherwise review.
- MUST make `scripts/install.ts` one `installScript(import.meta)` call from
  `lib/install-base.ts`, never a hand-written installer or a call to a sibling's, because the base
  purges old artifacts and links through `linkBin`; gate: review.
- MUST import only root `lib/` and the plugin itself, never another plugin's files, because a
  plugin reaches another through its verb or noun; gate: `validate-no-cross-plugin-import`.
- MUST NOT add a root `lib/` export unless the same change deletes at least two plugin copies of
  it, because shared code with one consumer is a guess; gate: review.
- MUST NOT define a helper root `lib/` exports (`isRecord`, `messageOf`, `onPath`, `binPath`,
  `readStdin`, `claudeDir`, `writeAtomic`), because it is the copy that diverges; gate:
  `validate-no-private-helpers`.
- MUST pin every npm package to one exact version, equal in every `package.json` that names it,
  and import only what the plugin's own `package.json` declares, because ranges make two
  machines differ; gate: `validate-npm-packages`.
- MUST write each dependency twice, in `plugin.json` `dependencies` and as a
  ``- `<name>`: <reason>`` bullet under `### Requirement: Dependencies` in the spec, because the
  reason is what lets it be removed later; gate: `validate-dependencies`.
- MUST NOT carry history in the tree (no deprecated marker, renamed-from note, `v2` copy, date),
  because git holds it; gate: review.
- MUST keep employer names, tenant ids and machine paths out, because this repository is public
  (Iron Law 10); gate: review.

## DONE MEANS

All of these exit 0, and the output is read, not assumed:

```text
mise exec -- bun run validate
mise exec -- bun run lint
mise exec -- bun run typecheck
mise exec -- bun test ./ ./.gates
```

`bun test` ends with the run guard (`lib/fixtures/sandbox.ts`) reporting nothing left in the temp
directory. Then the kind's own proof: `bun run eval <plugin>` when it ships a skill or agent,
`bun run test:hooks` when it has hooks, and one real run of each new verb. A fresh session shows
the surface the harness really loads.

Last, hand the diff to the `qsm-review` `strict-reviewer` agent with the HARD RULES above as the
checklist. The build is not done until every command passes and the review returns no blocker.

## Say it in the reply

One line naming the unit and why: a new plugin and what nothing existing owns, or the plugin and
file the content went into. Then each DONE MEANS command with pass or fail, and the review verdict.
