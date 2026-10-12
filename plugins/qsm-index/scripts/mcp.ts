// The `mcp serve` verb of qsm-index.

import type { Handler } from "../../../lib/cli-base.ts";
import { serveStdio } from "../../../lib/mcp-stdio.ts";
import { ok } from "../../../lib/outcome.ts";
import { buildServer } from "../lib/mcp.ts";

export const handlers: Record<string, Handler> = {
  // The verb holds until the client lets go. Nothing else is written to
  // stdout: that is the protocol's channel.
  "mcp serve": async () => {
    await serveStdio(buildServer());
    return ok();
  },
};
