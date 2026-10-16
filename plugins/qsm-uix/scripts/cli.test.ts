// The command as a caller meets it: what it prints, where it prints it, and
// which outcome it leaves behind. The contract this file holds is that a
// failure never puts a result on stdout, and that each cause of failure has
// its own outcome code, so a script can branch on it without reading prose.

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fakeBin } from "../../../lib/fixtures/bin.ts";
import { isolatedEnv, runBin } from "../../../lib/fixtures/cli.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

const CLI = resolve(import.meta.dir, "cli.ts");

interface Said {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

/** `path` pointed at an empty directory runs the command with no external
 * tool reachable, which is how their absence is staged without uninstalling
 * anything. An empty PATH string is not the same thing: the loader falls
 * back to a system default when it sees one. */
function callCli(
  args: string[],
  options: { path?: string; env?: Record<string, string> } = {},
): Said {
  const home = sandboxDir("qsm-uix-cli-");
  const path = options.path === undefined ? {} : { PATH: options.path };
  const env = isolatedEnv(home, { QSM_UIX_DIR: home, ...path, ...options.env });
  const done = runBin(CLI, args, { env });
  return { stdout: done.stdout, stderr: done.stderr, code: done.exit };
}

function envelope(said: Said): unknown {
  const parsed: unknown = JSON.parse(said.stdout);
  return parsed;
}

describe("an unrecognized verb", () => {
  const said = callCli(["sharpen"]);

  test("is a usage error, exit 2", () => {
    expect(said.code).toBe(2);
  });

  test("names the verb and lists the ones that exist", () => {
    expect(said.stderr).toContain("unknown verb sharpen");
    for (const name of ["screenshot", "crop", "diff", "burst", "contrast"]) {
      expect(said.stderr).toContain(name);
    }
  });

  test("prints no result", () => {
    expect(said.stdout).toBe("");
  });
});

describe("a missing external tool", () => {
  const said = callCli(["screenshot", "--output", "DP-1"], { path: sandboxDir("qsm-uix-cli-") });

  test("is missing, exit 4, distinct from a call written wrong", () => {
    expect(said.code).toBe(4);
  });

  test("names the tool, because an unnamed prerequisite is not actionable", () => {
    expect(said.stderr).toContain("grim");
  });

  test("prints no result", () => {
    expect(said.stdout).toBe("");
  });
});

describe("a call a verb cannot work from", () => {
  const said = callCli(["contrast", "shot.png", "--fg", "0,0"]);

  test("is a usage error, exit 2", () => {
    expect(said.code).toBe(2);
  });

  test("names the argument that is missing", () => {
    expect(said.stderr).toContain("--bg");
  });

  test("prints no result", () => {
    expect(said.stdout).toBe("");
  });

  test("a coordinate that is not X,Y is a usage error too", () => {
    const bad = callCli(["contrast", "shot.png", "--fg", "0", "--bg", "1,0"]);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain("--fg must be X,Y");
  });
});

describe("--help", () => {
  const said = callCli(["--help"]);

  test("succeeds", () => {
    expect(said.code).toBe(0);
  });

  test("lists every verb qsm.json declares", () => {
    for (const verb of [
      "screenshot",
      "crop",
      "diff",
      "burst",
      "pixel-sample",
      "contrast",
      "region-stats",
    ]) {
      expect(said.stdout).toContain(`  ${verb}`);
    }
  });
});

describe("a verb that succeeds", () => {
  test("prints its numbers in text mode and the whole result under --json", () => {
    const dir = sandboxDir("qsm-uix-cli-");
    const image = join(dir, "pair.png");
    spawnSync("magick", ["xc:#000000", "xc:#FFFFFF", "+append", image]);

    const plain = callCli(["contrast", image, "--fg", "0,0", "--bg", "1,0"]);
    expect(plain.code).toBe(0);
    expect(plain.stdout).toContain("21");

    const asJson = callCli(["contrast", image, "--fg", "0,0", "--bg", "1,0", "--json"]);
    expect(asJson.code).toBe(0);
    expect(asJson.stdout.trimEnd().split("\n")).toHaveLength(1);
    expect(envelope(asJson)).toMatchObject({
      code: "ok",
      exit: 0,
      data: { action: "contrast", ratio: 21 },
    });
  });
});

describe("a verb that fails on the image itself", () => {
  test("is failed, exit 1", () => {
    const dir = sandboxDir("qsm-uix-cli-");
    const said = callCli(["pixel-sample", join(dir, "absent.png"), "--at", "0,0"]);
    expect(said.code).toBe(1);
    expect(said.stdout).toBe("");
  });
});

/** A directory holding a stub for each named tool, to stand in for PATH. `gdbus` gets a script
 * that answers like AT-SPI: the bus address, the registry root, and a small tree. */
function pathWith(...tools: string[]): string {
  const dir = sandboxDir("qsm-uix-cli-");
  for (const tool of tools) {
    fakeBin(dir, tool, tool === "gdbus" ? GDBUS_STUB : "");
  }
  return dir;
}

/** Answers by the method it is asked: `GDBUS_STUB_DEAD=1` makes the registry call fail. */
const GDBUS_STUB = `case "$*" in
  *GetAddress*) echo "('unix:path=/stub',)" ;;
  *ChildCount*) [ -n "$GDBUS_STUB_DEAD" ] && { echo "no socket" >&2; exit 1; }; echo "(<1>,)" ;;
  *GetChildren*)
    case "$*" in
      *"--dest org.a11y.atspi.Registry"*) echo "([(':1.0', objectpath '/root'), (':1.7', '/root')],)" ;;
      *"--dest :1.7"*"--object-path /root"*) echo "([(':1.7', objectpath '/button')],)" ;;
      *) echo "(@a(so) [],)" ;;
    esac ;;
  *GetRoleName*)
    case "$*" in *"--object-path /button"*) echo "('push button',)" ;; *) echo "('application',)" ;; esac ;;
  *GetState*)
    case "$*" in *"--object-path /button"*) echo "([uint32 33556480, 0],)" ;; *) echo "([uint32 0, 0],)" ;; esac ;;
  *Name*)
    case "$*" in
      *"--dest :1.0"*) echo "(<'portal'>,)" ;;
      *"--object-path /button"*) echo "(<'Save'>,)" ;;
      *) echo "(<'demo'>,)" ;;
    esac ;;
esac
`;

const ALL = ["grim", "magick", "wtype", "gdbus"];

describe("doctor", () => {
  test("with every tool and a live AT-SPI bus is ok, exit 0", () => {
    const said = callCli(["doctor", "--json"], { path: pathWith(...ALL) });
    expect(said.code).toBe(0);
    expect(envelope(said)).toMatchObject({ code: "ok", data: { plugin: "qsm-uix" } });
  });

  test("with a tool absent is missing, exit 4, naming it and its install hint", () => {
    const said = callCli(["doctor"], { path: pathWith("grim", "wtype", "gdbus") });
    expect(said.code).toBe(4);
    expect(said.stderr).toContain("magick is not on PATH");
    expect(said.stderr).toContain("imagemagick");
  });

  test("without wtype is missing, exit 4, naming the pacman line", () => {
    const said = callCli(["doctor"], { path: pathWith("grim", "magick", "gdbus") });
    expect(said.code).toBe(4);
    expect(said.stderr).toContain("sudo pacman -S wtype");
  });

  test("with an AT-SPI address that does not answer is missing, naming the service restart", () => {
    const said = callCli(["doctor"], {
      path: pathWith(...ALL),
      env: { GDBUS_STUB_DEAD: "1" },
    });
    expect(said.code).toBe(4);
    expect(said.stderr).toContain("systemctl --user restart at-spi-dbus-bus.service");
  });
});

describe("a11y-tree", () => {
  test("prints each node with indent, role, name and states, filtered to the named app", () => {
    const said = callCli(["a11y-tree", "demo"], { path: pathWith("gdbus") });
    expect(said.code).toBe(0);
    expect(said.stdout).toBe('application "demo" []\n  push button "Save" [focusable,showing]\n');
  });

  test("with --json carries the tree as data, and the depth limit cuts it", () => {
    const said = callCli(["a11y-tree", "demo", "--depth", "0", "--json"], {
      path: pathWith("gdbus"),
    });
    expect(said.code).toBe(0);
    expect(envelope(said)).toMatchObject({ data: { tree: [{ children: [] }] } });
  });

  test("an app that is not on the bus is failed, exit 1, and nothing on stdout", () => {
    const said = callCli(["a11y-tree", "nothing-like-it"], { path: pathWith("gdbus") });
    expect(said.code).toBe(1);
    expect(said.stdout).toBe("");
  });

  test("a dead AT-SPI socket is missing, exit 4", () => {
    const said = callCli(["a11y-tree"], { path: pathWith("gdbus"), env: { GDBUS_STUB_DEAD: "1" } });
    expect(said.code).toBe(4);
  });
});
