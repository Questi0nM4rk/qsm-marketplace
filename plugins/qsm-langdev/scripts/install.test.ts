// The steps the install base cannot know: the structural checker and the
// semgrep login. A missing or unpatched sentrux is built through the build handed in; the
// probes of the sentrux on PATH and of the semgrep login are handed in, so no
// test depends on this machine's.
import { describe, expect, test } from "bun:test";
import { type InstallContext, isFailure } from "../../../lib/install-contract.ts";
import type { StructuralCheckerStatus } from "../lib/compare.ts";
import { extraSteps, semgrepLoginStep, structuralChecker } from "./install.ts";

function ctx(opts: { dryRun?: boolean; cargo?: boolean } = {}): InstallContext {
  return {
    dryRun: opts.dryRun ?? false,
    env: { HOME: "/home/test" },
    probe: (cmd) => cmd === "cargo" && (opts.cargo ?? true),
    run: () => 0,
  };
}

/** A build that records the cache root it was handed, or throws. */
function builder(log: string[], failure?: string): (cacheRoot: string) => void {
  return (cacheRoot) => {
    log.push(cacheRoot);
    if (failure !== undefined) {
      throw new Error(failure);
    }
  };
}

const patched = (): Promise<StructuralCheckerStatus> =>
  Promise.resolve({ present: true, patched: true });
const unpatched = (): Promise<StructuralCheckerStatus> =>
  Promise.resolve({ present: true, patched: false });
const absent = (): Promise<StructuralCheckerStatus> =>
  Promise.resolve({ present: false, patched: false });

describe("qsm-langdev structural checker step", () => {
  test("A compatible checker is already present", async () => {
    for (const dryRun of [false, true]) {
      const log: string[] = [];
      const step = await structuralChecker(ctx({ dryRun }), patched, builder(log));
      expect(step).toMatchObject({
        status: "already",
        detail: "sentrux reports a qsm-patched version",
      });
      expect(log).toHaveLength(0);
    }
  });

  test("No compatible checker present", async () => {
    const log: string[] = [];
    const step = await structuralChecker(ctx(), absent, builder(log));
    expect(step.status).toBe("installed");
    expect(log).toEqual(["/home/test/.cache"]);
  });

  test("an unpatched sentrux is rebuilt", async () => {
    const log: string[] = [];
    expect((await structuralChecker(ctx(), unpatched, builder(log))).status).toBe("installed");
    expect(log).toEqual(["/home/test/.cache"]);
  });

  test("The build fails", async () => {
    const step = await structuralChecker(ctx(), absent, builder([], "cargo exited 101"));
    expect(step.status).toBe("error");
    expect(step.detail).toContain("cargo exited 101");
  });

  test("No cargo", async () => {
    const log: string[] = [];
    const step = await structuralChecker(ctx({ cargo: false }), absent, builder(log));
    expect(step.status).toBe("missing-prereq");
    expect(step.detail).toContain("cargo");
    expect(log).toHaveLength(0);
  });

  test("a dry run names the build and runs nothing", async () => {
    const log: string[] = [];
    const step = await structuralChecker(ctx({ dryRun: true }), unpatched, builder(log));
    expect(step.detail).toBe("would build the qsm-patched sentrux with cargo");
    expect(log).toHaveLength(0);
  });

  test("a dry run without cargo says it would need it", async () => {
    const step = await structuralChecker(ctx({ dryRun: true, cargo: false }), absent);
    expect(step.detail).toStartWith("would need cargo");
  });
});

const WARNING = "semgrep is not logged in: run semgrep login to use qsm-langdev at its fullest";

/** cargo, and semgrep when `semgrep` is set, on PATH */
const withSemgrep = (semgrep: boolean): InstallContext => ({
  ...ctx(),
  probe: (cmd) => cmd === "cargo" || (cmd === "semgrep" && semgrep),
});

describe("qsm-langdev semgrep login step", () => {
  test("logged out is its own suggested step carrying the warning, never a failure", () => {
    const step = semgrepLoginStep(withSemgrep(true), () => "logged-out");
    expect(step).toEqual({ name: "semgrep login", status: "suggested", detail: WARNING });
    expect(isFailure(step?.status ?? "error")).toBe(false);
  });

  test("an unknown login state is said, not taken for logged out", () => {
    const step = semgrepLoginStep(withSemgrep(true), () => "unknown");
    expect(step?.status).toBe("suggested");
    expect(step?.detail).toStartWith("semgrep login state is unknown");
  });

  test("logged in is no step", () => {
    expect(semgrepLoginStep(withSemgrep(true), () => "logged-in")).toBeNull();
  });

  test("no semgrep on PATH asks nothing and is no step: that is the missing-binary path", () => {
    let asked = false;
    const step = semgrepLoginStep(withSemgrep(false), () => {
      asked = true;
      return "logged-out";
    });
    expect(step).toBeNull();
    expect(asked).toBe(false);
  });
});

describe("qsm-langdev extra steps", () => {
  test("logged out adds the login step after the checker and leaves the checker alone", async () => {
    const steps = await extraSteps(withSemgrep(true), patched, () => "logged-out");
    expect(steps).toEqual([
      {
        name: "structural checker",
        status: "already",
        detail: "sentrux reports a qsm-patched version",
      },
      { name: "semgrep login", status: "suggested", detail: WARNING },
    ]);
  });

  test("logged in is the checker step alone", async () => {
    const steps = await extraSteps(withSemgrep(true), patched, () => "logged-in");
    expect(steps.map((s) => s.name)).toEqual(["structural checker"]);
  });

  test("no semgrep is the checker step alone", async () => {
    const steps = await extraSteps(withSemgrep(false), patched, () => "logged-out");
    expect(steps.map((s) => s.name)).toEqual(["structural checker"]);
  });

  test("a failed build stays failed and the login step still appears", async () => {
    const steps = await extraSteps(
      withSemgrep(true),
      absent,
      () => "logged-out",
      builder([], "cargo exited 101"),
    );
    expect(steps.map((s) => [s.name, s.status])).toEqual([
      ["structural checker", "error"],
      ["semgrep login", "suggested"],
    ]);
  });
});
