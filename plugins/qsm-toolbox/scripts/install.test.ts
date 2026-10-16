// The plugin's one extra step: the third-party table, collapsed into a single
// install step. The base owns the binary and the completion and has its own
// tests; these describe a whole machine and read what the step decided.

import { expect, test } from "bun:test";
import type { InstallContext } from "../../../lib/install-contract.ts";
import { skipKey, TOOLS } from "../lib/catalog.ts";
import { tableStep } from "./install.ts";

/** A machine we describe entirely: what is on PATH, and what each run does.
 * Nothing here touches the real one, and no row of the catalog writes to disk
 * while every run is answered from the log. */
function fakeContext(options: {
  dryRun?: boolean;
  onPath?: readonly string[];
  env?: Record<string, string>;
  log?: string[];
}): InstallContext {
  const present = new Set(options.onPath ?? []);
  return {
    dryRun: options.dryRun ?? false,
    env: options.env ?? {},
    probe: (cmd) => present.has(cmd),
    run: (cmd, args) => {
      options.log?.push([cmd, ...args].join(" "));
      return 0;
    },
  };
}

test("Dry run", () => {
  const log: string[] = [];
  const step = tableStep(
    fakeContext({
      dryRun: true,
      onPath: ["bun", "uv", "pipx", "go", "curl", "pacman", "yay"],
      log,
    }),
  );
  expect(step.status).toBe("skipped");
  for (const tool of TOOLS) {
    expect(step.detail).toContain(`${tool.bin}: would `);
  }
  expect(log).toHaveLength(0);
});

test("the dry run predicts what the real run would decide, not the plan alone", () => {
  const step = tableStep(
    fakeContext({
      dryRun: true,
      onPath: ["jc", "uv", "pipx"],
      env: { [skipKey("semgrep")]: "1" },
    }),
  );
  expect(step.detail).toContain("jc: already on PATH");
  expect(step.detail).not.toContain("jc: would run");
  expect(step.detail).toContain(`semgrep: skipped by ${skipKey("semgrep")}`);
  expect(step.detail).toContain("mlr: would need go first");
});

test("the worst row decides the step, and the rest still ran", () => {
  const log: string[] = [];
  const step = tableStep(fakeContext({ onPath: ["bun", "uv", "pipx", "curl"], log }));
  // The go rows have no prerequisite on this machine; the bun rows installed.
  expect(step.status).toBe("missing-prereq");
  expect(step.detail).toContain("mlr: missing-prereq go is not on PATH");
  expect(log).toContain("bun add -g @ast-grep/cli");
});

test("the dry run line starts with would", () => {
  const step = tableStep(fakeContext({ dryRun: true, onPath: TOOLS.map((t) => t.bin) }));
  expect(step.detail).toStartWith("would ");
});

test("a table the environment skipped entirely did nothing, which is already", () => {
  const env = Object.fromEntries(TOOLS.map((t) => [skipKey(t.bin), "1"]));
  const step = tableStep(fakeContext({ env }));
  expect(step.status).toBe("already");
  expect(step.detail).toContain(`${skipKey(TOOLS[0]?.bin ?? "")}=1`);
});
