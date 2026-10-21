// What a push is compared against: only what the remote being pushed to holds.

import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { type PushedRef, pushReference } from "./push.ts";

const ZERO = "0".repeat(40);

function git(root: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

/** A clone with two commits whose `origin` knows only the first, as after a clone that then moved on. */
function clone(): { root: string; first: string; second: string } {
  const root = sandboxDir("qsm-langdev-push-");
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  git(root, "commit", "-q", "--allow-empty", "-m", "first");
  const first = git(root, "rev-parse", "HEAD");
  git(root, "commit", "-q", "--allow-empty", "-m", "second");
  const second = git(root, "rev-parse", "HEAD");
  git(root, "update-ref", "refs/remotes/origin/main", first);
  git(root, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  return { root, first, second };
}

const newBranch = (localOid: string): PushedRef => ({
  localRef: "refs/heads/main",
  localOid,
  remoteRef: "refs/heads/main",
  remoteOid: ZERO,
});

test("a new branch is compared against the pushed remote's default branch", () => {
  const { root, first, second } = clone();

  expect(pushReference(root, newBranch(second), "origin")).toBe(first);
});

test("a first push to an empty remote has no reference, whatever another remote holds", () => {
  const { root, second } = clone();

  expect(pushReference(root, newBranch(second), "/somewhere/empty.git")).toBeNull();
});
