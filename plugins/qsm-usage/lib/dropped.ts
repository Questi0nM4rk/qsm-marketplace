// The findings a person dropped in a review, so a later review does not offer them again.
// One JSON file under the machine state dir; a finding is keyed `<topic>:<target>`, which stays
// the same across reviews where a finding id does not.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Env, stateDir } from "../../../lib/paths.ts";

export interface Dropped {
  readonly key: string;
  readonly at: string;
}

export function droppedPath(env: Env): string {
  return join(stateDir(env), "usage", "dropped.json");
}

/** The dropped findings; a file nothing wrote yet is an empty list, a file that is not a list of
 * records is an error, never an empty list. */
export function readDropped(path: string): Dropped[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const parsed: unknown = JSON.parse(text);
  const valid =
    Array.isArray(parsed) &&
    parsed.every((r) => typeof r?.key === "string" && typeof r?.at === "string");
  if (!valid) {
    throw new Error(`${path} is not a list of { key, at } records`);
  }
  return parsed as Dropped[];
}

/** Records the key once; dropping a dropped key changes nothing. */
export function addDropped(path: string, key: string, at: Date): Dropped[] {
  const list = readDropped(path);
  if (list.some((d) => d.key === key)) {
    return list;
  }
  const next = [...list, { key, at: at.toISOString() }];
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}
