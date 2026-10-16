import { expect, test } from "bun:test";
import { lstatSync, readlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type InstallContext, isFailure } from "../../../lib/install-contract.ts";
import { skipKey, TOOLS, type Tool } from "./catalog.ts";
import { installAll, installOne, worstStatus } from "./install.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

function row(bin: string): Tool {
  const tool = TOOLS.find((candidate) => candidate.bin === bin);
  if (tool === undefined) {
    throw new Error(`${bin} left the catalog`);
  }
  return tool;
}

/** A machine we describe entirely: what is on PATH, and what each run does.
 * Nothing here touches the real one; the rows that write to disk get sandbox
 * directories through `sandboxDir`. */
function fakeContext(options: {
  onPath?: readonly string[];
  env?: Record<string, string>;
  failing?: readonly string[];
  log?: string[];
}): InstallContext {
  const present = new Set(options.onPath ?? []);
  const failing = new Set(options.failing ?? []);
  return {
    dryRun: false,
    env: options.env ?? {},
    probe: (cmd) => present.has(cmd),
    run: (cmd, args) => {
      options.log?.push([cmd, ...args].join(" "));
      return failing.has(args.at(-1) ?? "") ? 1 : 0;
    },
  };
}

const GO_TOOLS = ["mlr", "scc", "yq"];

test("One failure among twenty", () => {
  const log: string[] = [];
  const ctx = fakeContext({ onPath: ["bun", "uv", "pipx", "curl"], log });
  const outcomes = installAll(ctx);
  for (const bin of GO_TOOLS) {
    const outcome = outcomes.find((o) => o.bin === bin);
    expect(outcome?.status).toBe("missing-prereq");
    expect(outcome?.detail).toContain("go is not on PATH");
  }
  expect(outcomes).toHaveLength(TOOLS.length);
  expect(log).toContain("bun add -g @ast-grep/cli");
  expect(isFailure(worstStatus(outcomes))).toBe(true);
});

test("a tool already on PATH is reported, not reinstalled", () => {
  const log: string[] = [];
  const [tool] = TOOLS;
  if (tool === undefined) {
    throw new Error("the catalog is empty");
  }
  const outcome = installOne(tool, fakeContext({ onPath: [tool.bin, tool.prereq], log }));
  expect(outcome.status).toBe("already");
  expect(log).toHaveLength(0);
});

test("the skip variable takes one tool out of the walk", () => {
  const [tool] = TOOLS;
  if (tool === undefined) {
    throw new Error("the catalog is empty");
  }
  const env = { [skipKey(tool.bin)]: "1" };
  const outcome = installOne(tool, fakeContext({ onPath: [tool.prereq], env }));
  expect(outcome.status).toBe("skipped");
});

test("a tool a system package manager owns is suggested with its command", () => {
  const log: string[] = [];
  const hurl = row("hurl");
  const outcome = installOne(hurl, fakeContext({ onPath: ["pacman"], log }));
  expect(outcome.status).toBe("suggested");
  expect(outcome.detail).toContain(hurl.install);
  expect(outcome.detail).not.toContain("not on PATH");
  expect(log).toHaveLength(0);
});

test("A suggestion on another system", () => {
  const hurl = row("hurl");
  const outcome = installOne(hurl, fakeContext({ onPath: [] }));
  expect(outcome.status).toBe("suggested");
  expect(outcome.detail).toContain("pacman is not on PATH");
  expect(outcome.detail).toContain("brew install hurl");
  expect(installOne(row("usql"), fakeContext({ onPath: [] })).detail).toContain(
    "go install github.com/xo/usql@latest",
  );
});

/** The go rows are the only ones that write to disk: `go install` lands in
 * GOBIN, and the row is linked from there into the bin directory. Both are
 * sandbox directories here, so the link is real and the user's is untouched. */
function goContext(gobin: string, bin: string): InstallContext {
  return fakeContext({ onPath: ["go"], env: { GOBIN: gobin, QSM_BIN_DIR: bin } });
}

test("a go row is linked out of GOBIN into the bin directory", () => {
  const gobin = sandboxDir("qsm-toolbox-gobin-");
  const bin = sandboxDir("qsm-toolbox-bin-");
  writeFileSync(join(gobin, "yq"), "#!/bin/sh\nexit 0\n");
  const outcome = installOne(row("yq"), goContext(gobin, bin));
  expect(outcome.status).toBe("installed");
  expect(outcome.detail).toContain(`linked into ${bin}`);
  const target = join(bin, "yq");
  expect(lstatSync(target).isSymbolicLink()).toBe(true);
  expect(readlinkSync(target)).toBe(join(gobin, "yq"));
});

test("a file already sitting at the link target is kept and reported", () => {
  const gobin = sandboxDir("qsm-toolbox-gobin-replace-");
  const bin = sandboxDir("qsm-toolbox-bin-replace-");
  writeFileSync(join(gobin, "scc"), "#!/bin/sh\nexit 0\n");
  writeFileSync(join(bin, "scc"), "an older copy\n");
  const outcome = installOne(row("scc"), goContext(gobin, bin));
  expect(outcome.status).toBe("error");
  expect(outcome.detail).toContain("is not a link");
  expect(lstatSync(join(bin, "scc")).isSymbolicLink()).toBe(false);
});

test("go install that reported success and produced nothing is an error", () => {
  const gobin = sandboxDir("qsm-toolbox-gobin-empty-");
  const bin = sandboxDir("qsm-toolbox-bin-empty-");
  const outcome = installOne(row("mlr"), goContext(gobin, bin));
  expect(outcome.status).toBe("error");
  expect(outcome.detail).toContain(join(gobin, "mlr"));
  expect(outcome.detail).toContain("is not there");
});

test("one tool's failed command does not stop the rest", () => {
  const ctx = fakeContext({
    onPath: ["bun", "uv", "pipx", "curl"],
    failing: ["@ast-grep/cli"],
  });
  const outcomes = installAll(ctx);
  expect(outcomes.find((o) => o.bin === "ast-grep")?.status).toBe("error");
  expect(outcomes.find((o) => o.bin === "jc")?.status).toBe("installed");
  expect(worstStatus(outcomes)).toBe("error");
});
