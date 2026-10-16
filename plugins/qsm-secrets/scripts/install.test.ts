// The backend is installed, not only named: a missing rbw runs cargo, and a
// failed cargo leaves the command to run by hand. The whole installer runs in
// a sandbox home, because the verdict is the base's upstream step.

import { beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import type { InstallContext, Step } from "../../../lib/install-contract.ts";
import { install } from "./install.ts";

let sandbox = "";
beforeEach(() => {
  sandbox = sandboxDir("qsm-secrets-install-");
});

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
  const bins = (): string => join(sandbox, "bin");
  const pane = (): string => join(sandbox, ".local", "share", "qsm", "askpass", "qml", "shell.qml");
  const links = (): string[] =>
    ["sudo", "ssh", "git", "decide"].map((k) => join(bins(), `qsm-askpass-${k}`));
  const palette = (): string => join(sandbox, "qsm-marketplace", "colors.json");

  test("copies the pane and links each consumer, a second run changes nothing, a stale link goes", async () => {
    rmSync(dirname(pane()), { recursive: true, force: true });
    mkdirSync(bins(), { recursive: true });
    const stale = join(bins(), "qsm-askpass-old");
    symlinkSync("qsm-secrets", stale);
    const first = await install(context({ present: ["bun", "rbw"] }));
    expect(first.steps.find((s) => s.name === "askpass pane")?.status).toBe("installed");
    expect(existsSync(pane())).toBe(true);
    for (const link of links()) {
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
    }
    expect(lstatSync(stale, { throwIfNoEntry: false })).toBeUndefined();
    expect(first.steps.find((s) => s.name === "link qsm-askpass-old")?.detail).toContain("removed");
    expect(readFileSync(palette(), "utf8")).toMatch(/"accent":\s*"#[0-9A-F]{6}"/);

    writeFileSync(palette(), '{"accent": "#FFFFFF"}');
    const second = await install(context({ present: ["bun", "rbw"] }));
    const askpass = second.steps.filter(
      (s) => s.name === "askpass pane" || s.name === "palette" || s.name.startsWith("link "),
    );
    expect(askpass.every((s) => s.status === "already")).toBe(true);
    expect(readFileSync(palette(), "utf8")).toBe('{"accent": "#FFFFFF"}');
  }, 60_000);

  test("a file that is not our link is reported and left alone", async () => {
    await install(context({ present: ["bun", "rbw"] }));
    const [first] = links();
    if (first === undefined) {
      throw new Error("no link to replace");
    }
    rmSync(first);
    writeFileSync(first, "mine");
    const r = await install(context({ present: ["bun", "rbw"] }));
    expect(r.steps.find((s) => s.name === "link qsm-askpass-sudo")?.status).toBe("error");
  }, 60_000);
});
