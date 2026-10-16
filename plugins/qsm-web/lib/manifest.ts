// The shapes qsm-web reads from JSON it does not write itself, each checked where it comes in.
import { z } from "zod";
import type { ProjectPackage } from "./opensrc-core.ts";

const PACKAGE = z.object({
  dependencies: z.record(z.string(), z.string()).exactOptional(),
  devDependencies: z.record(z.string(), z.string()).exactOptional(),
});

/** The dependency declarations of a package.json; anything else in it is dropped. */
export function parsePackage(raw: unknown): ProjectPackage {
  return PACKAGE.parse(raw);
}
