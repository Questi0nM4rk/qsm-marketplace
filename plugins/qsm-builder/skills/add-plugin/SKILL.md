---
name: add-plugin
description: "Use when adding anything to this marketplace (the checklist: search for an existing home, why it exists, spec, build, proof in a fresh session): a new plugin for a capability that has none, or content placed inside a plugin that already exists (a skill, an agent, a command, a hook, a CLI verb, a document). Triggers: add a plugin, new plugin, scaffold a plugin, add a skill, add a hook, add a command, where does this go, kam to patri, extend the marketplace, pridej plugin. Owns the order and the file contract; the quality bar for a prompt is the skill-standards skill."
---

# Add Plugin

This is the checklist for adding anything to this marketplace, a whole plugin or one skill, agent,
command, hook or CLI verb inside one. It makes you search for an existing home first, decide whether
it is a new plugin or content in an old one, write why it exists, then the spec, then build, and
finally prove in a fresh session that the harness really shows it. The marketplace grows only when a
capability is missing, and every addition says why it exists before it exists as files. It does not
repeat the layout and the rules in AGENTS.md, which the agent has already read, and it writes no
code for you.

## Start from the person's task, when there is one

The lens has a new-item page. It saves what the person wants as one task of kind new: its title
reads `<plugin>: new skill <name>` (or `marketplace: new plugin <name>`), and its description holds
the file the item would start in, the use case, the trigger words, the links and one eval case.
`qsm-builder lens tasks <plugin>` lists such tasks, and the hook shows them when you first touch the
plugin. Read the task as the intent of the work, not as a decision about where it goes: the person
named a plugin without searching, so step 1 runs in full, and an existing owner wins over the
plugin the task names. Show the person what you found, the unit you would build and the files, then
build after their yes. A task whose file already exists is stale: say so and ask. Close the task
with what was created and the eval that ran.

## 1. Search before anything is written

The concept may already have a home under another name. Search the tree for the concept, not the
phrasing: plugin descriptions, skill descriptions, spec requirement titles, the README sections Why
it exists, and `qsm-memory search <concept>` for what was decided before.

| The search finds | Do |
| --- | --- |
| a plugin or document that owns the concept | edit it in place, even if its name is worse than yours, because a rename is one commit and a second copy is drift |
| a near neighbour with a different purpose | say which of the two owns it before writing |
| nothing | go on |

## 2. New plugin, or content in one that exists

| Signal | Unit |
| --- | --- |
| one capability nothing else covers, with its own reason to exist | a new plugin |
| behaviour or a verb of a capability that exists | content in that plugin |
| a rule every agent needs on every task | the always-loaded instructions, one or two lines |
| code two plugins would import | root `lib/`, once the second consumer exists |

A plugin is the install unit, so a new plugin claims that someone would want this and not the rest.
If it would always be installed with X, it is content in X.

## 3. Why it exists first, then spec, then build

Write the README's `## Why it exists` before any directory holds more than a name. If its five
sentences will not come (the gap, the stance, what it refuses to be, when it has no reason to
exist), the capability is not understood and the build would be a guess. Then the spec,
`openspec/specs/<name>/spec.md`, through the spec flow of `qsm-openspec` (`spec-propose`, and if it
is not installed the step stops with `missing` naming it): a scenario that describes code is a test,
one that describes agent behaviour is skill text. Then the build. A skill or an agent starts from
its reason too: its opening says why it exists, for whom, and what is out of scope, as the
skill-standards skill lays out.

## 4. What a plugin ships

| File | When | Holds |
| --- | --- | --- |
| `.claude-plugin/plugin.json` | always | name equal to the directory, version, description, author, keywords, `dependencies` |
| `README.md`, `openspec/specs/<name>/spec.md` | always | the consumer page, opening with `## Why it exists` (at most five sentences), and what it does |
| `qsm.json` | with a bin | `bin`, `noun`, a description and typed args per command |
| `INSTALL.md`, `USAGE.md` | with a bin | our verbs, flags and caveats |
| `scripts/install.ts` | when it installs anything | `installBase(...)`, never edits a file the user owns |
| `scripts/activate.ts` | when it changes a file the user owns | an `Activation`, run only by `qsm-setup activate` |
| `scripts/cli.ts`, `lib/*.ts` | with a bin | the CLI and its logic |
| `skills/<name>/SKILL.md`, `agents/<name>.md` | as needed | one subject each |
| `evals/<case>/prompt.md` and `graders/` | any plugin with a skill or an agent | a `fire` and a `scenario` case per skill and agent, one `negative` per plugin (skill-standards) |
| `hooks/` | as needed | `hooks.json`, `register.tsx`, `tsconfig.json` |
| `types/index.d.ts` | with a noun | generated from `qsm.json`, never hand-edited |

A manifest never carries `"hooks": null`; the key names a hooks file or is absent, and this
plugin's manifest check refuses the write either way.

## 5. Done means gates green and the surface seen

| Proof | Answers |
| --- | --- |
| `bun run validate`, lint, typecheck, `bun test`, exit 0 | the files are shaped as the marketplace requires |
| `bun run eval <plugin>` passing | the harness surfaces it: the fire case loads the skill, the scenario case changes the work, the negative case stays quiet |

The eval is the proof a gate cannot give: a malformed frontmatter line drops a skill without an
error, and a skill that never triggers is not shipped, whatever the gates say. When the eval fails,
fix the description first, since that is what the harness matches.

## Red flags

- When you notice a directory growing before its README's Why it exists exists, stop and write the
  five sentences, because they are the decision and the directory is its consequence.
- When a second document is about to cover a concept that has one, edit the first, because two
  owners drift apart unseen.
- When the new plugin would never be installed without another, make it content in the other,
  because the install unit is what a person chooses alone.
- When the only proof is a green gate, run the eval, because the gate reads files and only a
  session shows what the harness loads.
- When a README starts transcribing an upstream manual, link it instead, because our surface is
  the only part we can keep true.

## Say it in the reply

One line naming the unit and the route: a new plugin and why nothing existing owns it, or the
plugin and file the content goes into. Then the two proofs with what each printed: the gates that
ran, and the eval cases with pass or fail.
