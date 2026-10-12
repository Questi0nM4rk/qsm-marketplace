// What this install owes the user is br on PATH. The shared base probes it, so these tests pin
// what is declared: the tool, and the line to type, because no command here installs it.

import { describe, expect, test } from "bun:test";
import type { InstallContext } from "../../../lib/install-contract.ts";
import { install } from "./install.ts";

function context(present: readonly string[], log: string[] = []): InstallContext {
  return {
    dryRun: false,
    env: {},
    probe: (cmd) => present.includes(cmd),
    run: (cmd, args) => {
      log.push([cmd, ...args].join(" "));
      return 0;
    },
  };
}

describe("install", () => {
  test("br present: nothing to do", async () => {
    const r = await install(context(["bun", "br"]));
    expect(r.status).toBe("already");
  });

  test("br missing is a missing prerequisite named with its command, and nothing runs", async () => {
    const log: string[] = [];
    const r = await install(context(["bun"], log));
    const step = r.steps?.find((s) => s.name === "upstream br");
    expect(step).toMatchObject({ status: "missing-prereq" });
    expect(step?.detail).toContain("beads_rust");
    expect(log).toHaveLength(0);
  });
});
