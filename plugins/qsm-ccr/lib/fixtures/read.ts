// What a fake child process reads from its argv, its environment and its files, checked: a missing
// piece stops the fake with a message instead of becoming the string "undefined".
import { readFileSync } from "node:fs";
import { isRecord } from "../../../../lib/outcome.ts";
import { type Json, parseJson } from "../parse.ts";

/** `value`, or a thrown error naming `what` when the fake was started without it. */
export function need(value: string | undefined, what: string): string {
  if (value === undefined) {
    throw new Error(`the fake needs ${what}`);
  }
  return value;
}

/** The JSON object in `path`; throws when the file holds anything else. */
export function readJsonObject(path: string): Json {
  const parsed = parseJson(readFileSync(path, "utf8"));
  if (!isRecord(parsed)) {
    throw new Error(`${path} does not hold a JSON object`);
  }
  return parsed;
}
