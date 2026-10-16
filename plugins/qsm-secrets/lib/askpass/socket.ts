// The one-shot reply socket: a 0600 socket in a 0700 directory named by a random nonce, under the
// runtime directory. The binary listens, the pane writes one JSON line, the first valid line is the
// answer, and the directory is gone when the call ends.

import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, rmdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { listen } from "bun";
import { isRecord } from "../../../../lib/outcome.ts";
import type { Env } from "../../../../lib/paths.ts";
import { fail } from "../errors.ts";
import type { Action, Reply } from "./types.ts";

const ACTIONS: ReadonlySet<unknown> = new Set<Action>(["allow", "deny", "cancel"]);

const isAction = (value: unknown): value is Action => ACTIONS.has(value);
const MAX_LINE = 64 * 1024;

export interface ReplySocket {
  readonly path: string;
  readonly nonce: string;
  /** the first valid reply, or null once the time is up */
  wait: (timeoutMs: number) => Promise<Reply | null>;
  /** stops listening and removes the directory; safe to call twice */
  close: () => void;
}

/** A line as a reply, or null: wrong shape, wrong nonce, or an action the pane never sends. */
export function parseReply(line: string, nonce: string): Reply | null {
  try {
    const body: unknown = JSON.parse(line);
    if (!isRecord(body) || body.nonce !== nonce || !isAction(body.action)) {
      return null;
    }
    const value = typeof body.value === "string" ? body.value : "";
    return { nonce, action: body.action, value };
  } catch {
    return null;
  }
}

export function openReplySocket(env: Env): ReplySocket {
  const runtime = env.XDG_RUNTIME_DIR;
  if (runtime === undefined || runtime === "") {
    fail(
      "XDG_RUNTIME_DIR is not set, so there is no private place for the reply socket",
      "run it from a login session",
      "missing",
    );
  }
  const nonce = randomBytes(16).toString("hex");
  const dir = join(runtime, "qsm-askpass", nonce);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const path = join(dir, "reply.sock");

  const { promise: answer, resolve: settle } = Promise.withResolvers<Reply | null>();
  const buffers = new WeakMap<object, string>();
  const listener = listen({
    unix: path,
    socket: {
      data(socket, chunk) {
        const text = (buffers.get(socket) ?? "") + chunk.toString("utf8");
        const end = text.indexOf("\n");
        if (end === -1 && text.length <= MAX_LINE) {
          buffers.set(socket, text);
          return;
        }
        const reply = parseReply(end === -1 ? "" : text.slice(0, end), nonce);
        socket.end();
        if (reply !== null) {
          settle(reply);
        }
      },
    },
  });
  chmodSync(path, 0o600);

  let closed = false;
  return {
    path,
    nonce,
    wait: async (timeoutMs) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          resolve(null);
        }, timeoutMs);
      });
      try {
        return await Promise.race([answer, late]);
      } finally {
        clearTimeout(timer);
      }
    },
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      listener.stop(true);
      rmSync(dir, { recursive: true, force: true });
      try {
        rmdirSync(dirname(dir));
      } catch {
        // another call's directory is still in there
      }
    },
  };
}
