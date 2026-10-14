// The backend is installed, not only named: a missing rbw runs cargo, and a
// failed cargo leaves the command to run by hand. The whole installer runs in
// a sandbox home, because the verdict is the base's upstream step.

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { InstallContext, Step } from "../../../lib/install-contract.ts";
import { install } from "./install.ts";

const sandbox = mkdtempSync(join(tmpdir(), "qsm-secrets-install-"));
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

function context(opts: {
  present: readonly string[];
  dryRun?: boolean;
  exit?: number;
  log?: string[];
}): InstallContext {
  return {
    dryRun: opts.dryRun ?? false,
    env: { HOME: sandbox, QSM_BIN_DIR: join(sandbox, "bin"), XDG_CONFIG_HOME: sandbox },
    probe: (cmd) => opts.present.includes(cmd),
    run: (cmd, args) => {
      opts.log?.push([cmd, ...args].join(" "));
      return opts.exit ?? 0;
    },
  };
}

function rbw(steps: readonly Step[]): Step | undefined {
  return steps.find((s) => s.name === "upstream rbw");
}

describe("install", () => {
  test("a missing rbw is installed with cargo", async () => {
    const log: string[] = [];
    const r = await install(context({ present: ["bun"], log }));
    expect(rbw(r.steps)).toMatchObject({ status: "installed" });
    expect(log).toContain("cargo install rbw");
  }, 60_000);

  test("a failed cargo install is an error carrying the command", async () => {
    const r = await install(context({ present: ["bun"], exit: 101 }));
    expect(r.status).toBe("error");
    expect(rbw(r.steps)?.detail).toContain("cargo install rbw");
  }, 60_000);

  test("a dry run names the cargo install and runs nothing", async () => {
    const log: string[] = [];
    const r = await install(context({ present: ["bun"], dryRun: true, log }));
    expect(r.detail).toContain("would run cargo install rbw");
    expect(log).toHaveLength(0);
  });
});

describe("install: the askpass pane and its links", () => {
  const bins = join(sandbox, "bin");
  const pane = join(sandbox, ".local", "share", "qsm", "askpass", "qml", "shell.qml");
  const links = ["sudo", "ssh", "git", "decide"].map((k) => join(bins, `qsm-askpass-${k}`));

  test("copies the pane and links each consumer, a second run changes nothing, a stale link goes", async () => {
    rmSync(dirname(pane), { recursive: true, force: true });
    const stale = join(bins, "qsm-askpass-old");
    symlinkSync("qsm-secrets", stale);
    const first = await install(context({ present: ["bun", "rbw"] }));
    expect(first.steps.find((s) => s.name === "askpass pane")?.status).toBe("installed");
    expect(existsSync(pane)).toBe(true);
    for (const link of links) {
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
    }
    expect(lstatSync(stale, { throwIfNoEntry: false })).toBeUndefined();
    expect(first.steps.find((s) => s.name === "link qsm-askpass-old")?.detail).toContain("removed");

    const second = await install(context({ present: ["bun", "rbw"] }));
    const askpass = second.steps.filter(
      (s) => s.name === "askpass pane" || s.name.startsWith("link "),
    );
    expect(askpass.every((s) => s.status === "already")).toBe(true);
  }, 60_000);

  test("a file that is not our link is reported and left alone", async () => {
    rmSync(links[0] as string);
    writeFileSync(links[0] as string, "mine");
    const r = await install(context({ present: ["bun", "rbw"] }));
    expect(r.steps.find((s) => s.name === "link qsm-askpass-sudo")?.status).toBe("error");
  }, 60_000);
});
