// `qsm-usage filter`, the verb the Bash tool.call hook asks: what the command output filter makes
// of a command. The two things it promises: it delegates to the filter when the filter is there,
// and it gets out of the way when it is not, because a missing optimisation turning into a blocked
// Bash call breaks every command in a session.
//
// Every sandbox this file makes is removed in afterEach, including after a failing test.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { FILTER_HOOK_ARGS, isFilterAnswer } from "../lib/filter.ts";
import { envelopeOf } from "./envelope.ts";

const CLI = resolve(import.meta.dir, "cli.ts");
// One directory for the whole file, removed after the last test, which stubs are written into
// under a name of their own.
const dir = mkdtempSync(join(tmpdir(), "qsm-usage-filter-"));
let stubs = 0;

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A stand-in for the filter binary: it records the stdin it was handed, prints `stdout`, writes
 * `stderr`, and answers with the exit code the test wants back. */
function stubFilter(exitCode: number, stdout = "", stderr = ""): { bin: string; capture: string } {
  stubs += 1;
  const bin = join(dir, `stub-filter-${stubs}`);
  const capture = join(dir, `stdin-${stubs}.txt`);
  writeFileSync(
    bin,
    `#!/usr/bin/env bash\ncat > '${capture}'\nprintf '%s' '${stdout}'\nprintf '%s' '${stderr}' >&2\nexit ${exitCode}\n`,
  );
  chmodSync(bin, 0o755);
  return { bin, capture };
}

interface Answer {
  command: string | null;
  deny: string | null;
}

function ask(filterBin: string, command: string, subagent = false): Answer {
  const args = ["filter", "--command", command, ...(subagent ? ["--subagent"] : []), "--json"];
  const ran = spawnSync("bun", [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, QSM_FILTER_BIN: filterBin },
  });
  const envelope = envelopeOf(ran.stdout);
  if (envelope.code !== "ok" || !isFilterAnswer(envelope.data)) {
    throw new Error(`qsm-usage filter: ${ran.stdout}${ran.stderr}`);
  }
  return envelope.data;
}

const REWRITE = '{"hookSpecificOutput":{"updatedInput":{"command":"rtk git status"}}}';
const NOTHING: Answer = { command: null, deny: null };

describe("qsm-usage filter", () => {
  test("Filter missing at call time", () => {
    expect(ask("qsm-usage-absent-filter", "echo hello")).toEqual(NOTHING);
  });

  test("answers with the command the filter rewrote it to", () => {
    const { bin, capture } = stubFilter(0, REWRITE);
    expect(ask(bin, "git status")).toEqual({ command: "rtk git status", deny: null });
    expect(readFileSync(capture, "utf8")).toContain('"command":"git status"');
    expect(readFileSync(capture, "utf8")).toContain('"tool_name":"Bash"');
  });

  test("a filter with nothing to rewrite leaves the command alone", () => {
    const { bin } = stubFilter(0);
    expect(ask(bin, "echo hello")).toEqual(NOTHING);
  });

  test("a filter exiting 2 denies the call with what it said", () => {
    const { bin } = stubFilter(2, "", "not here");
    expect(ask(bin, "echo hello")).toEqual({ command: null, deny: "not here" });
  });

  test("a filter that fails any other way leaves the command alone", () => {
    const { bin } = stubFilter(3, REWRITE);
    expect(ask(bin, "echo hello")).toEqual(NOTHING);
  });

  test("calls the filter with its own contract args, nothing guessed", () => {
    const bin = join(dir, "stub-filter-args");
    const argsFile = join(dir, "args.txt");
    writeFileSync(
      bin,
      `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > '${argsFile}'\ncat > /dev/null\nexit 0\n`,
    );
    chmodSync(bin, 0o755);

    ask(bin, "echo hello");

    expect(readFileSync(argsFile, "utf8").trim().split("\n")).toEqual([...FILTER_HOOK_ARGS]);
  });

  test("a subagent's git command never reaches the filter", () => {
    const { bin, capture } = stubFilter(0, REWRITE);
    expect(ask(bin, "git branch --show-current", true)).toEqual(NOTHING);
    expect(() => readFileSync(capture, "utf8")).toThrow();
  });

  test("a subagent's non-git command still reaches the filter", () => {
    const { bin, capture } = stubFilter(0);
    ask(bin, "echo hello", true);
    expect(readFileSync(capture, "utf8")).toContain('"command":"echo hello"');
  });

  test("a main-thread git command still reaches the filter", () => {
    const { bin, capture } = stubFilter(0);
    ask(bin, "git branch --show-current");
    expect(readFileSync(capture, "utf8")).toContain('"command":"git branch --show-current"');
  });
});
