// qsm-toolbox through its real surface: the binary's argv, stdout, stderr,
// exit. The lib tests hold the table and the probes; these prove the process
// a skill or a shell actually runs.

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

const CLI = join(import.meta.dir, "cli.ts");

function run(argv: readonly string[]) {
  const home = sandboxDir("qsm-toolbox-cli-");
  const r = spawnSync("bun", [CLI, ...argv], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", HOME: home, XDG_CONFIG_HOME: join(home, "c") },
  });
  return { exit: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("qsm-toolbox cli", () => {
  test("--help lists the verb qsm.json declares", () => {
    const r = run(["--help"]);
    expect(r.exit).toBe(0);
    expect(r.stdout).toContain("  doctor");
  });

  test("an unknown flag is a usage error, exit 2", () => {
    const r = run(["doctor", "--nonsense"]);
    expect(r.exit).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("usage:");
  });

  test("doctor reports every row and never gates, exit 0", () => {
    const r = run(["doctor"]);
    expect(r.exit).toBe(0);
    expect(r.stdout).toMatch(/^(present|missing)\s{2}\S+/m);
  }, 60_000);

  test("doctor --json is one envelope whose data is the table", () => {
    const r = run(["doctor", "--json"]);
    expect(r.exit).toBe(0);
    const envelope = JSON.parse(r.stdout) as {
      code: string;
      exit: number;
      data: { bin: string; present: boolean; install: string }[];
    };
    expect(envelope).toMatchObject({ code: "ok", exit: 0 });
    expect(envelope.data.length).toBeGreaterThan(0);
    expect(envelope.data[0]).toHaveProperty("bin");
    expect(envelope.data[0]).toHaveProperty("install");
  }, 60_000);
});
