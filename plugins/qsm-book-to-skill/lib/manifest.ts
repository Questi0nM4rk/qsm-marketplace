// qsm.json as the JSON import types it (`type` is a plain string), checked into the manifest type.

import { z } from "zod";

const command = z.object({
  description: z.string(),
  args: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(["string", "number", "boolean"]),
        positional: z.literal(true).exactOptional(),
        required: z.literal(true).exactOptional(),
        repeatable: z.literal(true).exactOptional(),
        choices: z.array(z.string()).exactOptional(),
        description: z.string(),
      }),
    )
    .exactOptional(),
  passthrough: z.literal(true).exactOptional(),
  noNoun: z.literal(true).exactOptional(),
});

export const manifestSchema = z.object({
  name: z.string().exactOptional(),
  qsm: z.object({
    bin: z.record(z.string(), z.string()).exactOptional(),
    noun: z.string().exactOptional(),
    commands: z.record(z.string(), command),
  }),
});
