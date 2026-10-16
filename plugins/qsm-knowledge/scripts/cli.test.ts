// qsm-knowledge through its real surface: argv, stdout, stderr, exit. The notes
// live in a sandbox and the notebook binary is never reached.
import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bareRuntimePath } from "../../../lib/fixtures/bin.ts";
import { dataOf, envelopeOf, isolatedEnv, runBin } from "../../../lib/fixtures/cli.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { isRecord } from "../../../lib/outcome.ts";

const CLI = resolve(import.meta.dir, "cli.ts");

const GOOD = `---
title: Strangler fig
created: 2026-01-08
type: concept
tags: [migration, architecture]
---

# Strangler fig

The old system keeps serving until the new one takes each route.
See [[branch-by-abstraction]].
`;

function note(body: string): string {
  const dir = sandboxDir("qsm-knowledge-cli-");
  const path = join(dir, "note.md");
  writeFileSync(path, body);
  return path;
}

function run(argv: readonly string[], env: Record<string, string> = {}) {
  return runBin(CLI, argv, { env: isolatedEnv(sandboxDir("qsm-knowledge-home-"), env) });
}

/** The strings of a member of the envelope's data; absent, or not a list, is an empty list. */
function stringsOf(data: unknown, member: string): string[] {
  const list = isRecord(data) ? data[member] : undefined;
  return Array.isArray(list) ? list.filter((item) => typeof item === "string") : [];
}

describe("qsm-knowledge", () => {
  test("--help lists both verbs", () => {
    const r = run(["--help"]);
    expect(r.exit).toBe(0);
    expect(r.stdout).toContain("  validate");
    expect(r.stdout).toContain("  doctor");
  });

  test("validate with no note names the missing argument, exit 2", () => {
    const r = run(["validate"]);
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("missing required argument note");
  });

  test("validate with a second note is a usage error, exit 2", () => {
    const r = run(["validate", note(GOOD), "other.md"]);
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("unexpected argument other.md");
  });

  test("a good note is ok, exit 0, and its report is the data", () => {
    const r = run(["validate", note(GOOD), "--json"]);
    expect(r.exit).toBe(0);
    const envelope: unknown = JSON.parse(r.stdout);
    expect(envelope).toMatchObject({ code: "ok", data: { ok: true, errors: [] } });
  });

  test("a note with an error is failed, exit 1", () => {
    const r = run(["validate", note(GOOD.replace("type: concept", "type: journal")), "--json"]);
    expect(r.exit).toBe(1);
    expect(envelopeOf(r.stdout)).toMatchObject({ code: "failed" });
    expect(stringsOf(dataOf(r.stdout), "errors").length).toBeGreaterThan(0);
  });

  test("a note whose only finding is a warning stays ok and carries it", () => {
    const body = GOOD.replace("See [[branch-by-abstraction]].", "Nothing links out.");
    const r = run(["validate", note(body), "--json"]);
    expect(r.exit).toBe(0);
    const envelope = envelopeOf(r.stdout);
    expect(envelope).toMatchObject({ code: "ok" });
    expect(envelope.warnings.join(" ")).toContain("[[wikilink]]");
  });

  test("doctor with the notebook binary off PATH is missing, exit 4", () => {
    const r = run(["doctor", "--json"], { PATH: bareRuntimePath() });
    expect(r.exit).toBe(4);
    expect(envelopeOf(r.stdout)).toMatchObject({ code: "missing" });
    expect(stringsOf(dataOf(r.stdout), "findings").length).toBeGreaterThan(0);
  });
});
