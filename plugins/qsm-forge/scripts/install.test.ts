// gh and glab are alternatives: either one lets the plugin's first command
// run, so each alone is a suggestion, and only neither is a missing
// prerequisite. The whole installer runs here, in a sandbox home, because the
// verdict is the worst of the base's upstream steps and the extra step.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import type { InstallContext, Step } from "../../../lib/install-contract.ts";
import { install } from "./install.ts";

function context(present: readonly string[], dryRun = false): InstallContext {
  const sandbox = sandboxDir("qsm-forge-install-");
  return {
    dryRun,
    env: { HOME: sandbox, QSM_BIN_DIR: join(sandbox, "bin"), XDG_CONFIG_HOME: sandbox },
    probe: (cmd) => present.includes(cmd),
    run: () => 0,
  };
}

function step(steps: readonly Step[], name: string): Step | undefined {
  return steps.find((s) => s.name === name);
}

describe("install", () => {
  test("gh alone is enough: glab missing is only a suggestion", async () => {
    const r = await install(context(["bun", "gh"]));
    expect(r.status).toBe("suggested");
    expect(step(r.steps, "upstream glab")).toMatchObject({ status: "suggested" });
    expect(step(r.steps, "a forge CLI")).toMatchObject({ status: "already" });
  }, 60_000);

  test("neither forge CLI is a missing prerequisite", async () => {
    const r = await install(context(["bun"]));
    expect(r.status).toBe("missing-prereq");
    expect(step(r.steps, "upstream gh")).toMatchObject({ status: "suggested" });
    expect(step(r.steps, "a forge CLI")).toMatchObject({ status: "missing-prereq" });
  }, 60_000);

  test("a dry run says what it would check, each line starting with would", async () => {
    const r = await install(context(["bun"], true));
    expect(r.status).toBe("skipped");
    expect(r.detail).toContain("would check that gh or glab is on PATH");
    for (const s of r.steps) {
      expect(s.detail).toMatch(/^would |on PATH$/);
    }
  });
});
