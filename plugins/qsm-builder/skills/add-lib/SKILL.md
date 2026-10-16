---
name: add-lib
description: "Use when code is about to go into root lib/ or lib/fixtures/: a helper two plugins both wrote, a test fixture several tests copy, a new export of the shared kit. Triggers: add to lib, shared helper, two plugins need the same function, move this to lib, new fixture for tests, add a lib module, pridej do lib, sdileny helper, vytahni to do lib. Decides whether the code is shared at all and how it lands; a whole new capability is add-plugin, a CLI verb is add-tool, a hook is add-hook."
---

# Add Lib

Root `lib/` is the layer-0 kit every plugin builds on, so each export is a cost all plugins pay.
Code reaches `lib/` only to delete copies that already exist; code with one consumer stays in its
plugin. This skill writes no plugin features and never parks code in `lib/` for later.

## Steps

1. Grep `lib/` and `lib/fixtures/` for the thing. A close export is changed slightly to serve both
   uses, not duplicated.
2. Count the copies in `plugins/`. Two or more: it goes to `lib/`. One: stop.
3. Put it in the module whose job it is (`fs.ts`, `paths.ts`, `outcome.ts`), or a new module named
   for its job. Test-only code goes in `lib/fixtures/`.
4. Write the export and `lib/<module>.test.ts` beside it, running it for real in a `sandboxDir`.
5. Replace every plugin copy with an import and delete the copy in the same change.
6. If a plugin could copy the export, add its name to `HELPERS` in
   `.gates/validate-no-private-helpers.ts` and to the `lib/` line of the Layout block in
   `AGENTS.md`.

## Hard rules

1. A new export lands in the change that deletes at least two plugin copies, because a helper
   with one consumer is a guess. Gate: review.
2. A plugin never defines a `HELPERS` export (`isRecord`, `messageOf`, `onPath`, `binPath`,
   `readStdin`, `claudeDir`, `writeAtomic`), because a fix must change one place. Gate:
   `validate-no-private-helpers`.
3. `lib/` imports `lib/` only, because layer 0 cannot depend on layer 1. Gate:
   `validate-no-cross-plugin-import`.
4. `lib/` imports no npm package, because each plugin pins its own. Gate: `validate-npm-packages`.
5. `lib/` never names a plugin, because the core works alone. Gate: review.
6. `lib/fixtures` is imported by tests only, and a fixture makes its temp dirs with `sandboxDir`,
   because that is the one place that removes them. Gate: `validate-test-temp`. How a test uses
   the kit is add-tool.

Errors, environment reads and the hooks sandbox apply here as add-tool and add-hook say.

## Done means

```text
mise exec -- bun run validate
mise exec -- bun run lint
mise exec -- bun run typecheck
mise exec -- bun test ./ ./.gates
mise exec -- git diff --shortstat     # deletions exceed additions
```

Then hand the diff to the `qsm-review` `strict-reviewer` agent with the hard rules as the
checklist. Done is every command passing and no blocker from the review.

## Red flags

- The change adds to `lib/` and deletes nothing: the copies are still there.
- A plugin says "it differs a little": change the shared export slightly, not a second one.

## Say it in the reply

The export, the plugin copies it deleted (the shortstat), each command with pass or fail, and the
reviewer's verdict.
