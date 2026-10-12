// The stdio MCP server: every tool in tools.ts's `TOOLS`, its input schema read from the qsm.json
// verb of the same name, so the server and the CLI take the same arguments.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CommandArg, QsmManifest } from "../../../lib/qsm-manifest.ts";
import plugin from "../.claude-plugin/plugin.json" with { type: "json" };
import manifestJson from "../qsm.json" with { type: "json" };
import type { Env } from "./paths.ts";
import { type Runner, spawnRunner } from "./run.ts";
import { TOOLS, type ToolOutcome } from "./tools.ts";

const manifest = manifestJson as QsmManifest;

// The SDK's own result type carries an index signature (`_meta` and friends live outside the
// declared fields), so a plain `{content, isError?}` interface is structurally narrower and TS
// rejects it.
interface ToolText {
  readonly [x: string]: unknown;
  readonly content: [{ readonly type: "text"; readonly text: string }];
  readonly isError?: true;
}

/** Every outcome answers as a result, an error one with `isError`. A throw
 * would end the session's server; the spec asks for the cause instead. */
function reply(outcome: ToolOutcome): ToolText {
  if (outcome.ok) {
    return { content: [{ type: "text", text: outcome.text }] };
  }
  return { content: [{ type: "text", text: outcome.text }], isError: true };
}

/** An unexpected throw inside a handler is still an error result: the server
 * stays up for the next call. */
function guarded(run: () => ToolOutcome): ToolText {
  try {
    return reply(run());
  } catch (cause) {
    return reply({ ok: false, text: cause instanceof Error ? cause.message : String(cause) });
  }
}

const BY_TYPE: Readonly<Record<CommandArg["type"], () => z.ZodType>> = {
  string: () => z.string(),
  number: () => z.number(),
  boolean: () => z.boolean(),
};

/** One qsm.json argument as the schema field the client sees. */
function field(arg: CommandArg): z.ZodType {
  const [first, ...rest] = arg.choices ?? [];
  const base = first === undefined ? BY_TYPE[arg.type]() : z.enum([first, ...rest]);
  const described = base.describe(arg.description);
  return arg.required === true ? described : described.optional();
}

const SERVER_NAME = "qsm-index";

/** The tools `TOOLS` names, and nothing else, each calling local commands through `run`. */
export function buildServer(run: Runner = spawnRunner, env: Env = process.env): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: plugin.version });
  for (const [name, tool] of Object.entries(TOOLS)) {
    const verb = manifest.qsm.commands[`${SERVER_NAME} ${name}`];
    if (verb === undefined) {
      throw new Error(`qsm.json has no verb for the tool ${name}`);
    }
    server.registerTool(
      name,
      {
        description: verb.description,
        inputSchema: Object.fromEntries((verb.args ?? []).map((arg) => [arg.name, field(arg)])),
      },
      (args) => guarded(() => tool(args, run, env)),
    );
  }
  return server;
}
