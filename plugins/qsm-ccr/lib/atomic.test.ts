import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { writeFileAtomic } from "./atomic.ts";

const modeOf = (path: string) => statSync(path).mode & 0o777;

describe("writeFileAtomic", () => {
  test("the new text lands, the file's mode is kept, and no temp file is left", () => {
    const dir = sandboxDir("qsm-atomic-");
    for (const mode of [0o600, 0o640, 0o644]) {
      const path = join(dir, `f${mode.toString(8)}`);
      writeFileSync(path, "old");
      chmodSync(path, mode);
      writeFileAtomic(path, "new");
      expect(readFileSync(path, "utf8")).toBe("new");
      expect(modeOf(path)).toBe(mode);
    }
    expect(readdirSync(dir).toSorted()).toEqual(["f600", "f640", "f644"]);
  });

  test("a file that does not exist yet is made at 0600, bytes included", () => {
    const dir = sandboxDir("qsm-atomic-");
    const path = join(dir, "new.bin");
    writeFileAtomic(path, new Uint8Array([0, 255, 7]));
    expect([...readFileSync(path)]).toEqual([0, 255, 7]);
    expect(modeOf(path)).toBe(0o600);
    expect(readdirSync(dir)).toEqual(["new.bin"]);
  });

  test("a symlink stays a symlink and its target is the file written", () => {
    const dir = sandboxDir("qsm-atomic-");
    mkdirSync(join(dir, "dotfiles"));
    const real = join(dir, "dotfiles", "config.toml");
    writeFileSync(real, "old");
    symlinkSync(real, join(dir, "config.toml"));
    writeFileAtomic(join(dir, "config.toml"), "new");
    expect(readFileSync(real, "utf8")).toBe("new");
    expect(readFileSync(join(dir, "config.toml"), "utf8")).toBe("new");
    expect(readdirSync(dir).toSorted()).toEqual(["config.toml", "dotfiles"]);
    expect(readdirSync(join(dir, "dotfiles"))).toEqual(["config.toml"]);
  });

  test("a write that throws after the temp file exists leaves the original and no temp file", () => {
    const dir = sandboxDir("qsm-atomic-");
    const path = join(dir, "settings.json");
    writeFileSync(path, "original");
    chmodSync(path, 0o600);
    // not text and not bytes: the write fails once the temp file is open
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the test passes the one value the types forbid
    expect(() => writeFileAtomic(path, 42 as unknown as string)).toThrow();
    expect(readFileSync(path, "utf8")).toBe("original");
    expect(modeOf(path)).toBe(0o600);
    expect(readdirSync(dir)).toEqual(["settings.json"]);
  });
});

/** A sandbox whose settings.json is a link into dotfiles/, as a dotfile manager leaves it. */
const linkedSettings = () => {
  const dir = sandboxDir("qsm-atomic-");
  mkdirSync(join(dir, "dotfiles"));
  symlinkSync("dotfiles/settings.json", join(dir, "settings.json"));
  return dir;
};

describe("writeFileAtomic through a dangling link", () => {
  test("a dangling symlink stays a link and its missing target is created", () => {
    const dir = linkedSettings();
    writeFileAtomic(join(dir, "settings.json"), "{}");
    expect(lstatSync(join(dir, "settings.json")).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(dir, "dotfiles", "settings.json"), "utf8")).toBe("{}");
    expect(modeOf(join(dir, "dotfiles", "settings.json"))).toBe(0o600);
    expect(readdirSync(join(dir, "dotfiles"))).toEqual(["settings.json"]);
    expect(readdirSync(dir).toSorted()).toEqual(["dotfiles", "settings.json"]);
  });

  test("a dangling link whose directory is missing throws and leaves the link", () => {
    const dir = sandboxDir("qsm-atomic-");
    symlinkSync("nowhere/settings.json", join(dir, "settings.json"));
    expect(() => writeFileAtomic(join(dir, "settings.json"), "{}")).toThrow();
    expect(lstatSync(join(dir, "settings.json")).isSymbolicLink()).toBe(true);
    expect(readdirSync(dir)).toEqual(["settings.json"]);
  });
});

describe("writeFileAtomic leftovers", () => {
  const stale = (path: string) => {
    writeFileSync(path, "half");
    const old = new Date(Date.now() - 3_600_000);
    utimesSync(path, old, old);
  };

  test("a temp file a killed run left is swept and named; a second run removes nothing", () => {
    const dir = sandboxDir("qsm-atomic-");
    const path = join(dir, "settings.json");
    const leftover = join(dir, ".settings.json.0123456789ab.tmp");
    stale(leftover);
    stale(join(dir, ".other.json.0123456789ab.tmp"));
    stale(join(dir, ".settings.json.nothex.tmp"));
    expect(writeFileAtomic(path, "one")).toEqual([leftover]);
    expect(writeFileAtomic(path, "two")).toEqual([]);
    expect(readdirSync(dir).toSorted()).toEqual([
      ".other.json.0123456789ab.tmp",
      ".settings.json.nothex.tmp",
      "settings.json",
    ]);
  });

  test("a temp file younger than a minute may be a running write and stays", () => {
    const dir = sandboxDir("qsm-atomic-");
    const running = join(dir, ".settings.json.0123456789ab.tmp");
    writeFileSync(running, "half");
    expect(writeFileAtomic(join(dir, "settings.json"), "x")).toEqual([]);
    expect(readFileSync(running, "utf8")).toBe("half");
  });

  test("through a link the sweep is in the target's directory", () => {
    const dir = linkedSettings();
    const inTarget = join(dir, "dotfiles", ".settings.json.0123456789ab.tmp");
    stale(inTarget);
    stale(join(dir, ".settings.json.0123456789ab.tmp"));
    expect(writeFileAtomic(join(dir, "settings.json"), "x")).toEqual([inTarget]);
  });
});
