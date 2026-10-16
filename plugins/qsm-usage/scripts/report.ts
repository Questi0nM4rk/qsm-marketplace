// `qsm-usage report`: validates one findings document (lib/findings.ts) and renders it to one
// self-contained HTML file (lib/report.ts).

import { readFileSync, writeFileSync } from "node:fs";
import { type Handler, requiredString } from "../../../lib/cli-base.ts";
import { fail, messageOf, ok } from "../../../lib/outcome.ts";
import { describeFailure, validateFindings } from "../lib/findings.ts";
import { absent } from "../lib/formats.ts";
import { renderReport } from "../lib/report.ts";

export const report: Handler = (call) => {
  const file = requiredString(call, "file");
  const out = requiredString(call, "out");
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    return fail(absent(error) ? "missing" : "failed", `cannot read ${file}: ${messageOf(error)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return fail("failed", `${file}: invalid JSON: ${messageOf(error)}`);
  }
  const result = validateFindings(parsed);
  if (!result.ok) {
    return fail("failed", describeFailure(result));
  }
  const html = renderReport(result.value);
  try {
    writeFileSync(out, html);
  } catch (error) {
    return fail("failed", `cannot write ${out}: ${messageOf(error)}`);
  }
  return ok({ out }, `wrote ${out}`);
};
