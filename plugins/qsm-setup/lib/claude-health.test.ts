// Doctor checks the Claude Code installation itself, over a sandbox home and
// project: which, the version, and the release lookup are fakes, so nothing
// touches the real home or the network.
import { describe, expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { type Channel, type ClaudeProbes, claudeChecks, type Lookup } from "./claude-health.ts";
import type { Check } from "./doctor.ts";
import { jsonErrorAt } from "./json-position.ts";

interface World {
  readonly home: string;
  readonly cwd: string;
  readonly write: (path: string, content: string) => string;
  readonly nativeLauncher: () => string;
}

function world(): World {
  const root = sandboxDir("qsm-claude-health-");
  const home = join(root, "home");
  const cwd = join(root, "project");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  const write = (path: string, content: string): string => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    return path;
  };
  return {
    home,
    cwd,
    write,
    nativeLauncher: () => {
      const target = write(join(home, ".local", "share", "claude", "versions", "2.1.0"), "bin");
      const launcher = join(home, ".local", "bin", "claude");
      mkdirSync(dirname(launcher), { recursive: true });
      symlinkSync(target, launcher);
      return launcher;
    },
  };
}

interface Fakes {
  readonly env?: Record<string, string>;
  readonly which?: readonly string[];
  readonly version?: string | null;
  readonly lookup?: Lookup;
}

function probes(w: World, f: Fakes = {}): ClaudeProbes & { lookups: Channel[] } {
  const lookups: Channel[] = [];
  return {
    env: { HOME: w.home, PATH: join(w.home, ".local", "bin"), ...f.env },
    cwd: w.cwd,
    whichAll: () => f.which ?? [],
    version: () => (Object.hasOwn(f, "version") ? (f.version ?? null) : "2.1.0 (Claude Code)"),
    latest: (channel) => {
      lookups.push(channel);
      return Promise.resolve(f.lookup ?? { ok: true, version: "2.1.0" });
    },
    lookups,
  };
}

function named(checks: readonly Check[], name: string): Check[] {
  return checks.filter((c) => c.name === name);
}

describe("doctor's Claude group: config files", () => {
  test("A settings file stopped parsing", async () => {
    const w = world();
    const file = w.write(
      join(w.home, ".claude", "settings.json"),
      '{\n  "env": { "TOKEN": "sk-secret-value" },\n  "model": opus\n}\n',
    );
    const checks = await claudeChecks(probes(w));
    const [config] = named(checks, "claude config");
    expect(config?.status).toBe("FAIL");
    expect(config?.detail).toContain(file);
    expect(config?.detail).toContain("line 3, column 12");
    for (const c of checks) {
      expect(`${c.detail}${c.output}`).not.toContain("sk-secret-value");
      expect(c.detail).not.toContain("opus");
    }
  });
  test("project settings, settings.local, .mcp.json and .claude.json are each checked", async () => {
    const w = world();
    w.write(join(w.cwd, ".claude", "settings.json"), "{}");
    const local = w.write(join(w.cwd, ".claude", "settings.local.json"), '{"a": 1,}');
    const mcp = w.write(join(w.cwd, ".mcp.json"), '{"mcpServers": {');
    w.write(join(w.home, ".claude.json"), "{}");
    const config = named(await claudeChecks(probes(w)), "claude config");
    expect(config.map((c) => c.status)).toEqual(["FAIL", "FAIL"]);
    expect(config[0]?.detail).toContain(`${local} does not parse: trailing comma at line 1`);
    expect(config[1]?.detail).toContain(`${mcp} does not parse: unexpected end of file`);
  });
  test("CLAUDE_CONFIG_DIR moves settings, agents, and .claude.json", async () => {
    const w = world();
    const dir = join(w.home, "alt");
    const file = w.write(join(dir, "settings.json"), "{");
    w.write(join(w.home, ".claude", "settings.json"), "{");
    const config = named(
      await claudeChecks(probes(w, { env: { CLAUDE_CONFIG_DIR: dir } })),
      "claude config",
    );
    expect(config).toHaveLength(1);
    expect(config[0]?.detail).toContain(file);
  });
});

describe("doctor's Claude group: agents and skills", () => {
  test("Two agents with one name", async () => {
    const w = world();
    const agents = join(w.home, ".claude", "agents");
    w.write(join(agents, "a.md"), "---\nname: reviewer\ndescription: one\n---\nbody\n");
    w.write(join(agents, "b.md"), "---\nname: reviewer\ndescription: two\n---\nbody\n");
    const [agent] = named(await claudeChecks(probes(w)), "claude agents");
    expect(agent?.status).toBe("FAIL");
    expect(agent?.detail).toContain("a.md and b.md both declare name reviewer");
    expect(agent?.detail).toContain("only one of them loads");
  });
  test("an agent with a name and no description FAILs; project agents are read recursively", async () => {
    const w = world();
    const file = w.write(
      join(w.cwd, ".claude", "agents", "team", "x.md"),
      "---\nname: helper\n---\nbody\n",
    );
    const [agent] = named(await claudeChecks(probes(w)), "claude agents");
    expect(agent?.status).toBe("FAIL");
    expect(agent?.detail).toContain(`${file}: agent helper has no description`);
  });
  test("a skill whose frontmatter does not parse FAILs naming the file, never its content", async () => {
    const w = world();
    const file = w.write(
      join(w.home, ".claude", "skills", "s", "SKILL.md"),
      "---\nname: s\ndescription: [unclosed secret-words\n---\nbody\n",
    );
    w.write(join(w.cwd, ".claude", "skills", "ok", "SKILL.md"), "---\nname: ok\n---\n");
    const [skill] = named(await claudeChecks(probes(w)), "claude skills");
    expect(skill?.status).toBe("FAIL");
    expect(skill?.detail).toContain(`${file}: frontmatter does not parse`);
    expect(skill?.detail).not.toContain("secret-words");
  });
});

describe("doctor's Claude group: installs", () => {
  test("a native launcher, an npm install, and a leftover local dir FAIL naming each removal", async () => {
    const w = world();
    const launcher = w.nativeLauncher();
    const npm = w.write(join(w.home, "npm", "node_modules", "x", "cli.js"), "");
    mkdirSync(join(w.home, ".claude", "local"), { recursive: true });
    const [installs] = named(
      await claudeChecks(probes(w, { which: [launcher, npm] })),
      "claude installs",
    );
    expect(installs?.status).toBe("FAIL");
    expect(installs?.detail).toContain("3 installs");
    expect(installs?.detail).toContain("running: native");
    expect(installs?.detail).toContain("npm uninstall -g @anthropic-ai/claude-code");
    expect(installs?.detail).toContain(`rm -rf ${join(w.home, ".claude", "local")}`);
  });
  test("one install disagreeing with installMethod FAILs naming the edit", async () => {
    const w = world();
    const launcher = w.nativeLauncher();
    w.write(join(w.home, ".claude.json"), '{"installMethod": "global"}');
    const [installs] = named(
      await claudeChecks(probes(w, { which: [launcher] })),
      "claude installs",
    );
    expect(installs?.status).toBe("FAIL");
    expect(installs?.detail).toContain('set "installMethod": "native"');
  });
  test("one native install matching installMethod passes", async () => {
    const w = world();
    const launcher = w.nativeLauncher();
    w.write(join(w.home, ".claude.json"), '{"installMethod": "native"}');
    const [installs] = named(
      await claudeChecks(probes(w, { which: [launcher] })),
      "claude installs",
    );
    expect(installs?.status).toBe("PASS");
  });
});

describe("doctor's Claude group: PATH and a clean machine", () => {
  test("the native launcher's directory missing from PATH FAILs naming the PATH line", async () => {
    const w = world();
    w.nativeLauncher();
    const [path] = named(
      await claudeChecks(probes(w, { env: { PATH: "/usr/bin" } })),
      "claude path",
    );
    expect(path?.status).toBe("FAIL");
    expect(path?.detail).toContain(`export PATH="${join(w.home, ".local", "bin")}:$PATH"`);
  });
  test("a clean machine passes every Claude check with the lookup at latest", async () => {
    const w = world();
    const launcher = w.nativeLauncher();
    const checks = await claudeChecks(probes(w, { which: [launcher] }));
    expect(checks.filter((c) => c.status === "FAIL" || c.status === "WARN")).toEqual([]);
  });
});

describe("doctor's Claude group: version", () => {
  test("No network lookups allowed", async () => {
    const w = world();
    const launcher = w.nativeLauncher();
    const p = probes(w, {
      which: [launcher],
      env: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" },
    });
    const [version] = named(await claudeChecks(p), "claude version");
    expect(version?.status).toBe("SKIP");
    expect(version?.detail).toContain("installed 2.1.0");
    expect(p.lookups).toEqual([]);
  });
  test("a native install behind its channel FAILs naming claude update; the stable channel is honoured", async () => {
    const w = world();
    const launcher = w.nativeLauncher();
    w.write(join(w.home, ".claude", "settings.json"), '{"autoUpdatesChannel": "stable"}');
    const p = probes(w, { which: [launcher], lookup: { ok: true, version: "2.1.10\n" } });
    const [version] = named(await claudeChecks(p), "claude version");
    expect(version).toMatchObject({ status: "FAIL" });
    expect(version?.detail).toContain("behind stable 2.1.10; run: claude update");
    expect(p.lookups).toEqual(["stable"]);
  });
  test("an unknown channel value falls back to latest, and a failed lookup is one WARN", async () => {
    const w = world();
    const launcher = w.nativeLauncher();
    w.write(join(w.home, ".claude", "settings.json"), '{"autoUpdatesChannel": "Stable"}');
    const p = probes(w, { which: [launcher], lookup: { ok: false, reason: "timed out" } });
    const [version] = named(await claudeChecks(p), "claude version");
    expect(version).toMatchObject({ status: "WARN" });
    expect(version?.detail).toContain("latest lookup failed: timed out");
    expect(p.lookups).toEqual(["latest"]);
  });
  test("a non-native install skips the lookup", async () => {
    const w = world();
    const npm = w.write(join(w.home, "npm", "node_modules", "x", "cli.js"), "");
    const p = probes(w, { which: [npm] });
    const [version] = named(await claudeChecks(p), "claude version");
    expect(version?.status).toBe("SKIP");
    expect(p.lookups).toEqual([]);
  });
});

describe("jsonErrorAt names a position and a fixed reason", () => {
  test("valid JSON is null", () => {
    expect(jsonErrorAt('{"a": [1, 2.5e3, "x\\n", true, null]}')).toBeNull();
  });
  test("a missing comma points at the offending character", () => {
    expect(jsonErrorAt('{\n  "a": 1\n  "b": 2\n}')).toEqual({
      line: 3,
      column: 3,
      reason: 'expected ","',
    });
  });
  test("a trailing comma, a bad escape, and trailing content", () => {
    expect(jsonErrorAt("[1,]")?.reason).toBe("trailing comma");
    expect(jsonErrorAt('"\\q"')?.reason).toBe("invalid escape");
    expect(jsonErrorAt("{} x")?.reason).toBe("unexpected content after the value");
  });
});
