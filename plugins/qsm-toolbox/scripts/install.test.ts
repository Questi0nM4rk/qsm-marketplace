// The plugin's one extra step: the third-party table, collapsed into a single
// install step. The base owns the binary and the completion and has its own
// tests; these describe a whole machine and read what the step decided.

import { expect, test } from "bun:test";
import { fakeInstall } from "../../../lib/fixtures/install.ts";
import { skipKey, TOOLS } from "../lib/catalog.ts";
import { tableStep } from "./install.ts";

test("Dry run", () => {
  const { ctx, runs } = fakeInstall({
    dryRun: true,
    present: ["bun", "uv", "pipx", "go", "curl", "pacman", "yay"],
  });
  const step = tableStep(ctx);
  expect(step.status).toBe("skipped");
  for (const tool of TOOLS) {
    expect(step.detail).toContain(`${tool.bin}: would `);
  }
  expect(runs).toHaveLength(0);
});

test("the dry run predicts what the real run would decide, not the plan alone", () => {
  const step = tableStep(
    fakeInstall({
      dryRun: true,
      present: ["jc", "uv", "pipx"],
      env: { [skipKey("semgrep")]: "1" },
    }).ctx,
  );
  expect(step.detail).toContain("jc: already on PATH");
  expect(step.detail).not.toContain("jc: would run");
  expect(step.detail).toContain(`semgrep: skipped by ${skipKey("semgrep")}`);
  expect(step.detail).toContain("mlr: would need go first");
});

test("the worst row decides the step, and the rest still ran", () => {
  const { ctx, runs } = fakeInstall({ present: ["bun", "uv", "pipx", "curl"] });
  const step = tableStep(ctx);
  // The go rows have no prerequisite on this machine; the bun rows installed.
  expect(step.status).toBe("missing-prereq");
  expect(step.detail).toContain("mlr: missing-prereq go is not on PATH");
  expect(runs.map((run) => run.join(" "))).toContain("bun add -g @ast-grep/cli");
});

test("the dry run line starts with would", () => {
  const step = tableStep(fakeInstall({ dryRun: true, present: TOOLS.map((t) => t.bin) }).ctx);
  expect(step.detail).toStartWith("would ");
});

test("a table the environment skipped entirely did nothing, which is already", () => {
  const env = Object.fromEntries(TOOLS.map((t) => [skipKey(t.bin), "1"]));
  const step = tableStep(fakeInstall({ env }).ctx);
  expect(step.status).toBe("already");
  expect(step.detail).toContain(`${skipKey(TOOLS[0]?.bin ?? "")}=1`);
});
