// `qsm-usage drop` and `qsm-usage dropped`: the findings a person dropped, kept so a later review
// does not offer them again.

import type { Handler } from "../../../lib/cli-base.ts";
import { fail, ok } from "../../../lib/outcome.ts";
import { requiredString } from "../lib/args.ts";
import { addDropped, droppedPath, readDropped } from "../lib/dropped.ts";
import { messageOf } from "../lib/formats.ts";

export const drop: Handler = (call) => {
  const key = requiredString(call, "key").trim();
  if (!/^[a-z-]+:.+/.test(key)) {
    return fail("usage", `key "${key}" is not <topic>:<target>`);
  }
  try {
    const list = addDropped(droppedPath(process.env), key, new Date());
    return ok({ key, dropped: list.length }, `dropped ${key}`);
  } catch (error) {
    return fail("failed", messageOf(error));
  }
};

export const dropped: Handler = () => {
  try {
    const list = readDropped(droppedPath(process.env));
    return ok(list, list.map((d) => d.key).join("\n"));
  } catch (error) {
    return fail("failed", messageOf(error));
  }
};
