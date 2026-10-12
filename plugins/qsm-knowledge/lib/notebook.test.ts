import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { doctorReport, goBinPath, NOTEBOOK_BIN } from "./notebook.ts";

describe("doctorReport", () => {
  // Spec scenario: Binary present and responsive.
  test("both checks pass: ok, no findings", () => {
    expect(doctorReport({ onPath: true, answersHelp: true })).toEqual({
      bin: NOTEBOOK_BIN,
      ok: true,
      findings: [],
    });
  });

  // Spec scenario: Binary absent.
  test("absent binary: not ok, and the finding says so", () => {
    const report = doctorReport({ onPath: false, answersHelp: false });
    expect(report.ok).toBe(false);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toContain("is not on PATH");
  });

  test("present but silent on help: not ok, and the finding names that check", () => {
    const report = doctorReport({ onPath: true, answersHelp: false });
    expect(report.ok).toBe(false);
    expect(report.findings[0]).toContain("--help");
  });

  test("a binary off PATH is reported once, not twice", () => {
    // answersHelp cannot be true when the binary does not resolve; the report
    // must not add a second finding about help for the same absence.
    expect(doctorReport({ onPath: false, answersHelp: true }).findings).toHaveLength(1);
  });
});

describe("goBinPath", () => {
  test("GOBIN wins", () => {
    expect(goBinPath({ GOBIN: "/opt/gobin", GOPATH: "/ignored" }, "/home/u")).toBe(
      join("/opt/gobin", NOTEBOOK_BIN),
    );
  });

  test("the first GOPATH entry is used when GOBIN is unset", () => {
    expect(goBinPath({ GOPATH: "/first:/second" }, "/home/u")).toBe(
      join("/first", "bin", NOTEBOOK_BIN),
    );
  });

  test("neither set falls back to the home Go directory", () => {
    expect(goBinPath({}, "/home/u")).toBe(join("/home/u", "go", "bin", NOTEBOOK_BIN));
  });

  test("an empty GOBIN is not a directory named nothing", () => {
    expect(goBinPath({ GOBIN: "" }, "/home/u")).toBe(join("/home/u", "go", "bin", NOTEBOOK_BIN));
  });
});
