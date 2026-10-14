// A real MCP client talking to `buildServer()` over an in-memory transport:
// the tools it advertises, the schema each one asks for, the error results a
// bad or slow call answers, and the CLI giving the same answer. The lookups'
// own behaviour is covered in tools.test.ts; this file proves the wiring a
// session sees.

import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { which } from "bun";
import { parseManifest } from "../../../lib/qsm-manifest.ts";
import manifest from "../qsm.json" with { type: "json" };
import { GRAPH_DIR, GRAPH_FILE } from "./build.ts";
import { buildServer } from "./mcp.ts";
import type { Env } from "./paths.ts";
import { type Runner, spawnRunner, timedRunner } from "./run.ts";
import { removeSandboxes, repoWithCache, sandbox } from "./test-repo.ts";

setDefaultTimeout(20_000);

afterEach(removeSandboxes);

async function connected(run: Runner = spawnRunner, env: Env = process.env): Promise<Client> {
  const client = new Client({ name: "test-client", version: "0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    client.connect(clientTransport),
    buildServer(run, env).connect(serverTransport),
  ]);
  return client;
}

/** The text of the first content part of a tool result; "" when there is none. */
function textOf(result: unknown): string {
  const content: unknown =
    typeof result === "object" && result !== null ? Reflect.get(result, "content") : [];
  const first: unknown = Array.isArray(content) ? content[0] : undefined;
  const text: unknown =
    typeof first === "object" && first !== null ? Reflect.get(first, "text") : undefined;
  return typeof text === "string" ? text : "";
}

/** A PATH holding git and the named fakes, and nothing else the tools could reach. */
function fakePath(root: string, fakes: Readonly<Record<string, string>>): string {
  const bin = join(root, "bin");
  mkdirSync(bin);
  symlinkSync(which("git") ?? "git", join(bin, "git"));
  for (const [name, body] of Object.entries(fakes)) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  return bin;
}

describe("the server lists its tools", () => {
  test("the server lists exactly the six tools", async () => {
    const listed = await (await connected()).listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
      "context",
      "impact",
      "reindex",
      "search",
      "status",
      "structure",
    ]);
  });

  test("each tool asks for the arguments the spec names", async () => {
    const listed = await (await connected()).listTools();
    const schemas = new Map(listed.tools.map((tool) => [tool.name, tool.inputSchema]));

    const search = schemas.get("search");
    expect(Object.keys(search?.properties ?? {}).sort()).toEqual(["path", "query", "top_k"]);
    expect(search?.required).toEqual(["path", "query"]);

    const structure = schemas.get("structure");
    expect(Object.keys(structure?.properties ?? {}).sort()).toEqual(["node", "op", "repo", "to"]);
    expect(structure?.required).toEqual(["repo", "op", "node"]);

    for (const [name, args] of [
      ["reindex", ["path", "ifIndexed"]],
      ["status", ["path"]],
    ] as const) {
      expect(Object.keys(schemas.get(name)?.properties ?? {})).toEqual([...args]);
      expect(schemas.get(name)?.required).toEqual(["path"]);
    }
  });
});

describe("The CLI and the MCP server are two interfaces over one library", () => {
  test("every MCP tool has a CLI verb with the same arguments", async () => {
    const { commands } = parseManifest(manifest).qsm;
    const listed = await (await connected()).listTools();
    for (const tool of listed.tools) {
      const verb = commands[`qsm-index ${tool.name}`];
      expect(verb).toBeDefined();
      const cliArgs = (verb?.args ?? []).map((arg) => arg.name).sort();
      expect(Object.keys(tool.inputSchema.properties ?? {}).sort()).toEqual(cliArgs);
    }
  });

  test("the CLI status verb and the MCP status tool give the same answer", async () => {
    const { repo, cache } = repoWithCache("qsm-index-parity-");
    const env = { ...process.env, QSM_INDEX_CACHE_DIR: cache };
    const argv = [resolve(import.meta.dir, "../scripts/cli.ts"), "status", repo];
    const cli = spawnSync("bun", argv, { encoding: "utf8", env });
    expect(cli.status).toBe(0);
    expect(cli.stdout).toContain(`index of ${repo}: absent`);

    const mcp = await (
      await connected(spawnRunner, env)
    ).callTool({
      name: "status",
      arguments: { path: repo },
    });
    expect(textOf(mcp)).toBe(cli.stdout.trim());
  });
});

describe("The MCP server registers six tools that never block", () => {
  test("a command that outlives the call limit answers an error result", async () => {
    const { root, repo, cache } = repoWithCache("qsm-index-slow-");
    const env = {
      PATH: fakePath(root, { semble: `exec ${which("sleep")} 5` }),
      QSM_INDEX_CACHE_DIR: cache,
    };
    const client = await connected(timedRunner(300, env), env);

    const started = Date.now();
    const slow = await client.callTool({ name: "search", arguments: { path: repo, query: "q" } });
    expect(Date.now() - started).toBeLessThan(4000);
    expect(slow.isError).toBe(true);
    expect(textOf(slow)).toBe("semble ran past the 300 ms call limit and was stopped");

    const later = await client.callTool({ name: "status", arguments: { path: repo } });
    expect(later.isError).toBeUndefined();
    expect(textOf(later)).toContain(`index of ${repo}: absent`);
  });

  test("a missing backing command answers an error result and the server stays up", async () => {
    const { root, repo, cache } = repoWithCache("qsm-index-missing-");
    mkdirSync(join(repo, GRAPH_DIR));
    writeFileSync(join(repo, GRAPH_DIR, GRAPH_FILE), "{}");
    const env = { PATH: fakePath(root, {}), QSM_INDEX_CACHE_DIR: cache };
    const client = await connected(timedRunner(10_000, env), env);

    const missing = await client.callTool({
      name: "structure",
      arguments: { repo, op: "explain", node: "a.ts" },
    });
    expect(missing.isError).toBe(true);
    expect(textOf(missing)).toContain("graphify is not available");

    const later = await client.callTool({ name: "status", arguments: { path: repo } });
    expect(later.isError).toBeUndefined();
    expect(textOf(later)).toContain(`index of ${repo}: present`);
  });
});

describe("A bad path answers an error result", () => {
  test("Path is not absolute or does not exist", async () => {
    // Its own PATH and cache: a structure call on an unindexed repository starts a build.
    const root = sandbox("qsm-index-server-");
    const env = { PATH: fakePath(root, {}), QSM_INDEX_CACHE_DIR: join(root, "cache") };
    const client = await connected(timedRunner(10_000, env), env);

    const bad = await client.callTool({
      name: "search",
      arguments: { path: "relative/tree", query: "anything" },
    });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toContain("absolute");

    const repo = sandbox("qsm-index-server-");
    expect(spawnSync("git", ["init", "-q", repo]).status).toBe(0);
    const after = await client.callTool({
      name: "structure",
      arguments: { repo, op: "explain", node: "a.ts" },
    });
    expect(textOf(after)).toContain("no structural index");
  });
});
