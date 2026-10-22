// What a git hook answers when a checker could not be measured: blocked,
// with its own code, never the failure a worse tree gets.
import { spawnSync } from "node:child_process";
import { expect, test } from "bun:test";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import type { Verdict } from "./compare.ts";
import { allowed, gatesCode, langdevOutcome, runGates } from "./gate-runner.ts";

const unmeasured: Verdict = {
  check: "semgrep-ts",
  pass: false,
  notMeasured: true,
  summary: "semgrep-ts: not measured: timed out after 60s; retry",
};
const worse: Verdict = { check: "oxlint", pass: false, summary: "oxlint: 0 -> 1" };

test("a checker not measured blocks the langdev gate with its cause, never as worse", () => {
  const outcome = langdevOutcome([unmeasured], "file sets: changed: 1 file");

  expect(outcome.status).toBe("blocked");
  const said = outcome.status === "blocked" ? [outcome.reason, ...outcome.remedy] : [];
  expect(said.join("\n")).toContain("semgrep-ts: not measured: timed out after 60s; retry");
  expect(said.join("\n")).not.toContain("WORSE");
});

test("a worse checker fails the langdev gate even beside one not measured", () => {
  expect(langdevOutcome([unmeasured, worse], "sizes").status).toBe("failed");
});

test("the hook's code: failed over blocked over ok", () => {
  const blocked = langdevOutcome([unmeasured], "sizes");
  const failed = langdevOutcome([worse], "sizes");
  const passed = langdevOutcome([], "sizes");

  expect(gatesCode([passed])).toBe("ok");
  expect(gatesCode([passed, blocked])).toBe("blocked");
  expect(gatesCode([blocked, failed])).toBe("failed");
});

test("A regression the author allows once", () => {
  const outcome = allowed(langdevOutcome([worse], "sizes"), "known");

  expect(outcome.status).toBe("pass");
  const said = outcome.status === "pass" ? (outcome.note ?? "") : "";
  expect(said).toContain("oxlint: 0 -> 1");
  expect(said).toContain("allowed once: known");
});

test("A check that could not run is not allowed", () => {
  const missing: Verdict = {
    check: "oxlint",
    pass: false,
    missing: true,
    summary: "oxlint missing",
  };

  expect(allowed(langdevOutcome([missing], "sizes"), "known").status).toBe("failed");
  expect(allowed(langdevOutcome([unmeasured], "sizes"), "known").status).toBe("blocked");
  expect(allowed(langdevOutcome([worse], "sizes")).status).toBe("failed");
});

test("a push whose every ref is skipped says why, per ref, instead of a bare pass", async () => {
  const root = sandboxDir("qsm-langdev-skip-");
  const git = (...args: string[]) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git(
    "-c",
    "user.email=t@example.com",
    "-c",
    "user.name=t",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "a",
  );
  const head = git("rev-parse", "HEAD").stdout.trim();
  const lines = `refs/heads/main ${head} refs/heads/main ${"0".repeat(40)}\n`;

  const outcomes = await runGates(root, "pre-push", ["langdev", "structure"], {
    pushLines: lines,
    remote: "/somewhere/empty.git",
  });

  for (const outcome of outcomes) {
    expect(outcome.status).toBe("skipped");
    expect(outcome.status === "skipped" ? outcome.reason : "").toContain(
      "refs/heads/main: this clone knows no default branch of '/somewhere/empty.git'",
    );
  }
});
