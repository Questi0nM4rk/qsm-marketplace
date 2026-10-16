---
name: add-tool
description: "Use when adding a CLI binary or a verb to a plugin in this marketplace: the qsm.json declaration, the handler, its errors, its test, the generated noun and the docs. Triggers: add a tool, add a verb, add a CLI command, new qsm-* command, new subcommand, qsm.json command, pridej tool, pridej verb, pridej prikaz. Where the work goes is the add-plugin skill; how a skill is written is skill-standards."
---

# Add Tool

A tool is a CLI bin, or one more verb of a bin a plugin already has, so the person, a script and a
hook reach the same logic through one declared surface. This skill makes the build use the kit in
root `lib/` instead of growing a private copy. It does not decide whether the capability is a new
plugin (add-plugin does).

## Steps

1. Search first for a verb that does this, a helper in root `lib/`, a plugin that owns the concept.
   An owner found means edit it in place.
2. Declare the verb in the plugin's `qsm.json` under `qsm.commands`, key `"<bin> <verb>"`, with
   `description` and typed `args`. A first verb also adds `qsm.bin` and `qsm.noun`.
3. Put the logic in the plugin's `lib/`. The handler in `scripts/cli.ts` reads the call through the
   `lib/cli-base.ts` accessors (`optionalString`, `requiredString`, `optionalNumber`,
   `requiredNumber`, `flagArg`, `stringList`) and returns `ok(data, message)` or
   `fail(code, message)`.
4. Register the handler in the map given to `runCli(manifest, bin, handlers)`.
5. Refresh the noun: `bun lib/generate-noun.ts plugins/<name>`.
6. Add the verb's row to `USAGE.md` and a scenario to `openspec/specs/<name>/spec.md`.
7. Write the test, then run DONE MEANS and hand the diff to the review.

## Hard rules

1. Declare every verb in `qsm.json` and handle it through `runCli`, because a mismatch throws at
   start. Gate: `checkHandlers`, `validate-generated`.
2. Read arguments through the accessors, never `process.argv`, because `parseCall` already
   validated them. Gate: review.
3. A failure is `fail(code, message)` or a thrown `QsmError` (`UsageError` for a wrong call), never
   a plugin error class, because `runCli` maps only these. Gate: review.
4. Name the cause with an outcome code (`failed`, `usage`, `worse`, `missing`, `blocked`,
   `partial`) and take no fallback path, because a silent success on a broken state hides the bug.
   Gate: review.
5. Print output only through `runCli`'s `--json` envelope, because scripts and the noun parse it.
   Gate: the test reads `envelopeOf`.
6. Read HOME, `XDG_*` and `CLAUDE_CONFIG_DIR` only through `lib/paths.ts`, because a test points
   them at a sandbox. Gate: `validate-no-private-helpers`.
7. Never define a helper root `lib/` exports (`isRecord`, `messageOf`, `onPath`, `binPath`,
   `readStdin`, `claudeDir`, `writeAtomic`), because a second copy drifts. Gate:
   `validate-no-private-helpers`.
8. Never hand-edit the generated noun (`types/index.d.ts`, `hooks/noun.generated.ts`) and commit it
   with `qsm.json`. Gate: `validate-generated`.
9. Test through the real entry: `runBin` with `isolatedEnv`, temp dirs from `sandboxDir`, fakes from
   `fakeBin` or `cliShim`, repos from `lib/fixtures/git.ts`, and never a spread of the whole
   environment, because a test that reads the real HOME passes here and fails elsewhere. Gates:
   `validate-no-private-helpers`, `validate-test-temp`, the run guard in
   `lib/fixtures/sandbox.ts`; the rest is review.
10. Never invoke the CLI through a path into this repository, because the compiled binary has no
    checkout beside it. Gate: review.

## Done means

From the repository root, each exits 0:

```bash
bun run validate
bun run lint
bun run typecheck
bun test ./ ./.gates
```

Run the new verb for real with `--json` and read what it printed. Then hand the diff to the
`qsm-review` strict-reviewer agent with the hard rules as its checklist; the build is not done
until it returns no blocker.

## Say it in the reply

The verb and where it lives, the commands with their exit codes, the real run's output line, and
the review's verdict.
