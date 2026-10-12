// The generated module the binary ships against the profiles it came from,
// and what the TypeScript knip seed names as entry points.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { JSONC } from "bun";
import { readProfiles } from "../scripts/generate-profiles-data.ts";
import { PROFILE_DATA } from "./profiles-data.ts";

test("profiles-data.ts is what profiles/** generates; run scripts/generate-profiles-data.ts", () => {
  expect(PROFILE_DATA).toEqual(readProfiles(join(import.meta.dir, "..", "profiles")));
});

// knip reports whatever no entry reaches as dead: a hooks module is
// register.tsx, and a helper exported for its own test is reached only from
// that test.
describe.each(["strict", "general"])("the %s ts knip seed", (profile) => {
  test("names hooks modules and test files as entry points", () => {
    const seed = PROFILE_DATA[profile]?.ts?.find((file) => file.file === "knip.jsonc");
    const knip = JSONC.parse(seed?.content ?? "{}") as { entry?: string[] };

    expect(knip.entry).toEqual(expect.arrayContaining(["plugins/*/hooks/*.tsx", "**/*.test.ts"]));
  });
});
