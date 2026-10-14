// qsm.json arrives through a JSON import, whose literal types are widened (`"number"` becomes
// `string`), so it is not assignable to QsmManifest. The guard checks the shape the CLI base reads.

import type { CommandArg, CommandDecl, QsmManifest } from "../../../lib/qsm-manifest.ts";
import { arrayOf, type Guard, isRecord, isString, objectOf, orAbsent } from "./shape.ts";

const isTrue: Guard<true> = (value): value is true => value === true;
const isArgType: Guard<CommandArg["type"]> = (value): value is CommandArg["type"] =>
  value === "string" || value === "number" || value === "boolean";

const isArg = objectOf<CommandArg>({
  name: isString,
  type: isArgType,
  positional: orAbsent(isTrue),
  required: orAbsent(isTrue),
  repeatable: orAbsent(isTrue),
  choices: orAbsent(arrayOf(isString)),
  description: isString,
});

const isCommand = objectOf<CommandDecl>({
  description: isString,
  args: orAbsent(arrayOf(isArg)),
  passthrough: orAbsent(isTrue),
  noNoun: orAbsent(isTrue),
});

function recordOf<T>(inner: Guard<T>): Guard<Readonly<Record<string, T>>> {
  return (value): value is Readonly<Record<string, T>> =>
    isRecord(value) && Object.values(value).every((item) => inner(item));
}

export const isQsmManifest = objectOf<QsmManifest>({
  name: orAbsent(isString),
  qsm: objectOf<QsmManifest["qsm"]>({
    bin: orAbsent(recordOf(isString)),
    noun: orAbsent(isString),
    commands: recordOf(isCommand),
  }),
});
