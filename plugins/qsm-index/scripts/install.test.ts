// semble thickens an index but never gates one, so a missing one is a suggestion with its
// command. graphify gates it: one older than 0.8.34 is upgraded by the install, and "already" is
// the answer only for a new enough one. The whole installer runs in a sandbox home.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InstallContext } from "../../../lib/install-contract.ts";
import { SEMBLE } from "../lib/doctor.ts";
import { graphifyStep, install } from "./install.ts";

const sandbox = mkdtempSync(join(tmpdir(), "qsm-index-install-"));
afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function ctxOf(dryRun: boolean, exit = 0) {
  const ran: string[][] = [];
  const ctx: InstallContext = {
    dryRun,
    env: {},
    probe: () => true,
    run: (cmd, args) => {
      ran.push([cmd, ...args]);
      return exit;
    },
  };
  return { ctx, ran };
}

describe("graphify step", () => {
  test("a new enough graphify is already, and nothing runs", () => {
    const { ctx, ran } = ctxOf(false);
    expect(graphifyStep(ctx, () => "graphify 0.9.76")).toMatchObject({ status: "already" });
    expect(ran).toEqual([]);
  });

  test("an older graphify is upgraded with uv", () => {
    const { ctx, ran } = ctxOf(false);
    expect(graphifyStep(ctx, () => "graphify 0.8.21")).toMatchObject({ status: "installed" });
    expect(ran).toEqual([["uv", "tool", "install", "-U", "graphifyy"]]);
  });

  test("a failed upgrade is an error naming the command", () => {
    const { ctx } = ctxOf(false, 1);
    const step = graphifyStep(ctx, () => "");
    expect(step.status).toBe("error");
    expect(step.detail).toContain("uv tool install -U graphifyy");
  });

  test("a dry run plans the upgrade and runs nothing", () => {
    const { ctx, ran } = ctxOf(true);
    expect(graphifyStep(ctx, () => "graphify 0.8.21")).toMatchObject({ status: "skipped" });
    expect(ran).toEqual([]);
  });
});

describe("install", () => {
  test("semble missing is a suggestion carrying its install command", async () => {
    const r = await install({
      dryRun: true,
      env: { HOME: sandbox, QSM_BIN_DIR: join(sandbox, "bin"), XDG_CONFIG_HOME: sandbox },
      probe: (cmd) => cmd === "bun",
      run: () => 0,
    } satisfies InstallContext);
    const step = r.steps.find((s) => s.name === `upstream ${SEMBLE.bin}`);
    expect(step).toMatchObject({ status: "suggested" });
    expect(step?.detail).toContain(SEMBLE.install);
  }, 60_000);
});
