// The flows qsm-setup promises, run over a sandbox marketplace with fake
// installers: dependency order, collect-all with blocking, the farm's
// completions and pruning, and doctor's orphans and drift.
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fishCompletion, MARKER } from "../../../lib/completions.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { readRecord, writeRecord } from "../../../lib/install-base.ts";
import { buildBins } from "./build-bins.ts";
import { discoverPlugins } from "./discover.ts";
import { doctor } from "./doctor.ts";
import { relink } from "./farm.ts";
import { installOrder, requiredBy } from "./graph.ts";
import { type Runner, runInstallers } from "./run-installers.ts";

interface FakePlugin {
  readonly name: string;
  readonly deps?: readonly string[];
  readonly bins?: Record<string, string>;
  readonly installer?: boolean;
}
function marketplace(root: string, plugins: readonly FakePlugin[]): void {
  for (const p of plugins) {
    const dir = join(root, "plugins", p.name);
    mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(dir, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: p.name, dependencies: p.deps ?? [] }),
    );
    if (p.bins !== undefined) {
      const commands: Record<string, unknown> = {};
      for (const bin of Object.keys(p.bins)) {
        commands[`${bin} run`] = {
          description: `run ${bin}`,
          args: [
            { name: "target", type: "string", positional: true, description: "what" },
            { name: "dryRun", type: "boolean", description: "report only" },
            { name: "root", type: "string", description: "a dir" },
          ],
        };
      }
      writeFileSync(
        join(dir, "qsm.json"),
        JSON.stringify({ name: p.name, qsm: { bin: p.bins, commands } }),
      );
    }
    if (p.installer === true) {
      mkdirSync(join(dir, "scripts"), { recursive: true });
      writeFileSync(join(dir, "scripts", "install.ts"), "// fake\n");
    }
  }
}

describe("install order", () => {
  test("a requirement installs before the plugin that needs it, and a named plugin pulls its requirements", () => {
    const root = sandboxDir("qsm-setup-");
    marketplace(root, [{ name: "b", deps: ["a"] }, { name: "a" }, { name: "c", deps: ["b"] }]);
    const nodes = discoverPlugins(root);
    expect(installOrder(nodes)).toEqual(["a", "b", "c"]);
    expect(installOrder(nodes, ["c"])).toEqual(["a", "b", "c"]);
  });
  test("an unknown plugin name fails before anything runs", () => {
    const root = sandboxDir("qsm-setup-");
    marketplace(root, [{ name: "a" }]);
    expect(() => installOrder(discoverPlugins(root), ["nope"])).toThrow("unknown plugin: nope");
  });
});

describe("installing everything, collect-all", () => {
  test("A named plugin depends on one that fails", () => {
    const root = sandboxDir("qsm-setup-");
    marketplace(root, [
      { name: "a", installer: true },
      { name: "b", deps: ["a"], installer: true },
      { name: "c", installer: true },
    ]);
    const nodes = discoverPlugins(root);
    const ran: string[] = [];
    const run: Runner = (installer) => {
      ran.push(installer);
      return installer.includes("/a/")
        ? {
            code: 1,
            result: { tool: "a", status: "error", detail: "a broke", steps: [] },
            stderr: "",
          }
        : {
            code: 0,
            result: { tool: "x", status: "installed", detail: "fine", steps: [] },
            stderr: "",
          };
    };
    const out = runInstallers(nodes, installOrder(nodes), { dryRun: false, run });
    expect(out.map((o) => `${o.plugin}:${o.status}`)).toEqual([
      "a:error",
      "b:blocked",
      "c:installed",
    ]);
    expect(out[1]?.detail).toBe("requirement a failed");
    expect(ran).toHaveLength(2);
  });
});

describe("what each install line says", () => {
  test("a plugin with no installer answers the line an empty installer answers", () => {
    const root = sandboxDir("qsm-setup-");
    marketplace(root, [{ name: "bare" }]);
    const nodes = discoverPlugins(root);
    const run: Runner = () => {
      throw new Error("nothing to run");
    };
    const out = runInstallers(nodes, ["bare"], { dryRun: false, run });
    expect(out).toEqual([
      { plugin: "bare", status: "already", detail: "nothing to install", steps: [] },
    ]);
  });

  test("an installer that exits 0 without an envelope failed, it did not install", () => {
    const root = sandboxDir("qsm-setup-");
    marketplace(root, [{ name: "mute", installer: true }]);
    const run: Runner = () => ({ code: 0, result: null, stderr: "some noise\n" });
    const [out] = runInstallers(discoverPlugins(root), ["mute"], { dryRun: false, run });
    expect(out).toMatchObject({
      status: "failed",
      detail: "installer exited 0 and printed no envelope; its last stderr line: some noise",
    });
  });

  test("A requirement nobody named", () => {
    const root = sandboxDir("qsm-setup-");
    marketplace(root, [
      { name: "base", installer: true },
      { name: "app", deps: ["base"], installer: true },
    ]);
    const nodes = discoverPlugins(root);
    const run: Runner = () => ({
      code: 0,
      result: { tool: "x", status: "installed", detail: "fine", steps: [] },
      stderr: "",
    });
    const out = runInstallers(nodes, installOrder(nodes, ["app"]), {
      dryRun: false,
      run,
      requiredBy: requiredBy(nodes, installOrder(nodes, ["app"]), ["app"]),
    });
    expect(out.map((o) => `${o.plugin}: ${o.detail}`)).toEqual([
      "base: required by app; fine",
      "app: fine",
    ]);
  });
});

describe("bin farm", () => {
  test("completions are generated from the declared commands, and a dropped bin's completion is pruned", () => {
    const root = sandboxDir("qsm-setup-");
    const home = sandboxDir("qsm-setup-");
    const completionDir = join(home, "fish");
    const binDir = join(home, "bin");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(binDir, "qsm-x"), "bin");
    marketplace(root, [{ name: "x", bins: { "qsm-x": "scripts/cli.ts" }, installer: true }]);
    const nodes = discoverPlugins(root);
    const recordPath = join(home, "bins.json");
    mkdirSync(completionDir, { recursive: true });
    writeFileSync(join(completionDir, "qsm-old.fish"), `# ${MARKER}\ncomplete -c qsm-old -e\n`);
    writeFileSync(join(completionDir, "mine.fish"), "complete -c mine -e\n");

    const checked = relink(nodes, { binDir, completionDir, recordPath, check: true });
    expect(checked.stale).toBe(true);
    expect(checked.wroteCompletions).toEqual(["qsm-x"]);
    expect(checked.prunedCompletions).toEqual(["qsm-old"]);

    const written = relink(nodes, { binDir, completionDir, recordPath, check: false });
    expect(written.missingBins).toEqual([]);
    const content = fishCompletion("qsm-x", nodes[0]?.commands ?? {});
    expect(content).toContain("-a 'run' -d 'run qsm-x'");
    expect(content).toContain("-l dry-run -d");
    expect(content).toContain("-l root -r -d");
    expect(content).not.toContain("target");
    const after = relink(nodes, { binDir, completionDir, recordPath, check: true });
    expect(after.stale).toBe(false);
  });
  test("Checking staleness", () => {
    const root = sandboxDir("qsm-setup-");
    const home = sandboxDir("qsm-setup-");
    marketplace(root, [{ name: "x", bins: { "qsm-x": "scripts/cli.ts" }, installer: true }]);
    const report = relink(discoverPlugins(root), {
      binDir: join(home, "bin"),
      completionDir: join(home, "fish"),
      recordPath: join(home, "bins.json"),
      check: true,
    });
    expect(report.missingBins).toEqual(["qsm-x"]);
    expect(report.stale).toBe(true);
  });
});

describe("build-bins", () => {
  test("A compilable command with no build step", () => {
    const root = sandboxDir("qsm-setup-");
    const home = sandboxDir("qsm-setup-");
    const binDir = join(home, "bin");
    mkdirSync(binDir, { recursive: true });
    marketplace(root, [
      { name: "x", bins: { "qsm-x": "scripts/cli.ts" }, installer: true },
      { name: "y", bins: { "qsm-y": "scripts/cli.ts" } },
    ]);
    const run: Runner = () => {
      writeFileSync(join(binDir, "qsm-x"), "compiled");
      chmodSync(join(binDir, "qsm-x"), 0o755);
      const steps = [{ name: "bin qsm-x", status: "installed" as const, detail: "compiled" }];
      return {
        code: 0,
        result: { tool: "x", status: "installed", detail: "ok", steps },
        stderr: "",
      };
    };
    const recordPath = join(home, "bins.json");
    const out = buildBins(discoverPlugins(root), { binDir, recordPath, run });
    expect(out.map((o) => `${o.bin}:${o.status}`)).toEqual(["qsm-x:built", "qsm-y:failed"]);
    expect(out[1]?.detail).toContain("no scripts/install.ts");
    expect(Object.keys(readRecord(recordPath)?.bins ?? {})).toEqual(["qsm-x"]);
  });
});

describe("doctor", () => {
  test("A mix of pass, fail, and skip", () => {
    const root = sandboxDir("qsm-setup-");
    const home = sandboxDir("qsm-setup-");
    marketplace(root, [
      { name: "pass", bins: { "qsm-pass": "scripts/cli.ts" } },
      { name: "fail", bins: { "qsm-fail": "scripts/cli.ts" } },
      { name: "skip" },
    ]);
    const installedPath = join(home, "installed.json");
    writeFileSync(installedPath, JSON.stringify({ plugins: ["pass", "fail", "skip", "gone"] }));
    const report = doctor(discoverPlugins(root), {
      installedPath,
      recordPath: join(home, "bins.json"),
      binDir: join(home, "bin"),
      only: null,
      run: () => ({ code: 0, result: null, stderr: "" }),
      probe: (shell) =>
        shell.includes("qsm-fail") ? { code: 3, output: "boom" } : { code: 0, output: "" },
    });
    const byName = new Map(report.checks.map((c) => [c.name, c]));
    expect(byName.get("pass")?.status).toBe("PASS");
    expect(byName.get("fail")?.status).toBe("FAIL");
    expect(byName.get("fail")?.detail).toBe("probe exited 3");
    expect(byName.get("skip")?.status).toBe("SKIP");
    expect(byName.get("gone")?.status).toBe("WARN");
    expect(byName.get("gone")?.detail).toBe(
      `orphan: recorded as installed, not in the marketplace; drop "gone" from ${installedPath}`,
    );
    expect(byName.get("binaries")?.status).toBe("SKIP");
    expect([report.pass, report.fail, report.skip]).toEqual([1, 1, 2]);
    expect(report.ok).toBe(false);
  });
  test("An installed binary has drifted", () => {
    const root = sandboxDir("qsm-setup-");
    const home = sandboxDir("qsm-setup-");
    const binDir = join(home, "bin");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(binDir, "qsm-x"), "v2");
    const recordPath = join(home, "bins.json");
    writeRecord(recordPath, { bins: { "qsm-x": { plugin: "x", sha256: "not-the-hash-of-v2" } } });
    const installedPath = join(home, "installed.json");
    writeFileSync(installedPath, JSON.stringify({ plugins: [] }));
    const report = doctor(discoverPlugins(root), {
      installedPath,
      recordPath,
      binDir,
      only: null,
      run: () => ({ code: 0, result: null, stderr: "" }),
      probe: () => ({ code: 0, output: "" }),
    });
    expect(report.checks[0]?.status).toBe("FAIL");
    expect(report.checks[0]?.detail).toContain("qsm-setup build-bins && qsm-setup relink");
  });
});

describe("doctor over PATH", () => {
  test("An old binary shadows a built one", () => {
    const root = sandboxDir("qsm-setup-");
    const home = sandboxDir("qsm-setup-");
    const binDir = join(home, "bin");
    const farm = join(home, "old-farm");
    mkdirSync(binDir, { recursive: true });
    mkdirSync(farm, { recursive: true });
    for (const path of [join(binDir, "qsm-x"), join(farm, "qsm-x"), join(farm, "qsm-old")]) {
      writeFileSync(path, "#!/bin/sh\n");
      chmodSync(path, 0o755);
    }
    symlinkSync("qsm-x", join(binDir, "qsm-x-alias"));
    symlinkSync("qsm-old", join(farm, "qsm-old-alias"));
    const recordPath = join(home, "bins.json");
    const hash = createHash("sha256").update("#!/bin/sh\n").digest("hex");
    writeRecord(recordPath, { bins: { "qsm-x": { plugin: "x", sha256: hash } } });
    const installedPath = join(home, "installed.json");
    writeFileSync(installedPath, JSON.stringify({ plugins: [] }));
    const report = doctor(discoverPlugins(root), {
      installedPath,
      recordPath,
      binDir,
      path: `${farm}:${binDir}`,
      only: null,
      run: () => ({ code: 0, result: null, stderr: "" }),
      probe: () => ({ code: 0, output: "" }),
    });
    const byName = new Map(report.checks.map((c) => [c.name, c]));
    expect(byName.get("path")).toMatchObject({
      status: "FAIL",
      detail: `qsm-x resolves to ${join(farm, "qsm-x")}, not ${join(binDir, "qsm-x")}; remove it or put ${binDir} first on PATH`,
    });
    const stray = byName.get("stray binaries");
    expect(stray?.status).toBe("WARN");
    // a link to a name no plugin declares is still stray; a link to a declared one is not
    expect(stray?.detail).toContain(join(farm, "qsm-old"));
    expect(stray?.detail).toContain(join(farm, "qsm-old-alias"));
    expect(stray?.detail).not.toContain("qsm-x-alias");
  });
});
