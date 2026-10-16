// qsm-knowledge through its real surface: argv, stdout, stderr, exit. The notes
// live in a sandbox and the notebook binary is never reached.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isRecord } from "../../../lib/outcome.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

const CLI = resolve(import.meta.dir, "cli.ts");
/** Only the runtime itself: the notebook binary is never on it. */
const BARE_PATH = dirname(process.execPath);

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
  const home = sandboxDir("qsm-knowledge-home-");
  const r = spawnSync("bun", [CLI, ...argv], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", HOME: home, ...env },
  });
  return { exit: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** The --json envelope as a record; anything else is a defect in the CLI. */
function envelopeOf(stdout: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(stdout);
  if (!isRecord(parsed)) {
    throw new Error(`stdout is not a JSON envelope: ${stdout}`);
  }
  return parsed;
}

/** The envelope's data member as a record. */
function dataOf(stdout: string): Record<string, unknown> {
  const data = envelopeOf(stdout).data;
  if (!isRecord(data)) {
    throw new Error(`the envelope has no data record: ${stdout}`);
  }
  return data;
}

/** The strings of a list member; absent, or not a list, is an empty list. */
function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
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
    expect(stringsOf(dataOf(r.stdout).errors).length).toBeGreaterThan(0);
  });

  test("a note whose only finding is a warning stays ok and carries it", () => {
    const body = GOOD.replace("See [[branch-by-abstraction]].", "Nothing links out.");
    const r = run(["validate", note(body), "--json"]);
    expect(r.exit).toBe(0);
    const envelope = envelopeOf(r.stdout);
    expect(envelope).toMatchObject({ code: "ok" });
    expect(stringsOf(envelope.warnings).join(" ")).toContain("[[wikilink]]");
  });

  test("doctor with the notebook binary off PATH is missing, exit 4", () => {
    const r = run(["doctor", "--json"], { PATH: BARE_PATH });
    expect(r.exit).toBe(4);
    expect(envelopeOf(r.stdout)).toMatchObject({ code: "missing" });
    expect(stringsOf(dataOf(r.stdout).findings).length).toBeGreaterThan(0);
  });
});
