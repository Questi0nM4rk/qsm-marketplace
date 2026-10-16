// What `init` writes and, more importantly, what it refuses to write over.
// Every repository is a sandbox under the system temp directory, removed
// after each test whether the test passed or failed.

import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { hasScaffoldedConfig, scaffoldProfile } from "./profiles.ts";
import { PROFILE_DATA } from "./profiles-data.ts";

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
    const root = sandboxDir("qsm-langdev-profiles-");

    const actions = scaffoldProfile(root, "general", ["shell"]);

    expect(actions.map((a) => a.status)).toEqual(["written"]);
    expect(readFileSync(join(root, SHELL_CONFIG), "utf8")).toBe(shipped("general"));
  });

  test("a second run reports the file as already the profile's own", () => {
    const root = sandboxDir("qsm-langdev-profiles-");
    scaffoldProfile(root, "general", ["shell"]);

    const actions = scaffoldProfile(root, "general", ["shell"]);

    expect(actions.map((a) => a.status)).toEqual(["same"]);
  });

  test("A repository with its own config", () => {
    const root = sandboxDir("qsm-langdev-profiles-");
    const ours = "# our own rules\ndisable=SC2086\n";
    writeFileSync(join(root, SHELL_CONFIG), ours);

    const actions = scaffoldProfile(root, "general", ["shell"]);

    expect(actions.map((a) => a.status)).toEqual(["kept"]);
    expect(readFileSync(join(root, SHELL_CONFIG), "utf8")).toBe(ours);
  });

  test("a config another profile seeded is kept, and named as that profile's", () => {
    const root = sandboxDir("qsm-langdev-profiles-");
    writeFileSync(join(root, SHELL_CONFIG), shipped("strict"));

    const actions = scaffoldProfile(root, "general", ["shell"]);

    expect(actions[0]?.status).toBe("stale");
    expect(actions[0]?.from).toBe("strict");
    expect(readFileSync(join(root, SHELL_CONFIG), "utf8")).toBe(shipped("strict"));
  });

  test("an unknown profile fails and lists the known ones", () => {
    const root = sandboxDir("qsm-langdev-profiles-");

    expect(() => scaffoldProfile(root, "nonesuch", ["shell"])).toThrow(/known: general, strict/);
  });
});

describe("hasScaffoldedConfig", () => {
  test("false until the language's config is in the repository, true after", () => {
    const root = sandboxDir("qsm-langdev-profiles-");

    expect(hasScaffoldedConfig(root, "shell")).toBe(false);
    scaffoldProfile(root, "general", ["shell"]);
    expect(hasScaffoldedConfig(root, "shell")).toBe(true);
  });

  test("a configless language has nothing to scaffold and always passes", () => {
    expect(hasScaffoldedConfig(sandboxDir("qsm-langdev-profiles-"), "fish")).toBe(true);
  });
});
