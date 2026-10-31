// The one architectural verdict the CLI verb, the gate runner and the stop
// hook all read, pure over a scored report; then the comparison itself over
// real git trees, scored by a fake sentrux on PATH that counts what it was
// handed, so nothing here needs the real checker installed.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import {
  compareStructure,
  isDownwardEdge,
  isTestFile,
  readLayers,
  type StructureResult,
  verdict,
} from "./structure.ts";

const CAUSES = {
  modularity: 0.6,
  equality: 0.5,
  redundancy: 0.9,
  depth: 0.8,
  acyclicity: 1,
};

function scored(
  shippedQuality: number,
  extra: Partial<
    Pick<Extract<StructureResult, { status: "scored" }>, "edgesAdded" | "violationsAdded">
  > = {},
): StructureResult {
  return {
    status: "scored",
    reference: { quality: 70, causes: CAUSES },
    shipped: { quality: shippedQuality, causes: CAUSES },
    edgesAdded: extra.edgesAdded ?? [],
    violationsAdded: extra.violationsAdded ?? [],
    testFiles: 0,
  };
}

describe("verdict", () => {
  test("passes when nothing was added and quality held", () => {
    const result = verdict(scored(70));

    expect(result.pass).toBe(true);
    expect(result.summary).toContain("structure quality: 70 -> 70");
  });

  test("passes a quality move small enough to be refactoring", () => {
    expect(verdict(scored(65)).pass).toBe(true);
  });

  test("A worse structural score", () => {
    const result = verdict(scored(40));

    expect(result.pass).toBe(false);
    expect(result.summary).toContain("quality fell 30");
    expect(result.detail.join("\n")).toContain("structure quality: 70 -> 40");
  });

  test("fails on a new cross-module edge whatever quality did", () => {
    const result = verdict(scored(72, { edgesAdded: ["a -> b (import)"] }));

    expect(result.pass).toBe(false);
    expect(result.summary).toContain("1 new cross-module edge(s)");
    expect(result.detail.join("\n")).toContain("a -> b (import)");
  });

  test("fails on a new rule violation", () => {
    const result = verdict(scored(70, { violationsAdded: ["no deep imports"] }));

    expect(result.pass).toBe(false);
    expect(result.summary).toContain("1 new rule violation(s)");
  });

  test("a tree with no ruleset is not scored, and does not fail", () => {
    const result = verdict({ status: "not-scored", reason: "rules file is absent" });

    expect(result.pass).toBe(true);
    expect(result.summary).toContain("not scored");
  });

  test("The architecture backing tool cannot be reached", () => {
    const result = verdict({
      status: "not-scored",
      reason: "shipped tree: sentrux printed no JSON",
      install: "install a qsm-patched sentrux",
    });

    expect(result.pass).toBe(false);
    expect(result.detail.join("\n")).toContain("install a qsm-patched sentrux");
  });
});

const RULES = `
[[layers]]
name = "lib"
paths = ["lib/*"]
order = 0

[[layers]]
name = "plugins"
paths = ["plugins/*"]
order = 1
`;

describe("isDownwardEdge", () => {
  const layers = readLayers(RULES);

  test("reads the layers rules.toml declares", () => {
    expect(layers.map((l) => l.name)).toEqual(["lib", "plugins"]);
  });

  test("a plugin reaching into root lib is the architecture's own shape, not a new edge", () => {
    expect(isDownwardEdge("plugins/qsm-x/scripts/cli.ts", "lib/cli-base.ts", layers)).toBe(true);
  });

  test("lib reaching up into a plugin is an edge worth failing on", () => {
    expect(isDownwardEdge("lib/a.ts", "plugins/qsm-x/lib/b.ts", layers)).toBe(false);
  });

  test("two plugins are one layer, so their edge is not downward", () => {
    expect(isDownwardEdge("plugins/qsm-a/x.ts", "plugins/qsm-b/y.ts", layers)).toBe(false);
  });

  test("a path outside every layer is never sanctioned", () => {
    expect(isDownwardEdge(".gates/x.ts", "lib/y.ts", layers)).toBe(false);
  });

  test("rules without layers sanction nothing", () => {
    expect(
      isDownwardEdge("plugins/a/x.ts", "lib/y.ts", readLayers("[constraints]\nmax_cycles = 0\n")),
    ).toBe(false);
  });
});

describe("isTestFile", () => {
  test.each([
    "lib/structure.test.ts",
    "src/app.spec.tsx",
    "src/__tests__/app.ts",
    "lib/fixtures/plugin-fixture/scripts/cli.ts",
    "pkg/test_driver.py",
    "pkg/driver_test.py",
    "tests/test_cli.py",
    "pkg/conftest.py",
    "src/Shop.Tests/OrderTests.cs",
    "crate/tests/integration.rs",
    "cmd/main_test.go",
    "cmd/testdata/input.go",
  ])("%s is a test file", (path) => {
    expect(isTestFile(path)).toBe(true);
  });

  test.each([
    "lib/structure.ts",
    ".gates/test-hooks.ts",
    "src/contest.py",
    "src/Shop/Order.cs",
    "crate/src/lib.rs",
  ])("%s is product code", (path) => {
    expect(isTestFile(path)).toBe(false);
  });
});

// A fake sentrux: quality is 1000 minus the files it was handed, and every
// handed file that imports something is one cross-module edge. So a test
// file that reached a scored tree would move the number and add an edge.
const FAKE_SENTRUX = `#!/bin/sh
cd "$3" || exit 1
files=$(git ls-files | wc -l)
edges=$(git ls-files | while read -r f; do
  if grep -q "import" "$f"; then printf '%s{"from":"%s","to":"lib/helper.ts","kind":"import"}' "$sep" "$f"; sep=","; fi
done)
c='{"score":0.5}'
printf '{"quality":%d,"cross_module_edges":[%s],"root_causes":{"modularity":%s,"equality":%s,"redundancy":%s,"depth":%s,"acyclicity":%s}}' $((1000 - files)) "$edges" "$c" "$c" "$c" "$c" "$c"
`;

function git(root: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function write(root: string, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), content);
  }
}

function commit(root: string): string {
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "change"]);
  return git(root, ["rev-parse", "HEAD"]);
}

/** A repository whose base commit already carries a test importing the
 * shared helper, so the reference side has a test to leave out too. */
function repo(): { root: string; base: string } {
  const root = sandboxDir("qsm-langdev-structure-");
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "qsm test"]);
  write(root, {
    ".sentrux/rules.toml": "[constraints]\nmax_cycles = 0\n",
    ".gitattributes": "lib/gen.ts linguist-generated=true\n",
    "lib/helper.ts": "export const helper = 1;\n",
    "lib/a.ts": "export const a = 1;\n",
    "lib/a.test.ts": 'import { helper } from "./helper.ts";\n',
  });
  return { root, base: commit(root) };
}

const TESTS_ONLY = {
  "lib/b.test.ts": 'import { helper } from "./helper.ts";\n',
  "lib/c.test.ts": 'import { helper } from "./helper.ts";\n',
  "lib/fixtures/sample.ts": 'import { helper } from "../helper.ts";\n',
};

/** Puts the fake sentrux first on PATH; the returned function restores PATH.
 * The fake's directory is a sandbox, removed after the test. */
function installFakeSentrux(): () => void {
  const originalPath = process.env.PATH;
  const bin = sandboxDir("qsm-langdev-structure-bin-");
  writeFileSync(join(bin, "sentrux"), FAKE_SENTRUX);
  chmodSync(join(bin, "sentrux"), 0o755);
  process.env.PATH = `${bin}:${originalPath ?? ""}`;
  return () => {
    process.env.PATH = originalPath;
  };
}

describe("compareStructure leaves test files out of both trees", () => {
  let restorePath = (): void => undefined;
  beforeEach(() => {
    restorePath = installFakeSentrux();
  });
  afterEach(() => {
    restorePath();
  });

  test("A change that touches only tests", async () => {
    const { root, base } = repo();
    write(root, { ...TESTS_ONLY, "lib/gen.ts": 'import { helper } from "./helper.ts";\n' });

    const result = await compareStructure(root, base, "index");
    const judged = verdict(result);

    expect(result.status).toBe("not-scored");
    expect(judged.pass).toBe(true);
    expect(judged.summary).toContain("no product file changed");
    expect(judged.summary).toContain("not scored");
  });

  test("New tests beside a product change", async () => {
    const { root, base } = repo();
    write(root, { ...TESTS_ONLY, "lib/b.ts": 'import { helper } from "./helper.ts";\n' });
    const head = commit(root);

    const result = await compareStructure(root, base, head);

    expect(result.status).toBe("scored");
    if (result.status !== "scored") {
      return;
    }
    // One product file more; the reference side's test is left out too.
    expect(result.shipped.quality - result.reference.quality).toBe(-1);
    expect(result.edgesAdded).toEqual(["lib/b.ts -> lib/helper.ts (import)"]);
    expect(result.testFiles).toBe(4);
    expect(verdict(result).detail).toContain("4 test file(s) left out of the score");
  });

  test("the staged product change is scored against the commit", async () => {
    const { root, base } = repo();
    write(root, { "lib/a.ts": 'import { helper } from "./helper.ts";\n' });
    git(root, ["add", "-A"]);

    const result = await compareStructure(root, base, "index");

    expect(result.status).toBe("scored");
    if (result.status === "scored") {
      expect(result.edgesAdded).toEqual(["lib/a.ts -> lib/helper.ts (import)"]);
      expect(result.testFiles).toBe(1);
    }
  });
});
