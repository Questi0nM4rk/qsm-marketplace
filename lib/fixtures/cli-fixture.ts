// A fixture binary for lib/cli-base.test.ts: every arg shape the base
// supports, every outcome a handler can return. Run: bun lib/fixtures/cli-fixture.ts <verb> ...
import { runCli } from "../cli-base.ts";
import { fail, OUTCOME_CODES, type OutcomeCode, ok } from "../outcome.ts";
import { QsmError } from "../qsm-error.ts";
import type { QsmManifest } from "../qsm-manifest.ts";

/** A one-binary manifest with multi-word verbs: a group of three words deep,
 * a group of two, and a plain verb beside them. */
export const grouped: QsmManifest = {
  qsm: {
    bin: { "qsm-g": "scripts/cli.ts" },
    noun: "g",
    commands: {
      "qsm-g count": {
        description: "count files",
        args: [
          {
            name: "files",
            type: "string",
            positional: true,
            repeatable: true,
            description: "paths",
          },
        ],
      },
      "qsm-g toon encode": {
        description: "encode to TOON",
        args: [
          { name: "file", type: "string", positional: true, required: true, description: "input" },
          { name: "table", type: "boolean", description: "one table" },
        ],
      },
      "qsm-g toon decode": { description: "decode TOON" },
      "qsm-g gh pr submit-review": {
        description: "submit a review",
        args: [
          { name: "pr", type: "number", positional: true, required: true, description: "number" },
        ],
      },
    },
  },
};

export const manifest: QsmManifest = {
  qsm: {
    bin: { "qsm-fix": "lib/fixtures/cli-fixture.ts" },
    noun: "fix",
    commands: {
      "qsm-fix echo": {
        description: "print the parsed call back",
        args: [
          { name: "name", type: "string", positional: true, required: true, description: "who" },
          { name: "times", type: "number", description: "how many" },
          { name: "loud", type: "boolean", description: "upper case" },
          { name: "tag", type: "string", repeatable: true, description: "a label, repeatable" },
          { name: "mode", type: "string", choices: ["add", "remove"], description: "what to do" },
        ],
      },
      "qsm-fix files": {
        description: "many positionals",
        args: [
          {
            name: "input",
            type: "string",
            positional: true,
            repeatable: true,
            description: "paths",
          },
        ],
      },
      "qsm-fix run": {
        description: "everything after -- goes to the handler",
        passthrough: true,
        args: [{ name: "shell", type: "string", description: "which shell" }],
      },
      "qsm-fix refuse": { description: "throw a QsmError with a next step" },
      "qsm-fix outcome": {
        description: "return the named outcome",
        args: [
          { name: "code", type: "string", positional: true, required: true, description: "code" },
          { name: "warn", type: "string", repeatable: true, description: "warnings" },
        ],
      },
    },
  },
};

function failureCode(code: string): Exclude<OutcomeCode, "ok"> {
  for (const known of OUTCOME_CODES) {
    if (known !== "ok" && known === code) {
      return known;
    }
  }
  throw new Error(`not a failure code: ${code}`);
}

if (import.meta.main) {
  process.exit(
    await runCli(manifest, "qsm-fix", {
      echo: (call) => ok(call.args),
      files: (call) => ok(call.args),
      run: (call) => ok({ shell: call.args.shell, rest: call.rest }),
      refuse: () => {
        throw new QsmError("missing", "tool x is absent", { next: "install tool x" });
      },
      outcome: (call) => {
        const code = call.args.code;
        if (typeof code !== "string") {
          throw new TypeError("outcome needs --code");
        }
        const raw = call.args.warn;
        const warnings = Array.isArray(raw) ? raw : [];
        const outcome =
          code === "ok"
            ? ok({ fine: true }, "all good")
            : fail(failureCode(code), `asked for ${code}`);
        return { ...outcome, warnings };
      },
    }),
  );
}
