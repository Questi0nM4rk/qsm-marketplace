import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "bun";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { messageOf } from "../../../lib/outcome.ts";
import { withLock } from "./lock.ts";

const LOCK = join(import.meta.dir, "lock.ts");

/** A process that takes the lock, says so on stdout, and holds it until it is killed. */
function holder(dir: string) {
  const script = `import { withLock } from ${JSON.stringify(LOCK)};
await withLock(${JSON.stringify(dir)}, async () => { console.log("held"); await new Promise(() => {}); }, 5000);`;
  return spawn([process.execPath, "-e", script], {
    stdout: "pipe",
    stderr: "inherit",
  });
}

async function firstLine(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const { value } = await reader.read();
  reader.releaseLock();
  return new TextDecoder().decode(value).trim();
}

describe("the router lock", () => {
  test("a lock file naming a live process that holds nothing is no obstacle (pid reuse)", async () => {
    const dir = sandboxDir("qsm-ccr-lock-");
    writeFileSync(join(dir, "router.lock"), String(process.pid));
    expect(await withLock(dir, () => "taken", 500)).toBe("taken");
  });

  test("a live holder keeps it; killed with SIGKILL, it releases at once", async () => {
    const dir = sandboxDir("qsm-ccr-lock-");
    const child = holder(dir);
    try {
      expect(await firstLine(child.stdout)).toBe("held");
      // a blocked refusal naming the lock, never a crash
      const refusal = await withLock(dir, () => "taken", 300).catch((e: unknown) => e);
      expect(refusal).toMatchObject({ code: "blocked" });
      expect(messageOf(refusal)).toContain(
        `${join(dir, "router.lock")} is held by another qsm-ccr`,
      );
      child.kill("SIGKILL");
      await child.exited;
      expect(await withLock(dir, () => "taken", 1000)).toBe("taken");
    } finally {
      child.kill("SIGKILL");
    }
  });

  test("takers that all meet a dead holder's file never hold it at once", async () => {
    const dir = sandboxDir("qsm-ccr-lock-");
    writeFileSync(join(dir, "router.lock"), "999999999");
    const trace = join(dir, "trace");
    writeFileSync(trace, "");
    const script = `import { withLock } from ${JSON.stringify(LOCK)};
import { appendFileSync } from "node:fs";
await withLock(${JSON.stringify(dir)}, async () => {
  appendFileSync(${JSON.stringify(trace)}, "in\\n");
  await Bun.sleep(40);
  appendFileSync(${JSON.stringify(trace)}, "out\\n");
}, 20000);`;
    const takers = Array.from({ length: 6 }, () =>
      spawn([process.execPath, "-e", script], {
        stdout: "ignore",
        stderr: "inherit",
      }),
    );
    expect(await Promise.all(takers.map((t) => t.exited))).toEqual([0, 0, 0, 0, 0, 0]);
    const lines = readFileSync(trace, "utf8").trim().split("\n");
    expect(lines).toEqual(Array.from({ length: 6 }, () => ["in", "out"]).flat());
  });
});
