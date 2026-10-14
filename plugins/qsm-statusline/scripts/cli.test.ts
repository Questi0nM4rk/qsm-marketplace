// The frame itself. The lib tests hold the pieces; these run the entry point
// the harness runs, once per prompt, with a real payload on stdin, because the
// promise the plugin makes is about that process: it prints its rows and exits
// 0, whatever the machine around it is doing.

import { afterEach, describe, expect, test } from "bun:test";
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isRecord } from "../../../lib/outcome.ts";
import { writeCache } from "../lib/cache.ts";
import { gitCacheName } from "../lib/gitcache.ts";

const CLI = join(import.meta.dir, "cli.ts");
const ESCAPE = "\u001B";

// Every sandbox this file makes is removed after the test that made it,
// passing or failing: a `finally` inside one test would leave the rest. A
// sealed sandbox is unsealed first, or its own removal is denied too.
const sandboxes: string[] = [];

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "qsm-statusline-cli-"));
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of sandboxes.splice(0)) {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
});

const PAYLOAD = JSON.stringify({
  model: { display_name: "Opus" },
  context_window: { context_window_size: 200_000, used_percentage: 42 },
  workspace: { current_dir: "/home/user/project" },
});

function run(
  argv: string[],
  cacheDir: string,
  env: Record<string, string> = {},
): SpawnSyncReturns<string> {
  return spawnSync("bun", [CLI, ...argv], {
    encoding: "utf8",
    input: PAYLOAD,
    env: { ...process.env, QSM_STATUSLINE_CACHE_DIR: cacheDir, ...env },
  });
}

describe("help", () => {
  test("lists the three verbs qsm.json declares", () => {
    const result = run(["--help"], sandbox());
    expect(result.status).toBe(0);
    for (const verb of ["render", "refresh", "doctor"]) {
      expect(result.stdout).toContain(`  ${verb}`);
    }
  });
});

describe("render", () => {
  test("a cache directory nobody may write still prints the frame and exits 0", () => {
    // A full temporary directory, a read-only one, or one another account
    // owns. The git segment is the only casualty.
    const parent = sandbox();
    chmodSync(parent, 0o500);
    const result = run(["render", "--no-color"], join(parent, "cache"));
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines[0]).toContain("Opus");
    expect(lines[1]).toContain("context:");
    expect(lines[1]).not.toContain("git");
  });

  test("Nothing blocks the render", () => {
    const dir = sandbox();
    writeCache(
      dir,
      gitCacheName("/home/user/project"),
      JSON.stringify({ branch: "main", staged: 1, modified: 0, untracked: 2, conflicts: 0 }),
      Date.now(),
    );
    const result = run(["render", "--no-color"], dir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("git main: +1 ?2");
  });

  test("--json is read by a program, so it carries no escape sequences", () => {
    const dir = sandbox();
    writeCache(
      dir,
      gitCacheName("/home/user/project"),
      JSON.stringify({ branch: "main", staged: 0, modified: 0, untracked: 0, conflicts: 0 }),
      Date.now(),
    );
    const result = run(["render", "--json"], dir);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain(ESCAPE);
    const envelope: unknown = JSON.parse(result.stdout);
    expect(envelope).toMatchObject({ code: "ok", exit: 0 });
    const lines = isRecord(envelope) && isRecord(envelope.data) ? envelope.data.lines : undefined;
    expect(Array.isArray(lines) ? String(lines[1]) : "").toContain("git main: clean");
  });
});

describe("doctor", () => {
  test("reports and never gates: an unreadable settings file is still exit 0", () => {
    const dir = sandbox();
    const settings = join(dir, "settings.json");
    writeFileSync(settings, "{ not json\n");
    const result = run(["doctor", "--settings", settings, "--json"], dir);
    expect(result.status).toBe(0);
    const envelope: unknown = JSON.parse(result.stdout);
    expect(envelope).toMatchObject({ code: "ok", data: { state: { kind: "unreadable" } } });
    expect(envelope).toHaveProperty("data.entry");
  });

  test("settings that already run the renderer report wired and exit 0", () => {
    const dir = sandbox();
    const settings = join(dir, "settings.json");
    writeFileSync(
      settings,
      JSON.stringify({
        statusLine: { type: "command", command: "qsm-statusline render", padding: 1 },
      }),
    );
    const result = run(["doctor", "--settings", settings], dir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("the settings run qsm-statusline render");
  });
});

describe("a broken call", () => {
  test("is exit 2 on one line, which a blank status line never is", () => {
    const result = run(["render", "--nonsense"], sandbox());
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("usage:");
  });
});
