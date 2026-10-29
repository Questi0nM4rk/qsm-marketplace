import { expect, test } from "bun:test";
import { lstatSync, mkdirSync, readlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fakeInstall } from "../../../lib/fixtures/install.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { isFailure } from "../../../lib/install-contract.ts";
import { skipKey, TOOLS, type Tool } from "./catalog.ts";
import { installAll, installOne, worstStatus } from "./install.ts";

function row(bin: string): Tool {
  const tool = TOOLS.find((candidate) => candidate.bin === bin);
  if (tool === undefined) {
    throw new Error(`${bin} left the catalog`);
  }
  return tool;
}

const GO_TOOLS = ["mlr", "scc", "yq"];

test("One failure among twenty", () => {
  const { ctx, runs } = fakeInstall({ present: ["bun", "uv", "pipx", "curl"] });
  const outcomes = installAll(ctx);
  for (const bin of GO_TOOLS) {
    const outcome = outcomes.find((o) => o.bin === bin);
    expect(outcome?.status).toBe("missing-prereq");
    expect(outcome?.detail).toContain("go is not on PATH");
  }
  expect(outcomes).toHaveLength(TOOLS.length);
  expect(runs.map((run) => run.join(" "))).toContain("bun add -g @ast-grep/cli");
  expect(isFailure(worstStatus(outcomes))).toBe(true);
});

test("a tool already on PATH is reported, not reinstalled", () => {
  const [tool] = TOOLS;
  if (tool === undefined) {
    throw new Error("the catalog is empty");
  }
  const { ctx, runs } = fakeInstall({ present: [tool.bin, tool.prereq] });
  const outcome = installOne(tool, ctx);
  expect(outcome.status).toBe("already");
  expect(runs).toHaveLength(0);
});

test("the skip variable takes one tool out of the walk", () => {
  const [tool] = TOOLS;
  if (tool === undefined) {
    throw new Error("the catalog is empty");
  }
  const env = { [skipKey(tool.bin)]: "1" };
  const outcome = installOne(tool, fakeInstall({ present: [tool.prereq], env }).ctx);
  expect(outcome.status).toBe("skipped");
});

test("a tool a system package manager owns is suggested with its command", () => {
  const hurl = row("hurl");
  const { ctx, runs } = fakeInstall({ present: ["pacman"] });
  const outcome = installOne(hurl, ctx);
  expect(outcome.status).toBe("suggested");
  expect(outcome.detail).toContain(hurl.install);
  expect(outcome.detail).not.toContain("not on PATH");
  expect(runs).toHaveLength(0);
});

test("A suggestion on another system", () => {
  const hurl = row("hurl");
  const outcome = installOne(hurl, fakeInstall({ present: [] }).ctx);
  expect(outcome.status).toBe("suggested");
  expect(outcome.detail).toContain("pacman is not on PATH");
  expect(outcome.detail).toContain("brew install hurl");
  expect(installOne(row("usql"), fakeInstall({ present: [] }).ctx).detail).toContain(
    "go install github.com/xo/usql@latest",
  );
});

/** The go rows are the only ones that write to disk: `go install` lands in
 * GOBIN, and the row is linked from there into the bin directory. GOBIN is a
 * second sandbox directory, the bin directory is the fixture's, so the link is
 * real and the user's is untouched. */
function goMachine() {
  const gobin = sandboxDir("qsm-toolbox-gobin-");
  const { ctx, bin } = fakeInstall({ present: ["go"], env: { GOBIN: gobin } });
  mkdirSync(bin, { recursive: true });
  return { ctx, gobin, bin };
}

test("a go row is linked out of GOBIN into the bin directory", () => {
  const { ctx, gobin, bin } = goMachine();
  writeFileSync(join(gobin, "yq"), "#!/bin/sh\nexit 0\n");
  const outcome = installOne(row("yq"), ctx);
  expect(outcome.status).toBe("installed");
  expect(outcome.detail).toContain(`linked into ${bin}`);
  const target = join(bin, "yq");
  expect(lstatSync(target).isSymbolicLink()).toBe(true);
  expect(readlinkSync(target)).toBe(join(gobin, "yq"));
});

test("a file already sitting at the link target is kept and reported", () => {
  const { ctx, gobin, bin } = goMachine();
  writeFileSync(join(gobin, "scc"), "#!/bin/sh\nexit 0\n");
  writeFileSync(join(bin, "scc"), "an older copy\n");
  const outcome = installOne(row("scc"), ctx);
  expect(outcome.status).toBe("error");
  expect(outcome.detail).toContain("is not a link");
  expect(lstatSync(join(bin, "scc")).isSymbolicLink()).toBe(false);
});

test("go install that reported success and produced nothing is an error", () => {
  const { ctx, gobin } = goMachine();
  const outcome = installOne(row("mlr"), ctx);
  expect(outcome.status).toBe("error");
  expect(outcome.detail).toContain(join(gobin, "mlr"));
  expect(outcome.detail).toContain("is not there");
});

test("one tool's failed command does not stop the rest", () => {
  const { ctx } = fakeInstall({
    present: ["bun", "uv", "pipx", "curl"],
    exit: (_cmd, args) => (args.at(-1) === "@ast-grep/cli" ? 1 : 0),
  });
  const outcomes = installAll(ctx);
  expect(outcomes.find((o) => o.bin === "ast-grep")?.status).toBe("error");
  expect(outcomes.find((o) => o.bin === "jc")?.status).toBe("installed");
  expect(worstStatus(outcomes)).toBe("error");
});
