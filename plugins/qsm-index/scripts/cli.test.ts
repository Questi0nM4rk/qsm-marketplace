// The one binary through its real surface: argv, stdout, stderr, exit.
// Nothing here indexes a tree; every call stops at the parser, at a path
// that is not there, or at a missing prerequisite, except the MCP server,
// which starts, lists its tools, and stops.
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { initialize, spawnServer } from "../../../lib/mcp-stdio.ts";
import { removeSandboxes, sandbox } from "../lib/test-repo.ts";

const PLUGIN = resolve(import.meta.dir, "..");
const CLI = join(PLUGIN, "scripts", "cli.ts");
/** Only the runtime itself: the binary is not on it, nor are the externals. */
const BARE_PATH = dirname(process.execPath);

afterEach(removeSandboxes);

function run(entry: string, argv: readonly string[], env: Record<string, string> = {}) {
  const home = sandbox("qsm-index-cli-");
  const r = spawnSync("bun", [entry, ...argv], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      HOME: home,
      XDG_CONFIG_HOME: join(home, "c"),
      ...env,
    },
  });
  return { exit: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("qsm-index", () => {
  test("--help lists every verb, mcp included", () => {
    const r = run(CLI, ["--help"]);
    expect(r.exit).toBe(0);
    expect(r.stdout).toContain("  build ");
    expect(r.stdout).toContain("  doctor");
    expect(r.stdout).toContain("  mcp serve");
  });

  test("build with no path names the missing argument, exit 2", () => {
    const r = run(CLI, ["build"]);
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("missing required argument path");
  });

  test("an unknown flag is a usage error, exit 2", () => {
    const r = run(CLI, ["build", ".", "--nope"]);
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("unknown flag --nope");
  });

  test("the build verb rejects the out flag", () => {
    const tree = mkdtempSync(join(tmpdir(), "qsm-index-out-"));
    const out = join(tree, "chosen");
    try {
      const r = run(CLI, ["build", tree, "--out", out], { PATH: BARE_PATH });
      expect(r.exit).toBe(2);
      expect(r.stderr).toContain("unknown flag --out");
      expect(existsSync(out)).toBe(false);
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  test("the build verb rejects the dependency flags", () => {
    for (const flag of ["--source", "--resolved-version", "--resolvedVersion"]) {
      const r = run(CLI, ["build", "/nonexistent/tree", flag, "x"], { PATH: BARE_PATH });
      expect(r.exit).toBe(2);
      expect(r.stderr).toContain(`unknown flag ${flag}`);
    }
  });

  test("a path that is not there is missing, exit 4", () => {
    const r = run(CLI, ["build", "/nonexistent/tree", "--json"]);
    expect(r.exit).toBe(4);
    const envelope = JSON.parse(r.stdout);
    expect(envelope).toMatchObject({ code: "missing", exit: 4 });
  });

  test("doctor with the binary not on PATH is missing, exit 4", () => {
    const r = run(CLI, ["doctor", "--json"], { PATH: BARE_PATH });
    expect(r.exit).toBe(4);
    const envelope = JSON.parse(r.stdout);
    expect(envelope.code).toBe("missing");
    expect(envelope.data.healthy).toBe(false);
    expect(envelope.data.required).toHaveLength(2);
  });
});

describe("A cloned repository is queried exactly like the agent's own", () => {
  test("a path inside a repository resolves to the repository's top level", () => {
    const root = mkdtempSync(join(tmpdir(), "qsm-index-top-"));
    try {
      const repo = join(root, "repo");
      const sub = join(repo, "src", "deep");
      mkdirSync(sub, { recursive: true });
      expect(spawnSync("git", ["init", "-q", repo]).status).toBe(0);
      // A fake semble that prints the tree it was asked to search.
      const bin = join(root, "bin");
      mkdirSync(bin);
      writeFileSync(
        join(bin, "semble"),
        '#!/bin/sh\nfor last; do :; done\necho "searched $last"\n',
      );
      chmodSync(join(bin, "semble"), 0o755);

      const r = run(CLI, ["search", sub, "parser"], { PATH: `${bin}:${process.env.PATH ?? ""}` });
      expect(r.stderr).toBe("");
      expect(r.exit).toBe(0);
      expect(r.stdout.trim()).toBe(`searched ${repo}`);

      const s = run(CLI, ["status", sub], { QSM_INDEX_CACHE_DIR: join(root, "cache") });
      expect(s.exit).toBe(0);
      expect(s.stdout).toContain(`index of ${repo}: absent`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("qsm-index mcp", () => {
  test("mcp --help lists the serve verb", () => {
    const r = run(CLI, ["mcp", "--help"]);
    expect(r.exit).toBe(0);
    expect(r.stdout).toContain("  serve");
  });

  test("an unknown verb under the group is a usage error, exit 2", () => {
    const r = run(CLI, ["mcp", "start"]);
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("unknown verb mcp start");
  });

  test("mcp serve dispatches to the server and exits clean when stdin closes", () => {
    const r = spawnSync("bun", [CLI, "mcp", "serve"], {
      encoding: "utf8",
      input: "",
      env: { PATH: process.env.PATH ?? "" },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });
});

describe("qsm-index mcp serve", () => {
  test("a client lists the six tools, and the server exits 0 when stdin closes", async () => {
    const home = mkdtempSync(join(tmpdir(), "qsm-index-mcp-"));
    const server = spawnServer(["bun", CLI, "mcp", "serve"], {
      env: { PATH: process.env.PATH ?? "", HOME: home, XDG_CONFIG_HOME: join(home, "c") },
    });
    try {
      await server.request(initialize(1));
      server.notify({ jsonrpc: "2.0", method: "notifications/initialized" });
      const listed = await server.request({ jsonrpc: "2.0", id: 2, method: "tools/list" });
      const tools = (listed.result as { tools: { name: string }[] }).tools.map((t) => t.name);
      expect([...tools].sort((a, b) => a.localeCompare(b))).toEqual([
        "context",
        "impact",
        "reindex",
        "search",
        "status",
        "structure",
      ]);

      server.closeStdin();
      expect(await server.exited).toBe(0);
      expect(await server.restOfStdout()).toBe("");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("qsm-index auto", () => {
  test("auto answers its decision in the envelope's data, exit 0", () => {
    const dir = sandbox("qsm-index-cli-auto-");
    const r = run(CLI, ["auto", dir, "--json"]);
    expect(r.exit).toBe(0);
    expect(JSON.parse(r.stdout).data).toEqual({
      answer: "not-indexable",
      reason: `${dir} is not inside a git repository`,
    });
  });

  test("auto takes only yes or no as consent, exit 2", () => {
    const r = run(CLI, ["auto", "/tmp", "--consent", "maybe"]);
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("must be one of yes, no");
  });
});
