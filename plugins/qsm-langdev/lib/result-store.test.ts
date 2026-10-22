// What a stored result is keyed by, besides the content it scored.

import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { sandboxDir, writeIn } from "../../../lib/fixtures/sandbox.ts";
import { configHash } from "./result-store.ts";

/** The key of one tree for a checker that resolves imports, and for one that does not. */
function hashes(root: string, tree: string[]): { resolving: string; plain: string } {
  return {
    resolving: configHash(root, tree, ["package.json"], [], true),
    plain: configHash(root, tree, ["package.json"], [], false),
  };
}

type Keys = ReturnType<typeof hashes>;

function expectKeyMissOnlyWhenResolving(before: Keys, after: Keys): void {
  expect(after.resolving).not.toBe(before.resolving);
  expect(after.plain).toBe(before.plain);
}

test("a result scored before bun install is not the result after it, for a checker that resolves imports", () => {
  const root = sandboxDir("qsm-langdev-key-");
  writeIn(root, "package.json", "{}");
  const tree = ["package.json"];
  const before = hashes(root, tree);

  mkdirSync(join(root, "node_modules", "@scope", "dep"), { recursive: true });

  expectKeyMissOnlyWhenResolving(before, hashes(root, tree));
});

test("a lockfile-only bump is a miss for a checker that resolves imports, and not for one that does not", () => {
  const root = sandboxDir("qsm-langdev-key-");
  writeIn(root, "package.json", "{}");
  mkdirSync(join(root, "node_modules", "dep"), { recursive: true });
  writeIn(root, "bun.lock", "dep@1.0.0");
  const tree = ["package.json"];
  const before = hashes(root, tree);

  writeIn(root, "bun.lock", "dep@1.1.0");

  expectKeyMissOnlyWhenResolving(before, hashes(root, tree));
});
