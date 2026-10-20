// qsm-web browserbox lifecycle through the real CLI against a controlled
// fake container runtime: a failed listing is failed rather than an empty
// list, stop --all names the instance it could not remove, and a start that
// never becomes ready reports its cleanup truthfully. No real container
// runs, no network, no source cache.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { envelopeOf, isolatedEnv } from "../../../lib/fixtures/cli.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

const PLUGIN = resolve(import.meta.dir, "..");
const CLI = join(PLUGIN, "scripts", "cli.ts");

/** A docker that answers from the FAKE_* environment: ps prints
 * FAKE_PS_OUTPUT or exits FAKE_PS_EXIT, exec (the readiness ping) exits
 * FAKE_PING_EXIT or answers ok, rm exits FAKE_RM_EXIT, image reports no
 * image, build and run succeed. */
function fakeRuntime(): string {
  const dir = sandboxDir("qsm-web-fake-docker-");
  writeFileSync(
    join(dir, "docker"),
    [
      "#!/bin/sh",
      'case "$1" in',
      '  ps) [ "${FAKE_PS_EXIT:-0}" -eq 0 ] || exit "$FAKE_PS_EXIT"; printf "%s" "${FAKE_PS_OUTPUT:-}"; exit 0 ;;',
      '  rm) exit "${FAKE_RM_EXIT:-0}" ;;',
      '  exec) [ "${FAKE_PING_EXIT:-0}" -eq 0 ] || exit "$FAKE_PING_EXIT"; printf \'{"ok":true}\\n\'; exit 0 ;;',
      "  image) exit 1 ;;",
      "  build|run) exit 0 ;;",
      "esac",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return dir;
}

/** The child's readiness loop waits on Atomics.wait; the fake runtime never
 * becomes ready, so the child skips the clock wait only — every ping, result
 * and status still goes through the real runtime command. */
function noWaitShim(): string {
  const file = join(sandboxDir("qsm-web-no-wait-"), "no-wait.ts");
  writeFileSync(
    file,
    'Object.defineProperty(Atomics, "wait", { value: () => 0, writable: true, configurable: true });\n',
  );
  return file;
}

/** The lifecycle runner: one outcome case becomes one child process. This
 * file owns the whole case-to-run mapping here — the argv, the extra FAKE_*
 * environment, and the preload decision — instead of restating a generic
 * argv/env spawner signature. */
function runOutcome(c: OutcomeCase) {
  const home = sandboxDir("qsm-web-bbox-home-");
  // A start is the one call whose child must preload the shim, and the
  // preload flag has to precede the script path, so this spawner stays.
  const preload = c.argv.includes("start") ? ["--preload", noWaitShim()] : [];
  const r = spawnSync(process.execPath, [...preload, CLI, "browserbox", ...c.argv], {
    encoding: "utf8",
    env: isolatedEnv(home, {
      PATH: `${fakeRuntime()}:${process.env.PATH ?? ""}`,
      QSM_MARKETPLACE: resolve(PLUGIN, "..", ".."),
      ...c.env,
    }),
  });
  return { exit: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
}

interface OutcomeCase {
  readonly title: string;
  readonly argv: readonly string[];
  readonly env: Record<string, string>;
  readonly exit: number;
  readonly says: readonly string[];
  readonly silent?: readonly string[];
}

describe("qsm-web browserbox lifecycle", () => {
  const outcomes: OutcomeCase[] = [
    {
      title: "a failed listing is failed, not an empty list",
      argv: ["ls", "--json"],
      env: { FAKE_PS_EXIT: "1" },
      exit: 1,
      says: ["listing", "exit 1"],
    },
    {
      title: "stop --all names the instance it could not remove",
      argv: ["stop", "--all", "--json"],
      env: { FAKE_PS_OUTPUT: "bbox-11000 11000\nbbox-11001 11001\n", FAKE_RM_EXIT: "1" },
      exit: 1,
      says: ["bbox-11000", "exit 1"],
      silent: ["stopped every instance"],
    },
    {
      title: "stop --all with every removal successful still claims all",
      argv: ["stop", "--all", "--json"],
      env: { FAKE_PS_OUTPUT: "bbox-11000 11000\n" },
      exit: 0,
      says: ["stopped every instance"],
    },
    {
      title: "a named stop succeeds",
      argv: ["stop", "bbox-11000", "--json"],
      env: {},
      exit: 0,
      says: [],
    },
    {
      title: "a named stop failure names the instance",
      argv: ["stop", "bbox-11000", "--json"],
      env: { FAKE_RM_EXIT: "1" },
      exit: 1,
      says: ["bbox-11000 could not be stopped"],
    },
    {
      title: "a start that never becomes ready says its container was removed",
      argv: ["start", "--json"],
      env: { FAKE_PING_EXIT: "1", FAKE_RM_EXIT: "0" },
      exit: 1,
      says: ["bbox-11000", "its container was removed"],
      silent: ["nothing was left running"],
    },
    {
      title: "a start whose removal failure names the leftover to check",
      argv: ["start", "--json"],
      env: { FAKE_PING_EXIT: "1", FAKE_RM_EXIT: "1" },
      exit: 1,
      says: ["bbox-11000", "its removal exited 1", "leftover"],
      silent: ["nothing was left running"],
    },
  ];
  test.each(outcomes)("$title", (c: OutcomeCase) => {
    const r = runOutcome(c);
    expect(r.exit).toBe(c.exit);
    const envelope = envelopeOf(r.stdout);
    expect(envelope.code).toBe(c.exit === 0 ? "ok" : "failed");
    // The message contract in one numbered place: slot 1 every phrase the
    // message had to say but did not, slot 2 every phrase it had to keep
    // quiet about but leaked. A failure shows both lists at once.
    expect([
      c.says.filter((phrase) => !envelope.message.includes(phrase)),
      (c.silent ?? []).filter((phrase) => envelope.message.includes(phrase)),
    ]).toEqual([[], []]);
  });
});
