// The stdio lifecycle every qsm MCP server shares, and the client side a plugin's test uses to
// prove it through its real binary.

import { spawn } from "node:child_process";
import { once } from "node:events";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

const STOP_SIGNALS = ["SIGTERM", "SIGINT"] as const;

/** Serves `server` on stdin/stdout until stdin closes, the transport closes,
 * or SIGTERM or SIGINT arrives; then closes the server and resolves. */
export async function serveStdio(server: McpServer): Promise<void> {
  const { promise: released, resolve: release } = Promise.withResolvers<void>();
  const onRelease = () => {
    release();
  };
  for (const signal of STOP_SIGNALS) {
    process.once(signal, onRelease);
  }
  process.stdin.once("end", onRelease);
  server.server.onclose = onRelease;
  try {
    await server.connect(new StdioServerTransport());
    await released;
  } finally {
    for (const signal of STOP_SIGNALS) {
      process.off(signal, onRelease);
    }
    process.stdin.off("end", onRelease);
    await server.close();
  }
}

interface Message {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  [key: string]: unknown;
}

function isMessage(value: unknown): value is Message {
  return (
    typeof value === "object" &&
    value !== null &&
    "jsonrpc" in value &&
    value.jsonrpc === "2.0" &&
    (!("id" in value) || typeof value.id === "number")
  );
}

/** A running server process, spoken to one JSON-RPC line at a time. */
export interface ServerProcess {
  /** Writes `message` and resolves with the reply that carries its id. */
  request: (message: Message) => Promise<Message>;
  notify: (message: Message) => void;
  closeStdin: () => void;
  kill: (signal: NodeJS.Signals) => void;
  /** The exit code; a signal death counts as a failure, -1. */
  readonly exited: Promise<number>;
  /** stdout after the last reply read, once the process has exited. */
  restOfStdout: () => Promise<string>;
}

/** The `initialize` request a client opens every session with. */
export function initialize(id: number): Message {
  return {
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "qsm-probe", version: "0" },
    },
  };
}

/** Spawns `argv` as a stdio MCP server. */
export function spawnServer(
  argv: readonly string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string } = {},
): ServerProcess {
  const [command = "", ...args] = argv;
  const child = spawn(command, args, {
    stdio: ["pipe", "pipe", "ignore"],
    env: options.env ?? process.env,
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  });
  child.stdout.setEncoding("utf8");
  let buffered = "";
  const waiting: (() => void)[] = [];
  child.stdout.on("data", (chunk: string) => {
    buffered += chunk;
    for (const wake of waiting.splice(0)) {
      wake();
    }
  });
  const exited = once(child, "close").then(([code]) => (typeof code === "number" ? code : -1));

  async function nextLine(): Promise<string> {
    for (;;) {
      const newline = buffered.indexOf("\n");
      if (newline >= 0) {
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        return line;
      }
      if (child.stdout.readableEnded) {
        throw new Error(`server closed stdout before a full line: ${buffered}`);
      }
      await Promise.race([
        new Promise<void>((wake) => {
          waiting.push(wake);
        }),
        exited,
      ]);
    }
  }

  const write = (message: Message) => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };

  return {
    async request(message) {
      write(message);
      for (;;) {
        const reply: unknown = JSON.parse(await nextLine());
        if (!isMessage(reply)) {
          throw new Error(
            `server sent a line that is not a JSON-RPC message: ${JSON.stringify(reply)}`,
          );
        }
        if (reply.id === message.id) {
          return reply;
        }
      }
    },
    notify: write,
    closeStdin: () => {
      child.stdin.end();
    },
    kill: (signal) => {
      child.kill(signal);
    },
    exited,
    async restOfStdout() {
      await exited;
      return buffered;
    },
  };
}
