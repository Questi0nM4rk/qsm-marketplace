// The shapes qsm-web reads from JSON it does not write itself, each checked where it comes in.
import { z } from "zod";
import type { QsmManifest } from "../../../lib/qsm-manifest.ts";
import type { ProjectPackage } from "./opensrc-core.ts";

const ARG = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "boolean"]),
  positional: z.literal(true).exactOptional(),
  required: z.literal(true).exactOptional(),
  repeatable: z.literal(true).exactOptional(),
  choices: z.array(z.string()).exactOptional(),
  description: z.string(),
});

const DECL = z.object({
  description: z.string(),
  args: z.array(ARG).exactOptional(),
  passthrough: z.literal(true).exactOptional(),
  noNoun: z.literal(true).exactOptional(),
});

const MANIFEST = z.object({
  name: z.string().exactOptional(),
  qsm: z.object({
    bin: z.record(z.string(), z.string()).exactOptional(),
    noun: z.string().exactOptional(),
    commands: z.record(z.string(), DECL),
  }),
});

/** qsm.json as the argument parser needs it; a declaration of the wrong shape throws. */
export function parseManifest(raw: unknown): QsmManifest {
  return MANIFEST.parse(raw);
}

const PACKAGE = z.object({
  dependencies: z.record(z.string(), z.string()).exactOptional(),
  devDependencies: z.record(z.string(), z.string()).exactOptional(),
});

/** The dependency declarations of a package.json; anything else in it is dropped. */
export function parsePackage(raw: unknown): ProjectPackage {
  return PACKAGE.parse(raw);
}
