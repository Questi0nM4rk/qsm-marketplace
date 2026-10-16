// `qsm-usage count`: how big is this, before it is sent.

import { readFileSync } from "node:fs";
import {
  flagArg,
  type Handler,
  optionalString,
  readStdin,
  stringList,
} from "../../../lib/cli-base.ts";
import { fail, messageOf, ok } from "../../../lib/outcome.ts";
import { QsmError } from "../../../lib/qsm-error.ts";
import { type CountMode, CREDENTIAL_ENV, countText, DEFAULT_MODEL } from "../lib/count.ts";
import { ESTIMATE_NOTE } from "../lib/estimate.ts";
import { absent } from "../lib/formats.ts";

interface Counted {
  readonly path: string;
  readonly tokens: number;
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

/** Counts stdin and each named file; a file that cannot be read throws the outcome it is. */
async function countInputs(
  files: string[],
  useStdin: boolean,
  options: Options,
): Promise<Counted[]> {
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
      throw new QsmError(
        absent(error) ? "missing" : "failed",
        `cannot read ${file}: ${messageOf(error)}`,
        { cause: error },
      );
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
  const results = await countInputs(files, useStdin, options);
  const total = results.reduce((sum, r) => sum + r.tokens, 0);
  const data = { mode, model, estimated: mode === "estimate", files: results, total };
  const outcome = ok(data, render(results, flagArg(call, "total"), total));
  return mode === "estimate" ? { ...outcome, warnings: [ESTIMATE_NOTE] } : outcome;
};
