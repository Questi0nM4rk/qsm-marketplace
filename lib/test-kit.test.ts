import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { bareRuntimePath, cliShim, fakeBin } from "./fixtures/bin.ts";
import { dataOf, envelopeOf, isolatedEnv, runBin } from "./fixtures/cli.ts";
import { commit, git, repoWith } from "./fixtures/git.ts";
import { sandboxDir, writeIn } from "./fixtures/sandbox.ts";

test("a script run through runBin sees the sandbox as HOME and no inherited token", () => {
  const home = sandboxDir("qsm-kit-");
  writeIn(
    home,
    "env.ts",
    "console.log(JSON.stringify([process.env.HOME, process.env.GH_TOKEN ?? null]));",
  );
  process.env.GH_TOKEN = "from-the-parent";
  try {
    const r = runBin(join(home, "env.ts"), [], { env: isolatedEnv(home) });
    expect(JSON.parse(r.stdout)).toEqual([home, null]);
  } finally {
    delete process.env.GH_TOKEN;
  }
});

test("a fixture verb's envelope and data are read back, a fake binary and a shim run", () => {
  const dir = sandboxDir("qsm-kit-");
  const fixture = join(import.meta.dir, "fixtures/cli-fixture.ts");
  const r = runBin(fixture, ["echo", "bob", "--json"]);
  expect(envelopeOf(r.stdout).code).toBe("ok");
  expect(dataOf(r.stdout)).toMatchObject({ name: "bob" });
  fakeBin(dir, "hi", "echo hi");
  cliShim(dir, "qsm-fix", fixture);
  const env = isolatedEnv(dir, { PATH: `${dir}:${bareRuntimePath()}:/usr/bin:/bin` });
  const shim = spawnSync("qsm-fix", ["echo", "bob", "--json"], { encoding: "utf8", env });
  expect(dataOf(shim.stdout)).toMatchObject({ name: "bob" });
  expect(spawnSync("hi", { encoding: "utf8", env }).stdout).toBe("hi\n");
});

test("repoWith commits its files whatever the machine's git config says", () => {
  const { repo } = repoWith("qsm-kit-", { "src/a.ts": "export const a = 1;\n" });
  writeIn(repo, "b.txt", "b");
  commit(repo, "two");
  expect(git(repo, "log", "--format=%an %s")).toBe("t two\nt one");
});
