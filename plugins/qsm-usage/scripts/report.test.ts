// `qsm-usage report` through the real binary: argv, stdout, stderr, exit,
// and the HTML file it does or does not write. Every sandbox comes from sandboxDir, which removes
// it after each test, a failing one included.

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { firstFinding } from "../lib/findings-fixture.ts";
import { envelopeOf } from "./envelope.ts";

const CLI = resolve(import.meta.dir, "cli.ts");

function sandboxFile(dir: string, name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

function run(args: string[]) {
  return spawnSync("bun", [CLI, ...args], { encoding: "utf8" });
}

function fiveTopicFindings(): Record<string, unknown> {
  const topicNames = [
    "unused-extensions",
    "duplicates",
    "claude-md-trim",
    "hooks-review",
    "permissions-tune",
  ];
  return {
    level: "standard",
    window: { sessions: 10, from: "2026-09-01T00:00:00Z", to: "2026-09-25T00:00:00Z" },
    topics: topicNames.map((topic, i) => ({
      topic,
      summary: `summary for ${topic}`,
      findings: [
        {
          id: `${topic}-1`,
          title: `finding for ${topic}`,
          evidence: "evidence text",
          change: { kind: "command", target: `command ${i}` },
          savingTokens: 100 * (i + 1),
          verdict: "remove",
          question: "cleanup",
          applied: false,
        },
      ],
    })),
  };
}

describe("qsm-usage report: the call", () => {
  test("--help lists the report verb", () => {
    const result = run(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("  report");
  });

  test("--out is required", () => {
    const dir = sandboxDir("qsm-usage-report-test-");
    const input = sandboxFile(dir, "findings.json", JSON.stringify(fiveTopicFindings()));
    expect(run(["report", input]).status).toBe(2);
  });

  // A missing input file
  test("a findings file that does not exist is missing, exit 4, and writes no file", () => {
    const dir = sandboxDir("qsm-usage-report-test-");
    const out = join(dir, "report.html");
    const result = run(["report", join(dir, "nonexistent.json"), "--out", out, "--json"]);
    expect(result.status).toBe(4);
    const envelope = envelopeOf(result.stdout);
    expect(envelope.code).toBe("missing");
    expect(envelope.message).toContain("nonexistent.json");
    expect(existsSync(out)).toBe(false);
  });
});

describe("qsm-usage report: validation and rendering", () => {
  // Scenario: Rendering a standard review
  test("Rendering a standard review", () => {
    const dir = sandboxDir("qsm-usage-report-test-");
    const input = sandboxFile(dir, "findings.json", JSON.stringify(fiveTopicFindings()));
    const out = join(dir, "report.html");
    const result = run(["report", input, "--out", out]);
    expect(result.status).toBe(0);
    expect(existsSync(out)).toBe(true);
    const html = readFileSync(out, "utf8");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
    expect(html).toContain("total saving: ~1500 tokens per session");
    for (const topic of [
      "unused-extensions",
      "duplicates",
      "claude-md-trim",
      "hooks-review",
      "permissions-tune",
    ]) {
      expect(html).toContain(topic);
    }
  });

  // Scenario: A finding without a saving
  test("A finding without a saving", () => {
    const dir = sandboxDir("qsm-usage-report-test-");
    const doc = fiveTopicFindings();
    firstFinding(doc).savingTokens = undefined;
    const input = sandboxFile(dir, "findings.json", JSON.stringify(doc));
    const out = join(dir, "report.html");
    const result = run(["report", input, "--out", out]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("topics[0].findings[0].savingTokens: required");
    expect(existsSync(out)).toBe(false);
  });
});
