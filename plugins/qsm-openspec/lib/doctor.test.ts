import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doctorSections, generatedPrompts, INSTALL_COMMAND } from "./doctor.ts";

// Every sandbox this file makes is removed after the test that made it,
// passing or failing: a `finally` inside one test would leave the rest. A
// directory a test locked is unlocked first, or the removal cannot enter it.
const sandboxes: string[] = [];
const locked: string[] = [];

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "qsm-openspec-doctor-"));
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of locked.splice(0)) {
    chmodSync(dir, 0o755);
  }
  for (const dir of sandboxes.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeDir(root: string, ...parts: string[]): string {
  const dir = join(root, ...parts);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeFile(root: string, parts: string[], name: string): string {
  const path = join(makeDir(root, ...parts), name);
  writeFileSync(path, "generated\n");
  return path;
}

describe("doctorSections", () => {
  test("Doctor check after installation", () => {
    const sections = doctorSections({ root: sandbox(), version: "1.6.0" });
    expect(sections["openspec cli"]).toEqual(["version 1.6.0"]);
  });

  test("Doctor check with the binary missing", () => {
    const sections = doctorSections({ root: sandbox(), version: null });
    const cli = sections["openspec cli"] ?? [];
    expect(cli).toHaveLength(1);
    expect(cli[0]).toContain("not on PATH");
    expect(cli[0]).toContain(INSTALL_COMMAND);
    expect(cli.join("\n")).not.toContain("version 1");
  });

  test("A project someone initialised with upstream prompts", () => {
    const root = sandbox();
    const skill = makeDir(root, ".claude", "skills", "openspec-proposal");
    const sections = doctorSections({ root, version: "1.6.0" });
    const prompts = sections["upstream prompts"] ?? [];
    expect(prompts.join("\n")).toContain(skill);
    expect(prompts.join("\n")).toContain(`rm -rf ${skill}`);
    expect(prompts.join("\n")).toContain("--tools none");
  });

  test("says nothing about upstream prompts in a project that has none", () => {
    const root = sandbox();
    makeDir(root, ".claude", "skills", "spec-propose");
    expect(doctorSections({ root, version: "1.6.0" })["upstream prompts"]).toBeUndefined();
  });
});

describe("generatedPrompts", () => {
  test("finds openspec-* skill directories and opsx command files", () => {
    const root = sandbox();
    const skill = makeDir(root, ".claude", "skills", "openspec-apply");
    const command = makeFile(root, [".claude", "commands"], "opsx-archive.md");
    expect(generatedPrompts(root)).toEqual([command, skill].toSorted((a, b) => a.localeCompare(b)));
  });

  test("ignores an openspec- name that is not under a skills directory", () => {
    const root = sandbox();
    makeDir(root, "docs", "openspec-notes");
    makeFile(root, ["docs"], "opsx-notes.md");
    expect(generatedPrompts(root)).toEqual([]);
  });

  test("does not walk into node_modules", () => {
    const root = sandbox();
    makeDir(root, "node_modules", "pkg", "skills", "openspec-proposal");
    expect(generatedPrompts(root)).toEqual([]);
  });

  test("skips a directory it cannot read and still finds the rest", () => {
    const root = sandbox();
    const unreadable = makeDir(root, "private");
    chmodSync(unreadable, 0o000);
    locked.push(unreadable);
    const skill = makeDir(root, ".claude", "skills", "openspec-apply");
    expect(generatedPrompts(root)).toEqual([skill]);
    expect(doctorSections({ root, version: "1.6.0" })["openspec cli"]).toEqual(["version 1.6.0"]);
  });
});
