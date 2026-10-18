// qsm-worktrunk's ahead verb through its real surface: argv in, one envelope out, in a real repo.
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { envelopeOf, isolatedEnv, runBin } from "../../../lib/fixtures/cli.ts";
import { git, repoWith } from "../../../lib/fixtures/git.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

const CLI = resolve(import.meta.dir, "cli.ts");

test("ahead names the branches with commits the working branch lacks, and only those", () => {
  const { repo } = repoWith("qsm-worktrunk-ahead-", { "a.txt": "a\n" });
  git(repo, "branch", "-M", "main");
  git(repo, "branch", "merged");
  git(repo, "switch", "-c", "agent-x");
  git(repo, "commit", "--allow-empty", "-m", "work");
  git(repo, "switch", "main");
  const env = isolatedEnv(sandboxDir("qsm-worktrunk-home-"));
  const run = runBin(CLI, ["ahead", "--json"], { env, cwd: repo });
  expect(run.exit).toBe(0);
  expect(envelopeOf(run.stdout).data).toEqual(["agent-x"]);
});

test("ahead outside a git repository answers none", () => {
  const env = isolatedEnv(sandboxDir("qsm-worktrunk-home-"));
  const run = runBin(CLI, ["ahead", "--json"], { env, cwd: sandboxDir("qsm-worktrunk-bare-") });
  expect(run.exit).toBe(0);
  expect(envelopeOf(run.stdout).data).toEqual([]);
});
