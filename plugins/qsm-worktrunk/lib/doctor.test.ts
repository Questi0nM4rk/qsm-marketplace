import { describe, expect, test } from "bun:test";
import { doctor, INSTALL_HINT, reportFor, UPGRADE_HINT } from "./doctor.ts";
import type { CommandResult, Runner } from "./wt.ts";

const SWITCH_HELP_NEW = "Options:\n  -c, --create\n  -b, --base <BASE>\n";
const SWITCH_HELP_OLD = "Options:\n  --no-cd\n  --format <FORMAT>\n";

/** A `wt` that answers each of the three probes with what it is told to. */
function fakeWt(answers: {
  version: CommandResult;
  switchHelp?: CommandResult;
  resolved?: CommandResult;
}): Runner {
  const missing: CommandResult = { exitCode: 127, stdout: "", stderr: "not found" };
  return (argv) => {
    if (argv[0] === "sh") {
      return Promise.resolve(answers.resolved ?? missing);
    }
    if (argv[1] === "switch") {
      return Promise.resolve(answers.switchHelp ?? missing);
    }
    return Promise.resolve(answers.version);
  };
}

const ok = (stdout: string): CommandResult => ({ exitCode: 0, stdout, stderr: "" });

describe("reportFor", () => {
  test("a version and the create flags mean healthy, and the report says which version", () => {
    const report = reportFor({ version: "wt v0.68.0", createReady: true, path: "/usr/bin/wt" });
    expect(report.healthy).toBe(true);
    expect(report.text).toContain("wt v0.68.0");
    expect(report.text).toContain("/usr/bin/wt");
  });

  test("no version means unhealthy, and the report says how to install it", () => {
    const report = reportFor({ version: null, createReady: false, path: null });
    expect(report.healthy).toBe(false);
    expect(report.text).toContain("not on PATH");
    expect(report.text).toContain(INSTALL_HINT);
  });

  test("a version without the create flags is unhealthy, and names the binary and the flags", () => {
    const report = reportFor({
      version: "wt 0.22.0",
      createReady: false,
      path: "/home/someone/.cargo/bin/wt",
    });
    expect(report.healthy).toBe(false);
    expect(report.text).toContain("wt 0.22.0");
    expect(report.text).toContain("/home/someone/.cargo/bin/wt");
    expect(report.text).toContain("--create");
    expect(report.text).toContain("--base");
    expect(report.text).toContain(UPGRADE_HINT);
  });

  test("a version under the floor is too old even when its help lists the flags", () => {
    const report = reportFor({ version: "wt 0.21.3", createReady: true, path: null });
    expect(report.healthy).toBe(false);
    expect(report.text).toContain("wt 0.21.3 is too old");
    expect(report.text).toContain("0.22.0 or newer");
  });

  test("a report with no resolved path still reads, naming the version alone", () => {
    const report = reportFor({ version: "wt 0.22.0", createReady: false, path: null });
    expect(report.text).toContain("wt 0.22.0 cannot create a workspace");
  });
});

describe("doctor", () => {
  test("Doctor check confirms the binary", async () => {
    const run = fakeWt({
      version: ok("wt v0.68.0\n"),
      switchHelp: ok(SWITCH_HELP_NEW),
      resolved: ok("/usr/bin/wt\n"),
    });
    const report = await doctor(run);
    expect(report.healthy).toBe(true);
    expect(report.text).toContain("v0.68.0");
  });

  test("a wt whose switch takes neither create flag is unhealthy and named", async () => {
    const run = fakeWt({
      version: ok("wt 0.22.0\n"),
      switchHelp: ok(SWITCH_HELP_OLD),
      resolved: ok("/home/someone/.cargo/bin/wt\n"),
    });
    const report = await doctor(run);
    expect(report.healthy).toBe(false);
    expect(report.text).toContain("cannot create a workspace");
    expect(report.text).toContain("/home/someone/.cargo/bin/wt");
  });

  test("half the flags is not enough: a switch with --create alone is still unhealthy", async () => {
    const run = fakeWt({
      version: ok("wt 0.40.0\n"),
      switchHelp: ok("Options:\n  --create\n"),
      resolved: ok("/usr/bin/wt\n"),
    });
    expect((await doctor(run)).healthy).toBe(false);
  });

  test("a version under the floor is unhealthy before its help is even read", async () => {
    const run = fakeWt({ version: ok("wt 0.5.4\n"), switchHelp: ok(SWITCH_HELP_NEW) });
    const report = await doctor(run);
    expect(report.healthy).toBe(false);
    expect(report.text).toContain("too old");
  });

  test("a wt that resolves but fails is unhealthy", async () => {
    const broken: Runner = () => Promise.resolve({ exitCode: 1, stdout: "", stderr: "boom" });
    expect((await doctor(broken)).healthy).toBe(false);
  });

  test("a wt that is not there at all is unhealthy", async () => {
    const missing: Runner = () =>
      Promise.resolve({ exitCode: 127, stdout: "", stderr: "not found" });
    const report = await doctor(missing);
    expect(report.healthy).toBe(false);
    expect(report.text).toContain("not on PATH");
  });

  test("a wt that refuses to say where it lives is still healthy when it can create", async () => {
    const run = fakeWt({ version: ok("wt v0.68.0\n"), switchHelp: ok(SWITCH_HELP_NEW) });
    expect((await doctor(run)).healthy).toBe(true);
  });
});
