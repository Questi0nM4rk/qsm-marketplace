// HOOK_KIT_ASKPASS: hook-kit spawns this with an ask request (protocol 2) on stdin and reads an ask
// response from stdout. Allow or deny only; a failure is a non-zero exit, which hook-kit reads as deny.

import { isRecord, ok } from "../../../../../lib/outcome.ts";
import { fail } from "../../errors.ts";
import { reasonOf } from "../answer.ts";
import type { Provider } from "../types.ts";

interface AskRequest {
  readonly id: string;
  readonly toolName: string;
  readonly toolInput: unknown;
  readonly reason: string;
}

function parse(text: string): AskRequest {
  try {
    const body: unknown = JSON.parse(text);
    if (
      isRecord(body) &&
      typeof body.id === "string" &&
      body.id !== "" &&
      typeof body.toolName === "string"
    ) {
      return {
        id: body.id,
        toolName: body.toolName,
        toolInput: body.toolInput,
        reason: typeof body.reason === "string" ? body.reason : "",
      };
    }
  } catch {
    // falls through to the usage error
  }
  return fail(
    "stdin is not an ask request",
    "hook-kit writes one JSON ask request on stdin",
    "usage",
  );
}

/** What the person is asked to allow: the tool and all of its input; the pane scrolls what is long. */
function subjectOf(request: AskRequest): string {
  const input = JSON.stringify(request.toolInput ?? {});
  return `${request.toolName} ${input}`;
}

export const decide: Provider = {
  env: [["HOOK_KIT_ASKPASS", "LINK"]],
  request: (input) => {
    const request = parse(input.stdin());
    return { kind: "decide", prompt: request.reason, subject: subjectOf(request), masked: false };
  },
  finish: (input, reply) => {
    const { id } = parse(input.stdin());
    const allowed = reply.action === "allow";
    const response = {
      id,
      decision: allowed ? "allow" : "deny",
      ...(allowed ? {} : { reason: reasonOf(reply) }),
      by: "qsm-secrets askpass",
      decidedAt: new Date().toISOString(),
    };
    return ok(undefined, JSON.stringify(response));
  },
};
