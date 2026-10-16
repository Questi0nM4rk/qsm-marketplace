---
name: add-tool
description: "Use when adding a CLI binary or a verb to a plugin in this marketplace: the qsm.json declaration, the handler, its errors, its test, the generated noun and the docs. Triggers: add a tool, add a verb, add a CLI command, new qsm-* command, new subcommand, qsm.json command, pridej tool, pridej verb, pridej prikaz. Where the work goes is the add-plugin skill; how a skill is written is skill-standards."
---

# Add Tool

A tool is a CLI bin or one more verb of a bin a plugin already has. It exists so the person, a
script and a hook reach the same logic through one declared surface. This skill makes the build
follow the kit in root `lib/` instead of growing a private copy of it, and ends only when the
commands below pass and a review finds no blocker. It does not decide whether the capability is a
new plugin (add-plugin does), and it writes no logic the plugin's own `lib/` should hold.

## Steps

1. Search first: a verb that does this, a helper in root `lib/`, a plugin that owns the concept. An
   owner found means edit it in place (add-plugin step 1).
2. Declare the verb in the plugin's `qsm.json` under `qsm.commands`, key `"<bin> <verb>"` (a verb
   may be several words), with `description` and typed `args`. Run `parseManifest` over it in
   `scripts/cli.ts`; a first verb also adds `qsm.bin` and `qsm.noun`.
3. Put the logic in the plugin's `lib/`, one job per function. The handler in `scripts/cli.ts` only
   reads the call through the accessors (`optionalString`, `requiredString`, `optionalNumber`,
   `requiredNumber`, `flagArg`, `stringList`) and returns `ok(data, message)` or `fail(code,
   message)`.
4. Register the handler in the map given to `runCli(manifest, bin, handlers)`.
5. Read the environment through `lib/paths.ts` (`claudeDir`, `configDir`, `dataDir`, `stateDir`,
   `binDir`), passing the env in; read `QSM_*` and `CLAUDE_*` by name, nothing else.
6. Refresh the generated noun: `bun lib/generate-noun.ts plugins/<name>` (`--check` to verify).
7. Add the verb row to the plugin's `USAGE.md` and any flag or caveat to `INSTALL.md`; a new
   requirement or scenario goes to `openspec/specs/<name>/spec.md` before the code.
8. Write the test: spawn the real entry, `runBin(script, argv, { env })` with `isolatedEnv(home)`,
   and assert on exit code and `--json` `envelopeOf` / `dataOf`. One happy path, one real failure.
9. Run DONE MEANS, then hand the diff to the review.

## HARD RULES

1. A verb MUST be declared in `qsm.json` and handled through `runCli`; a verb with a handler and no
   declaration, or the reverse, throws at start (`checkHandlers` in `lib/cli-base.ts`). Gate: that
   check, plus `validate-generated`.
2. A handler MUST read arguments through the `lib/cli-base.ts` accessors, never `process.argv`,
   because `parseCall` already validated and coerced them. Gate: review.
3. A failure MUST be `fail(code, message)` or a thrown `QsmError` (`lib/qsm-error.ts`; `UsageError`
   from `lib/outcome.ts` for a wrong call), and a plugin never defines an error class that carries
   an outcome code, because `runCli` maps exactly these and one error system per project is the
   rule. Gate: review.
4. A failure MUST name its cause with one of `failed`, `usage`, `worse`, `missing`, `blocked`,
   `partial`; a silent success on a broken state is never allowed, and a missing tool is `missing`
   with no fallback path. Gate: review.
5. Every verb MUST print one `--json` envelope through `runCli`, never its own JSON on stdout,
   because scripts and the noun parse `{ code, exit, reason, message, warnings, data }`. Gate:
   the test reads `envelopeOf`.
6. Plugin code MUST read HOME, `XDG_*` and `CLAUDE_CONFIG_DIR` only through `lib/paths.ts`, never
   `process.env.HOME`, `homedir()` or the names, because a test points them at a sandbox. Gate:
   `validate-no-private-helpers`.
7. A CLI MUST read arguments, `QSM_*` and `CLAUDE_*` only, and nothing may invoke it through a
   path into this repository, because the compiled binary has no checkout beside it (Iron Law 9).
   Gate: review.
8. A plugin MUST NOT define a helper root `lib/` exports (`isRecord`, `messageOf`, `onPath`,
   `binPath`, `readStdin`, `claudeDir`, `writeAtomic`), because a second copy drifts. Gate:
   `validate-no-private-helpers`.
9. The generated noun MUST be refreshed in the same commit as `qsm.json`; never hand-edit
   `types/index.d.ts` or `hooks/noun.generated.ts`. Gate: `validate-generated`.
10. A test MUST spawn the CLI with `runBin` and `isolatedEnv`, make temp dirs with `sandboxDir`,
    write fakes with `fakeBin` (`cliShim` for an installed bin), build git repos with
    `lib/fixtures/git.ts`, and never spread `process.env` into a child, because a test that reads
    the real HOME passes here and fails elsewhere. Gates: `validate-no-private-helpers` (the
    spread), `validate-test-temp` (`mkdtemp`, `tmpdir`), the run guard of `lib/fixtures/sandbox.ts`
    (leftovers); the rest is review.
11. A test MUST drive the real binary entry and not restate the handler; a unit test only for
    logic the run cannot reach. Gate: review.
12. A new file, class or function MUST earn its place by one of four reasons: it lets a piece be
    tested alone, it removes duplication (a fifth copy means one owner), it gives a name and one
    home to something scattered, or it adds behaviour. With none it stays where it is used. Gate:
    review.
13. A new root `lib/` export MUST land in the change that deletes at least two plugin copies of it
   . Gate: review.
14. Every new verb MUST be in `USAGE.md`, and its behaviour in the spec as a scenario. Gate: review.

## DONE MEANS

From the repository root, each exits 0:

```bash
bun run validate
bun run lint
bun run typecheck
bun test ./ ./.gates
```

`bun test` ends with the run guard (`lib/fixtures/sandbox.ts`) reporting nothing left in the temp
dir. Then run the new verb for real, from a shell with `--json`, and read what it printed; run
`bun run eval <plugin>` when the change touched a skill or agent.

Then review: hand the diff to the `qsm-review` strict-reviewer agent with the HARD RULES above as
the checklist. The build is not done until every command passes and the review returns no blocker.

## Say it in the reply

The verb and where it lives, the commands that ran with their exit codes, the real run's output
line, and the review's verdict.
