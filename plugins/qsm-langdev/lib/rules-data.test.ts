// Our own semgrep rules: the generated module the binary ships against the
// rules/ files it came from, and every rule proven by its fixture through
// semgrep's own test runner.

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { which } from "bun";
import { readOwnRules } from "../scripts/generate-rules-data.ts";
import { OWN_RULES } from "./rules-data.ts";

const RULES_DIR = join(import.meta.dir, "..", "rules");
const SEMGREP = which("semgrep");
const SEMGREP_LIMIT_MS = 60_000;

test("rules-data.ts is what rules/*.yaml generates; run scripts/generate-rules-data.ts", () => {
  expect(OWN_RULES).toEqual(readOwnRules(RULES_DIR));
});

test("an empty rules file is refused, never shipped for semgrep to run with no rules", () => {
  const dir = mkdtempSync(join(tmpdir(), "qsm-langdev-own-rules-"));
  try {
    writeFileSync(join(dir, "bash.yaml"), "# nothing yet\n---\nrules: []\n");

    expect(() => readOwnRules(dir)).toThrow("bash.yaml holds no rule");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe.each(Object.keys(OWN_RULES))("own %s rules", (language) => {
  const rulesFile = join(RULES_DIR, `${language}.yaml`);
  const fixture = join(RULES_DIR, `${language}.fixture`);
  const ids = [...readFileSync(rulesFile, "utf8").matchAll(/^\s*- id: (\S+)$/gm)].map(
    (match) => match[1] as string,
  );

  test("every rule has a fixture line it must flag and one it must not", () => {
    const text = existsSync(fixture) ? readFileSync(fixture, "utf8") : "";

    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(text).toContain(`# ruleid: ${id}\n`);
      expect(text).toContain(`# ok: ${id}\n`);
    }
  });

  // Skipped, and bun says so, on a machine without semgrep. A real semgrep
  // takes about 4 s idle, past bun's 5 s default once the suite loads the
  // machine, so the test names its own limit and semgrep's run stops first.
  describe.skipIf(SEMGREP === null)("with semgrep on PATH", () => {
    test(
      "semgrep --test passes every rule over its fixture",
      () => {
        const run = spawnSync(
          SEMGREP as string,
          ["--test", "--json", "--config", rulesFile, fixture],
          { encoding: "utf8", timeout: SEMGREP_LIMIT_MS },
        );
        expect(run.error?.message, run.stderr).toBeUndefined();
        const report = JSON.parse(run.stdout) as {
          results: Record<string, { checks: Record<string, { passed: boolean }> }>;
        };
        const checks = Object.values(report.results).flatMap((file) => Object.entries(file.checks));

        expect(checks.map(([id, check]) => [id, check.passed])).toEqual(
          ids.map((id) => [id, true]),
        );
        expect(run.status).toBe(0);
      },
      SEMGREP_LIMIT_MS + 10_000,
    );
  });
});
