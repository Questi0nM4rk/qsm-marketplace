// What a stored result is keyed by, besides the content it scored.

import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { configHash } from "./result-store.ts";

test("a result scored before bun install is not the result after it, for a checker that resolves imports", () => {
  const root = sandboxDir("qsm-langdev-key-");
  writeFileSync(join(root, "package.json"), "{}");
  const tree = ["package.json"];
  const before = configHash(root, tree, ["package.json"], [], true);
  const plainBefore = configHash(root, tree, ["package.json"], [], false);

  mkdirSync(join(root, "node_modules", "@scope", "dep"), { recursive: true });

  expect(configHash(root, tree, ["package.json"], [], true)).not.toBe(before);
  expect(configHash(root, tree, ["package.json"], [], false)).toBe(plainBefore);
});
