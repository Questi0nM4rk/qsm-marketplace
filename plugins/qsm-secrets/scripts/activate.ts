#!/usr/bin/env bun
// The one place this plugin writes a file the person owns: the backend choice in setup.json.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ask } from "../../../lib/cli-base.ts";
import {
  type Activation,
  activationMain,
  type InstallResult,
} from "../../../lib/install-contract.ts";
import { setupConfigPath } from "../../../lib/paths.ts";
import { CHOICES } from "../lib/backend.ts";

const QUESTION = "where qsm-secrets keeps secrets: bitwarden (rbw, online) or libsecret (local)";

export const activation: Activation = {
  status: (env) => {
    const path = setupConfigPath(env);
    const file = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
    return typeof file.secrets?.backend === "string" ? "activated" : "absent";
  },
  options: [
    {
      name: "backend",
      values: Object.keys(CHOICES),
      description: QUESTION,
    },
  ],
  activate: (ctx): InstallResult => {
    const path = setupConfigPath(ctx.env);
    const backend = ctx.choices.backend as string;
    const file = existsSync(path)
      ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, object>)
      : {};
    const detail = `secrets.backend = ${backend} in ${path}`;
    if (ctx.dryRun) {
      return { tool: "qsm-secrets", status: "skipped", detail: `would set ${detail}`, steps: [] };
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ ...file, secrets: { backend } }, null, 2)}\n`);
    return { tool: "qsm-secrets", status: "installed", detail: `set ${detail}`, steps: [] };
  },
};

/** argv with `--backend <answer>` added when the person is asked; a usage outcome leaves it
 * without, and the activation reports the missing flag. */
function answered(argv: string[]): string[] {
  if (argv.includes("--backend")) {
    return argv;
  }
  const call = {
    verb: "activate",
    args: {},
    rest: [],
    json: argv.includes("--json"),
    noInput: argv.includes("--json") || argv.includes("--no-input"),
  };
  const answer = ask(call, "backend", {
    question: QUESTION,
    choices: Object.keys(CHOICES),
    defaultChoice: "bitwarden",
  });
  return typeof answer === "string" ? [...argv, "--backend", answer] : argv;
}

if (import.meta.main) {
  process.exit(await activationMain(activation, answered(process.argv)));
}
