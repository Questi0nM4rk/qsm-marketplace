// Health is the one binary and a graphify new enough to keep the direction of an edge. semble
// appears in the report so the reader knows what an index would be missing, and never moves the
// verdict.

import { describe, expect, test } from "bun:test";
import { doctor, formatReport } from "./doctor.ts";
import type { RunResult } from "./run.ts";

/** Every command answers, `absent` ones with ENOENT, and `graphify --version` with `version`. */
function runnerMissing(absent: string[] = [], version = "0.9.76") {
  return (command: string, args: readonly string[] = []): RunResult => {
    if (absent.includes(command)) {
      return { ok: false, stdout: "", detail: `${command} is not available: ENOENT` };
    }
    const stdout = args[0] === "--version" ? `graphify ${version}\n` : "usage: ...\n";
    return { ok: true, stdout, detail: "" };
  };
}

describe("Doctor check", () => {
  test("Doctor check", () => {
    const report = doctor(runnerMissing());
    expect(report.healthy).toBe(true);
    expect(report.required.map((check) => check.name)).toEqual(["qsm-index", "graphify"]);
  });

  test("a binary that is there but fails its help is unhealthy", () => {
    expect(doctor(runnerMissing(["qsm-index"])).healthy).toBe(false);
  });

  test("Binary missing", () => {
    const report = doctor(runnerMissing(["qsm-index"]));
    expect(formatReport(report)).toContain("qsm-index: qsm-index is not available");
  });
});

describe("graphify", () => {
  test.each([
    ["0.8.21 is older than 0.8.34", runnerMissing([], "0.8.21")],
    ["an absent graphify", runnerMissing(["graphify"])],
  ])("%s is unhealthy and names the upgrade command", (_name, run) => {
    const report = doctor(run);
    expect(report.healthy).toBe(false);
    expect(formatReport(report)).toContain("uv tool install -U graphifyy");
  });

  test.each(["0.8.34", "0.10.0"])("%s is new enough", (version) => {
    expect(doctor(runnerMissing([], version)).healthy).toBe(true);
  });
});

describe("the external tools", () => {
  test("semble absent is reported and does not move the verdict", () => {
    const report = doctor(runnerMissing(["semble"]));
    expect(report.healthy).toBe(true);
    expect(report.optional.every((check) => !check.ok)).toBe(true);
    expect(formatReport(report)).toContain("uv tool install semble");
  });
});
