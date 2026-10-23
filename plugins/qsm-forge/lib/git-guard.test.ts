import { expect, test } from "bun:test";
import { gitGuard, pushesWithoutPull } from "./git-guard.ts";

test("the refused forms are refused, their correct forms pass", () => {
  const refused = [
    "gh pr create --title x \\\n  --body y",
    'gh pr create --body "uses `wt` now"',
    "git tag v1.2.0",
    "git tag v1.2.0 HEAD",
    "git pull --rebase",
    "git pull -r origin main",
  ];
  const allowed = [
    "gh pr create --title x --body-file /tmp/b.md",
    "gh pr view 3 --json body",
    'git tag -a v1.2.0 -m "release"',
    "git tag v1.2.0 -a -m x",
    "git tag -d v1",
    "git tag",
    "git tag --list",
    "git pull --rebase=merges",
    "git pull --ff-only",
  ];
  expect(refused.filter((c) => gitGuard(c) === null)).toEqual([]);
  expect(allowed.filter((c) => gitGuard(c) !== null)).toEqual([]);
});

test("a push asks the upstream unless the same call pulls with merges first", () => {
  expect(pushesWithoutPull("git push")).toBe(true);
  expect(pushesWithoutPull("git pull --rebase=merges -q && git push")).toBe(false);
  expect(pushesWithoutPull("git status")).toBe(false);
});
