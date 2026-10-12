// What `init` writes and, more importantly, what it refuses to write over.
// Every repository is a sandbox under the system temp directory, removed
// after each test whether the test passed or failed.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasScaffoldedConfig, scaffoldProfile } from "./profiles.ts";
import { PROFILE_DATA } from "./profiles-data.ts";

const sandboxes: string[] = [];

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "qsm-langdev-profiles-"));
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  while (sandboxes.length > 0) {
    rmSync(sandboxes.pop() ?? "", { recursive: true, force: true });
  }
});

const SHELL_CONFIG = ".shellcheckrc";

function shipped(profile: string): string {
  const entry = (PROFILE_DATA[profile]?.shell ?? []).find((file) => file.file === SHELL_CONFIG);
  if (entry === undefined) {
    throw new Error(`no ${SHELL_CONFIG} shipped for profile '${profile}'`);
  }
  return entry.content;
}

describe("scaffoldProfile", () => {
  test("A fresh repository", () => {
    const root = sandbox();

    const actions = scaffoldProfile(root, "general", ["shell"]);

    expect(actions.map((a) => a.status)).toEqual(["written"]);
    expect(readFileSync(join(root, SHELL_CONFIG), "utf8")).toBe(shipped("general"));
  });

  test("a second run reports the file as already the profile's own", () => {
    const root = sandbox();
    scaffoldProfile(root, "general", ["shell"]);

    const actions = scaffoldProfile(root, "general", ["shell"]);

    expect(actions.map((a) => a.status)).toEqual(["same"]);
  });

  test("A repository with its own config", () => {
    const root = sandbox();
    const ours = "# our own rules\ndisable=SC2086\n";
    writeFileSync(join(root, SHELL_CONFIG), ours);

    const actions = scaffoldProfile(root, "general", ["shell"]);

    expect(actions.map((a) => a.status)).toEqual(["kept"]);
    expect(readFileSync(join(root, SHELL_CONFIG), "utf8")).toBe(ours);
  });

  test("a config another profile seeded is kept, and named as that profile's", () => {
    const root = sandbox();
    writeFileSync(join(root, SHELL_CONFIG), shipped("strict"));

    const actions = scaffoldProfile(root, "general", ["shell"]);

    expect(actions[0]?.status).toBe("stale");
    expect(actions[0]?.from).toBe("strict");
    expect(readFileSync(join(root, SHELL_CONFIG), "utf8")).toBe(shipped("strict"));
  });

  test("an unknown profile fails and lists the known ones", () => {
    const root = sandbox();

    expect(() => scaffoldProfile(root, "nonesuch", ["shell"])).toThrow(/known: general, strict/);
  });
});

describe("hasScaffoldedConfig", () => {
  test("false until the language's config is in the repository, true after", () => {
    const root = sandbox();

    expect(hasScaffoldedConfig(root, "shell")).toBe(false);
    scaffoldProfile(root, "general", ["shell"]);
    expect(hasScaffoldedConfig(root, "shell")).toBe(true);
  });

  test("a configless language has nothing to scaffold and always passes", () => {
    expect(hasScaffoldedConfig(sandbox(), "fish")).toBe(true);
  });
});
