import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const KIT = join(import.meta.dir, "hooks-kit.ts");

/** Runs a script that imports the kit, as a compiled hook would run, with `stdin` piped in. */
function hook(script: string, stdin: string): { code: number; stdout: string; stderr: string } {
  const code = `import { readHookEvent, runMain } from ${JSON.stringify(KIT)};\n${script}`;
  const r = spawnSync("bun", ["-e", code], { input: stdin, encoding: "utf8" });
  return { code: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
}

describe("readHookEvent", () => {
  test("the stdin payload, parsed", () => {
    const r = hook("console.log(JSON.stringify(readHookEvent()));", '{"cwd":"/repo"}');
    expect(JSON.parse(r.stdout)).toEqual({ cwd: "/repo" });
  });

  test("null on a missing or malformed payload", () => {
    expect(hook("console.log(readHookEvent());", "").stdout.trim()).toBe("null");
    expect(hook("console.log(readHookEvent());", "{not json").stdout.trim()).toBe("null");
  });
});

describe("runMain with a body that fails or succeeds", () => {
  test("a body that throws is logged and the hook still exits 0", () => {
    const r = hook(
      'await runMain(true, async () => { throw new Error("boom"); }, (m) => console.error(m));',
      "",
    );
    expect(r.code).toBe(0);
    expect(r.stderr.trim()).toBe("unexpected error: boom");
  });

  test("a body that succeeds exits 0 with its own output", () => {
    const r = hook('await runMain(true, async () => { console.log("done"); }, () => {});', "");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("done");
  });
});

describe("runMain", () => {
  test("a hook file run as the entry point runs its body", () => {
    const r = hook('await runMain(true, () => console.log("ran"), () => {});', "");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("ran");
  });

  test("a hook file imported by a test runs nothing", () => {
    const r = hook('await runMain(false, () => console.log("ran"), () => {});', "");
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });
});
