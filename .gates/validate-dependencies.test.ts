import { describe, expect, test } from "bun:test";
import { diffDependencies, specDependencies } from "./validate-dependencies.ts";

const SPEC = `### Requirement: Dependencies

x SHALL declare two.

- \`qsm-a\`: why a.
- \`qsm-b\`: why b.

### Requirement: Next

- \`qsm-c\`: not a dependency.
`;

describe("dependencies gate", () => {
  test("reads only the bullets of the Dependencies requirement", () => {
    expect(specDependencies(SPEC)).toEqual(["qsm-a", "qsm-b"]);
  });

  test("names both directions of a mismatch", () => {
    expect(diffDependencies(["qsm-a", "qsm-x"], ["qsm-a", "qsm-b"])).toEqual([
      "plugin.json names qsm-x, the spec gives it no reason",
      "the spec gives qsm-b a reason, plugin.json does not declare it",
    ]);
  });
});
