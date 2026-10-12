// The driver inside the container is Python, because the stealth browser it
// drives has a Python API and nothing else. Its decisions are still ours to
// prove, so they are unit tested in Python and that suite runs from here:
// one command, `bun test`, covers both languages. The modules under test
// import only the standard library, so no image and no browser is needed;
// what this does need is python3 on the machine running the tests, and a
// machine without it fails here rather than passing on an untested driver.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const DRIVER = resolve(import.meta.dir, "..", "docker", "driver");

describe("the container driver", () => {
  test("its wait, script and block decisions pass their own suite", () => {
    const run = spawnSync("python3", ["-m", "unittest", "discover", "-s", ".", "-t", "."], {
      cwd: DRIVER,
      encoding: "utf8",
      // Bytecode would land in the source tree the image copies.
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    });
    if (run.status !== 0) {
      process.stderr.write(run.stderr ?? run.error?.message ?? "python3 did not run\n");
    }
    expect(run.status).toBe(0);
    expect(run.stderr).toContain("OK");
  });
});
