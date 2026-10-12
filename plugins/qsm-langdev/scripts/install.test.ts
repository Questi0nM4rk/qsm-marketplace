// The steps the install base cannot know: the structural checker and the
// semgrep login. A missing or unpatched sentrux is built through ctx.run; the
// probes of the sentrux on PATH and of the semgrep login are handed in, so no
// test depends on this machine's.
import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { type InstallContext, isFailure } from "../../../lib/install-contract.ts";
import type { StructuralCheckerStatus } from "../lib/compare.ts";
import { extraSteps, semgrepLoginStep, structuralChecker } from "./install.ts";

const SCRIPT = resolve(import.meta.dir, "build-sentrux.ts");
const COMMAND = `bun ${SCRIPT} install`;

function ctx(
  opts: { dryRun?: boolean; cargo?: boolean; exit?: number; log?: string[] } = {},
): InstallContext {
  return {
    dryRun: opts.dryRun ?? false,
    env: {},
    probe: (cmd) => cmd === "cargo" && (opts.cargo ?? true),
    run: (cmd, args) => {
      opts.log?.push([cmd, ...args].join(" "));
      return opts.exit ?? 0;
    },
  };
}

const patched = async (): Promise<StructuralCheckerStatus> => ({ present: true, patched: true });
const unpatched = async (): Promise<StructuralCheckerStatus> => ({ present: true, patched: false });
const absent = async (): Promise<StructuralCheckerStatus> => ({ present: false, patched: false });

describe("qsm-langdev structural checker step", () => {
  test("A compatible checker is already present", async () => {
    for (const dryRun of [false, true]) {
      const log: string[] = [];
      const step = await structuralChecker(ctx({ dryRun, log }), patched);
      expect(step).toMatchObject({
        status: "already",
        detail: "sentrux reports a qsm-patched version",
      });
      expect(log).toHaveLength(0);
    }
  });

  test("No compatible checker present", async () => {
    const log: string[] = [];
    const step = await structuralChecker(ctx({ log }), absent);
    expect(step.status).toBe("installed");
    expect(log).toEqual([COMMAND]);
  });

  test("an unpatched sentrux is rebuilt", async () => {
    const log: string[] = [];
    expect((await structuralChecker(ctx({ log }), unpatched)).status).toBe("installed");
    expect(log).toEqual([COMMAND]);
  });

  test("The build fails", async () => {
    const step = await structuralChecker(ctx({ exit: 101 }), absent);
    expect(step.status).toBe("error");
    expect(step.detail).toContain(COMMAND);
  });

  test("No cargo", async () => {
    const log: string[] = [];
    const step = await structuralChecker(ctx({ cargo: false, log }), absent);
    expect(step.status).toBe("missing-prereq");
    expect(step.detail).toContain("cargo");
    expect(log).toHaveLength(0);
  });

  test("a dry run names the build and runs nothing", async () => {
    const log: string[] = [];
    const step = await structuralChecker(ctx({ dryRun: true, log }), unpatched);
    expect(step.detail).toBe(`would build the qsm-patched sentrux: ${COMMAND}`);
    expect(log).toHaveLength(0);
  });

  test("a dry run without cargo says it would need it", async () => {
    const step = await structuralChecker(ctx({ dryRun: true, cargo: false }), absent);
    expect(step.detail).toStartWith("would need cargo");
  });
});

const WARNING = "semgrep is not logged in: run semgrep login to use qsm-langdev at its fullest";

/** cargo, and semgrep when `semgrep` is set, on PATH */
const withSemgrep = (semgrep: boolean, exit = 0): InstallContext => ({
  ...ctx({ exit }),
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
    const steps = await extraSteps(withSemgrep(true, 101), absent, () => "logged-out");
    expect(steps.map((s) => [s.name, s.status])).toEqual([
      ["structural checker", "error"],
      ["semgrep login", "suggested"],
    ]);
  });
});
