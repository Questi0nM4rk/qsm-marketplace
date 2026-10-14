// `qsm-usage count`: how big is this, before it is sent.

import { readFileSync } from "node:fs";
import { flagArg, type Handler, optionalString, stringList } from "../../../lib/cli-base.ts";
import { fail, type Outcome, ok } from "../../../lib/outcome.ts";
import {
  CountError,
  type CountMode,
  CREDENTIAL_ENV,
  countText,
  DEFAULT_MODEL,
} from "../lib/count.ts";
import { ESTIMATE_NOTE } from "../lib/estimate.ts";
import { absent, messageOf } from "../lib/formats.ts";

interface Counted {
  readonly path: string;
  readonly tokens: number;
}

export async function readStdin(): Promise<string> {
  return Bun.stdin.text();
}

function render(results: readonly Counted[], showTotal: boolean, total: number): string {
  const width = String(Math.max(total, ...results.map((r) => r.tokens))).length;
  const lines = results.map((r) => `${String(r.tokens).padStart(width)}  ${r.path}`);
  if (showTotal || results.length > 1) {
    lines.push("-".repeat(width), `${String(total).padStart(width)}  total`);
  }
  return lines.join("\n");
}

interface Options {
  mode: CountMode;
  model: string;
  apiKey: string | undefined;
}

/** Counts stdin and each named file; a file that cannot be read is an outcome, not a throw. */
async function countInputs(
  files: string[],
  useStdin: boolean,
  options: Options,
): Promise<Counted[] | Outcome> {
  const results: Counted[] = [];
  if (useStdin) {
    results.push({ path: "<stdin>", tokens: await countText(await readStdin(), options) });
  }
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch (error) {
      // A path the caller named that is not there is an absent prerequisite (`missing`, exit 4)
      // by the outcome table's own wording; a file that is there and will not be read is
      // `failed`.
      return fail(absent(error) ? "missing" : "failed", `cannot read ${file}: ${messageOf(error)}`);
    }
    results.push({ path: file, tokens: await countText(text, options) });
  }
  return results;
}

function modeOf(value: string | undefined): CountMode {
  if (value === undefined || value === "estimate") {
    return "estimate";
  }
  if (value === "exact") {
    return "exact";
  }
  throw new TypeError(`argument mode is ${value}, not estimate or exact`);
}

export const count: Handler = async (call) => {
  const files = stringList(call, "files");
  const useStdin = flagArg(call, "stdin");
  if (files.length === 0 && !useStdin) {
    return fail("usage", "no input: pass one or more files, or --stdin");
  }
  const mode = modeOf(optionalString(call, "mode"));
  const model = optionalString(call, "model") ?? DEFAULT_MODEL;
  const options = { mode, model, apiKey: process.env[CREDENTIAL_ENV] };
  let results: Counted[] | Outcome;
  try {
    results = await countInputs(files, useStdin, options);
  } catch (error) {
    if (error instanceof CountError) {
      return fail(error.code, error.message);
    }
    return fail("failed", messageOf(error));
  }
  if (!Array.isArray(results)) {
    return results;
  }
  const total = results.reduce((sum, r) => sum + r.tokens, 0);
  const data = { mode, model, estimated: mode === "estimate", files: results, total };
  const outcome = ok(data, render(results, flagArg(call, "total"), total));
  return mode === "estimate" ? { ...outcome, warnings: [ESTIMATE_NOTE] } : outcome;
};
