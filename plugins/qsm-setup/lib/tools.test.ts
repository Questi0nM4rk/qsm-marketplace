// Tools compares installed qsm binaries against main, over a fake git, a
// fake PATH, and a fake clock: no checkout, no remote, no network.
import { describe, expect, test } from "bun:test";
import type { PluginNode } from "./discover.ts";
import { compareTools, describeTools, type GitResult, type ToolsProbes } from "./tools.ts";

type Commands = Record<string, { description: string }>;

function qsmJson(bin: string, verbs: Record<string, string>): string {
  const commands: Commands = {};
  for (const [verb, description] of Object.entries(verbs)) {
    commands[`${bin} ${verb}`] = { description };
  }
  return JSON.stringify({ qsm: { bin: { [bin]: "scripts/cli.ts" }, commands } });
}

function node(name: string, bin: string, verbs: Record<string, string>): PluginNode {
  const commands: Commands = {};
  for (const [verb, description] of Object.entries(verbs)) {
    commands[`${bin} ${verb}`] = { description };
  }
  return {
    name,
    dir: `/checkout/plugins/${name}`,
    dependencies: [],
    installer: null,
    activation: null,
    bins: { [bin]: "scripts/cli.ts" },
    commands,
    doctor: null,
  };
}

const FETCHED = new Date("2026-09-20T19:08:39.000Z");

function probes(
  main: Record<string, string>,
  installed: readonly string[],
): ToolsProbes & { calls: string[] } {
  const calls: string[] = [];
  const reply = (stdout: string, code = 0): GitResult => ({ code, stdout, stderr: "" });
  return {
    calls,
    git: (args) => {
      const line = args.join(" ");
      calls.push(line);
      if (line.startsWith("ls-tree")) {
        return reply(Object.keys(main).join("\n"));
      }
      if (line.startsWith("show origin/main:")) {
        const file = line.slice("show origin/main:".length);
        return main[file] === undefined ? reply("", 128) : reply(main[file]);
      }
      if (line.startsWith("rev-parse")) {
        return reply("/checkout/.git\n");
      }
      return line.startsWith("fetch") ? reply("") : reply("", 1);
    },
    installed: () => new Set(installed),
    mtime: (path) => (path === "/checkout/.git/FETCH_HEAD" ? FETCHED : null),
  };
}

function ok(r: ReturnType<typeof compareTools>) {
  if (r.kind !== "ok") {
    throw new Error(r.message);
  }
  return r.report;
}

describe("tools compares installed qsm binaries against main", () => {
  test("A binary added on main", () => {
    const p = probes({ "plugins/y/qsm.json": qsmJson("qsm-y", { scan: "scan a thing" }) }, []);
    const report = ok(compareTools([], p, false));
    expect(report.binaries).toEqual([
      {
        bin: "qsm-y",
        plugin: "y",
        installed: false,
        newOnMain: true,
        goneFromMain: false,
        added: [],
        removed: [],
        verbs: [{ verb: "scan", description: "scan a thing" }],
      },
    ]);
    expect(describeTools(report)).toContain("qsm-y (y): not installed, new on main");
  });

  test("A verb added on main", () => {
    const main = { "plugins/x/qsm.json": qsmJson("qsm-x", { run: "run it", tail: "follow" }) };
    const local = [node("x", "qsm-x", { run: "run it", old: "gone soon" })];
    const report = ok(compareTools(local, probes(main, ["qsm-x"]), false));
    const [x] = report.binaries;
    expect(x).toMatchObject({ installed: true, newOnMain: false, goneFromMain: false });
    expect(x?.added).toEqual([{ verb: "tail", description: "follow" }]);
    expect(x?.removed).toEqual(["old"]);
    const lines = describeTools(report);
    expect(lines).toContain("  + tail: follow (added on main)");
    expect(lines).toContain("  - old (removed on main)");
  });

  test("Stale main", () => {
    const p = probes({ "plugins/x/qsm.json": qsmJson("qsm-x", { run: "r" }) }, []);
    const report = ok(compareTools([], p, false));
    expect(report.fetchedAt).toBe(FETCHED.toISOString());
    expect(p.calls.some((c) => c.startsWith("fetch"))).toBe(false);
    expect(describeTools(report)[0]).toBe(
      `origin/main as last fetched: ${FETCHED.toISOString()}; network untouched, --fetch updates it`,
    );
  });
});

describe("tools: fetch, gone from main, and no main", () => {
  test("--fetch fetches origin main before reading it", () => {
    const p = probes({ "plugins/x/qsm.json": qsmJson("qsm-x", { run: "r" }) }, []);
    const report = ok(compareTools([], p, true));
    expect(p.calls[0]).toBe("fetch origin main");
    expect(describeTools(report)[0]).toStartWith("origin/main fetched just now");
  });

  test("a binary on PATH that no plugin on main declares is gone from main", () => {
    const local = [node("z", "qsm-z", { go: "go" })];
    const report = ok(compareTools(local, probes({}, ["qsm-z"]), false));
    expect(report.binaries[0]).toMatchObject({
      bin: "qsm-z",
      plugin: "z",
      installed: true,
      goneFromMain: true,
      verbs: [{ verb: "go", description: "go" }],
    });
  });

  test("no origin/main is missing, naming --fetch", () => {
    const p = probes({}, []);
    const r = compareTools(
      [],
      { ...p, git: () => ({ code: 128, stdout: "", stderr: "bad" }) },
      false,
    );
    expect(r).toMatchObject({ kind: "missing" });
    expect(r.kind !== "ok" && r.message).toContain("qsm-setup tools --fetch");
  });
});
