// qsm-cockpit through its real surface: argv in, one envelope out, with a fake task tool on PATH.
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { bareRuntimePath, fakeBin } from "../../../lib/fixtures/bin.ts";
import { envelopeOf, isolatedEnv, runBin } from "../../../lib/fixtures/cli.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

const CLI = resolve(import.meta.dir, "cli.ts");

function withBr(body: string): Record<string, string> {
  const home = sandboxDir("qsm-cockpit-");
  const bin = sandboxDir("qsm-cockpit-bin-");
  fakeBin(bin, "br", body);
  return isolatedEnv(home, { PATH: `${bin}:${bareRuntimePath()}` });
}

test("tasks answers the id and title of each in-progress task", () => {
  const env = withBr(`echo '{"issues":[{"id":"a-1","title":"one"},{"id":2}]}'`);
  const run = runBin(CLI, ["tasks", "--json"], { env });
  expect(run.exit).toBe(0);
  expect(envelopeOf(run.stdout).data).toEqual([{ id: "a-1", title: "one" }]);
});

test("tasks is failed with the exit code when the task tool exits non-zero", () => {
  const run = runBin(CLI, ["tasks", "--json"], { env: withBr("echo no tracker >&2; exit 3") });
  const told = envelopeOf(run.stdout);
  expect(run.exit).toBe(told.exit);
  expect(told.code).toBe("failed");
  expect(told.message).toContain("(3)");
});

test("doctor is healthy with the task tool and missing without it", () => {
  expect(runBin(CLI, ["doctor"], { env: withBr("exit 0") }).exit).toBe(0);
  const bare = isolatedEnv(sandboxDir("qsm-cockpit-"), { PATH: bareRuntimePath() });
  const run = runBin(CLI, ["doctor", "--json"], { env: bare });
  expect(run.exit).toBe(4);
  expect(envelopeOf(run.stdout).code).toBe("missing");
});
